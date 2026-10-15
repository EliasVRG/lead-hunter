import { describe, it, expect, vi } from "vitest";

const added: { queue: string; name: string; data: unknown; opts?: { jobId?: string } }[] = [];

/** Job pré-existente que `getJob` devolve, e se ele foi removido. */
const existingJob: { state: string | null; removed: boolean } = { state: null, removed: false };

vi.mock("bullmq", () => ({
  Queue: class {
    constructor(public name: string) {}
    async add(name: string, data: unknown, opts?: { jobId?: string }) {
      added.push({ queue: this.name, name, data, opts });
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
  },
  Worker: class {
    on() {
      return this;
    }
  },
}));

const { QUEUE_NAMES, enqueueDiscovery, enqueueProposal, enqueueTriage, jobIdFor, queueCounts } =
  await import("@lead-hunter/queue");

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
