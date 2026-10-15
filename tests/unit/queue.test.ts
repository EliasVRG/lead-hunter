import { describe, it, expect, vi, beforeEach } from "vitest";

const added: {
  queue: string;
  name: string;
  data: unknown;
  opts?: { jobId?: string; repeat?: { every: number } };
}[] = [];

/** Job pré-existente que `getJob` devolve, e se ele foi removido. */
const existingJob: { state: string | null; removed: boolean } = { state: null, removed: false };

/** Agendamentos repetíveis "no Redis", e os que foram removidos. */
const repeatables: { name: string; key: string; every: string; next?: number }[] = [];
const removedKeys: string[] = [];

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(public name: string) {}
    async add(name: string, data: unknown, opts?: { jobId?: string; repeat?: { every: number } }) {
      added.push({ queue: this.name, name, data, opts });
      if (opts?.repeat) {
        // O BullMQ deriva a chave de nome + opções de repeat e faz upsert:
        // adicionar o mesmo agendamento duas vezes não cria um segundo.
        const key = `${name}::${opts.repeat.every}`;
        const entry = {
          name,
          key,
          every: String(opts.repeat.every),
          next: Date.now() + opts.repeat.every,
        };
        const existing = repeatables.findIndex((r) => r.key === key);
        if (existing >= 0) repeatables[existing] = entry;
        else repeatables.push(entry);
      }
      return { id: opts?.jobId ?? "generated" };
    }
    async getJob() {
      if (existingJob.state === null) return undefined;
      return {
        getState: async () => existingJob.state,
        remove: async () => {
          existingJob.removed = true;
        },
      };
    }
    async close() {}
    async getJobCounts() {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
    async getRepeatableJobs() {
      return repeatables;
    }
    async removeRepeatableByKey(key: string) {
      removedKeys.push(key);
      const i = repeatables.findIndex((r) => r.key === key);
      if (i >= 0) repeatables.splice(i, 1);
      return true;
    }
  },
  Worker: class {
    on() {
      return this;
    }
  },
}));

const {
  DISCOVERY_SCHEDULER_NAME,
  QUEUE_NAMES,
  discoveryScheduleState,
  enqueueDiscovery,
  enqueueProposal,
  enqueueTriage,
  ensureDiscoverySchedule,
  jobIdFor,
  queueCounts,
} = await import("@lead-hunter/queue");

const schedule = (overrides = {}) => ({
  enabled: true,
  everyMs: 600_000,
  options: { maxAgeHours: 3, maxPages: 2, maxListings: 20 },
  ...overrides,
});

describe("queue topology", () => {
  it("exposes one queue per pipeline stage", () => {
    expect(QUEUE_NAMES).toEqual({
      discovery: "discovery",
      triage: "triage",
      proposal: "proposal",
    });
  });

  it("reports counts for every queue", async () => {
    const counts = await queueCounts();
    expect(Object.keys(counts).sort()).toEqual(["discovery", "proposal", "triage"]);
  });
});

describe("enqueue helpers", () => {
  it("routes a discovery run to the discovery queue without a fixed id", async () => {
    added.length = 0;
    await enqueueDiscovery({ query: "node", maxListings: 5 });

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      queue: "discovery",
      data: { query: "node", maxListings: 5 },
    });
    // Rodadas de descoberta repetidas são legítimas, então não há dedupe por id.
    expect(added[0].opts?.jobId).toBeUndefined();
  });

  it("dedupes triage and proposal per job posting so the same job is not scored twice", async () => {
    added.length = 0;
    await enqueueTriage({ platform: "99freelas", externalId: "791466" });
    await enqueueProposal({ platform: "99freelas", externalId: "791466", score: 80 });

    expect(added.map((entry) => [entry.queue, entry.opts?.jobId])).toEqual([
      ["triage", "99freelas__791466"],
      ["proposal", "99freelas__791466"],
    ]);
  });

  it("builds a job id without ':' — BullMQ rejects it in custom ids", () => {
    expect(jobIdFor({ platform: "99freelas", externalId: "791466" })).toBe("99freelas__791466");
    expect(jobIdFor({ platform: "99freelas", externalId: "791466" })).not.toContain(":");
  });
});

/**
 * Com `removeOnFail: false`, um job falho mantém o `jobId` ocupado e todo `add`
 * seguinte é descartado em silêncio. Sem a limpeza abaixo, uma vaga que falhou
 * na triagem nunca mais seria reprocessada por uma nova rodada de descoberta.
 */
describe("deduped enqueue", () => {
  const ref = { platform: "99freelas", externalId: "791466" };

  it("drops a failed job with the same id so the posting can be reprocessed", async () => {
    added.length = 0;
    existingJob.state = "failed";
    existingJob.removed = false;

    await enqueueTriage(ref);

    expect(existingJob.removed).toBe(true);
    expect(added).toHaveLength(1);
  });

  it("drops a completed job with the same id", async () => {
    added.length = 0;
    existingJob.state = "completed";
    existingJob.removed = false;

    await enqueueTriage(ref);

    expect(existingJob.removed).toBe(true);
    expect(added).toHaveLength(1);
  });

  it("keeps a still-pending job — that duplicate is the one worth discarding", async () => {
    added.length = 0;
    existingJob.state = "waiting";
    existingJob.removed = false;

    await enqueueTriage(ref);

    expect(existingJob.removed).toBe(false);
  });

  it("adds straight away when nothing occupies the id", async () => {
    added.length = 0;
    existingJob.state = null;

    await enqueueProposal({ ...ref, score: 80 });

    expect(added).toHaveLength(1);
  });
});

/**
 * O BullMQ identifica um agendamento por nome + opções de repeat. Se o registro
 * no boot não convergir, cada restart somaria um agendador no Redis e o
 * scraping se multiplicaria em silêncio — por isso estes testes.
 */
describe("ensureDiscoverySchedule", () => {
  beforeEach(() => {
    repeatables.length = 0;
    removedKeys.length = 0;
    added.length = 0;
  });

  it("registers the recurring job when enabled", async () => {
    const state = await ensureDiscoverySchedule(schedule());

    expect(added).toHaveLength(1);
    expect(added[0].name).toBe(DISCOVERY_SCHEDULER_NAME);
    expect(added[0].opts?.repeat).toEqual({ every: 600_000 });
    expect(state.enabled).toBe(true);
  });

  it("passes the configured discovery options to the scheduled job", async () => {
    await ensureDiscoverySchedule(
      schedule({ options: { maxAgeHours: 1, maxPages: 5, maxListings: 50, query: "node" } }),
    );

    expect(added[0].data).toEqual({
      maxAgeHours: 1,
      maxPages: 5,
      maxListings: 50,
      query: "node",
    });
  });

  it("does not duplicate the scheduler when called again with the same interval", async () => {
    await ensureDiscoverySchedule(schedule());
    added.length = 0;

    await ensureDiscoverySchedule(schedule());

    // Reiniciar a API não pode somar um segundo agendador. O upsert do
    // BullMQ só protege enquanto a chave for estável — este teste quebra
    // se o nome do job passar a variar (timestamp, uuid) entre boots.
    expect(repeatables).toHaveLength(1);
    expect(removedKeys).toHaveLength(0);
  });

  it("replaces the old schedule when the interval changes", async () => {
    await ensureDiscoverySchedule(schedule({ everyMs: 600_000 }));
    await ensureDiscoverySchedule(schedule({ everyMs: 120_000 }));

    expect(removedKeys).toEqual([`${DISCOVERY_SCHEDULER_NAME}::600000`]);
    expect(repeatables).toHaveLength(1);
    expect(repeatables[0].every).toBe("120000");
  });

  it("removes the schedule when it is turned off", async () => {
    await ensureDiscoverySchedule(schedule());
    added.length = 0;

    const state = await ensureDiscoverySchedule(schedule({ enabled: false }));

    expect(repeatables).toHaveLength(0);
    expect(added).toHaveLength(0);
    expect(state.enabled).toBe(false);
  });

  it("leaves other repeatable jobs untouched", async () => {
    repeatables.push({ name: "something-else", key: "something-else::1", every: "1" });

    await ensureDiscoverySchedule(schedule({ enabled: false }));

    expect(repeatables.map((r) => r.name)).toEqual(["something-else"]);
  });
});

describe("discoveryScheduleState", () => {
  beforeEach(() => {
    repeatables.length = 0;
  });

  it("reports disabled when nothing is scheduled", async () => {
    expect(await discoveryScheduleState()).toEqual({
      enabled: false,
      everyMs: null,
      nextRunAt: null,
      options: null,
    });
  });

  it("reads the live interval and next run from the queue, not from config", async () => {
    const next = Date.now() + 60_000;
    repeatables.push({
      name: DISCOVERY_SCHEDULER_NAME,
      key: `${DISCOVERY_SCHEDULER_NAME}::300000`,
      every: "300000",
      next,
    });

    const state = await discoveryScheduleState();
    expect(state.enabled).toBe(true);
    expect(state.everyMs).toBe(300_000);
    expect(state.nextRunAt).toBe(new Date(next).toISOString());
  });
});
