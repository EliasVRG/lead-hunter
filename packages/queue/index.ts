import { Queue, Worker, type Job, type WorkerOptions } from "bullmq";
import {
  discoveryScheduleConfig,
  queueConfig,
  type DiscoveryScheduleConfig,
} from "@lead-hunter/config/queue.js";
import { logger } from "@lead-hunter/logger";

/**
 * Três filas nomeadas em vez de uma fila genérica com `type` no payload.
 *
 * O pipeline tem estágios com características muito diferentes: descoberta é
 * I/O de rede serial, triagem e proposta batem no rate limit do tier gratuito
 * do OpenRouter. Filas separadas dão concorrência, retry e profundidade por
 * estágio, e o Bull Board passa a mostrar onde o trabalho está parado — com
 * uma fila só, "10 jobs pendentes" não diz se falta scrapear ou triar.
 */
export const QUEUE_NAMES = {
  discovery: "discovery",
  triage: "triage",
  proposal: "proposal",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const connection = {
  host: queueConfig.redis.host,
  port: queueConfig.redis.port,
};

/** Identifica uma vaga de forma estável entre estágios. */
export interface JobRef {
  platform: string;
  externalId: string;
}

export interface DiscoveryJobData {
  query?: string;
  category?: string;
  maxPages?: number;
  maxListings?: number;
  maxAgeHours?: number;
  fetchDetails?: boolean;
  searchUrl?: string;
}

export interface TriageJobData extends JobRef {}

export interface ProposalJobData extends JobRef {
  /** Score que motivou o enfileiramento, só para rastreabilidade no Bull Board. */
  score?: number;
}

const defaultJobOptions = {
  attempts: queueConfig.attempts,
  backoff: { type: "exponential" as const, delay: queueConfig.backoffDelayMs },
  // Mantém um histórico curto de sucessos para inspeção no Bull Board; falhas
  // ficam retidas porque são o que se quer reprocessar.
  removeOnComplete: { count: 200 },
  removeOnFail: false,
};

export const discoveryQueue = new Queue<DiscoveryJobData>(QUEUE_NAMES.discovery, {
  connection,
  defaultJobOptions,
});

export const triageQueue = new Queue<TriageJobData>(QUEUE_NAMES.triage, {
  connection,
  defaultJobOptions,
});

export const proposalQueue = new Queue<ProposalJobData>(QUEUE_NAMES.proposal, {
  connection,
  defaultJobOptions,
});

export const allQueues = [discoveryQueue, triageQueue, proposalQueue];

export async function enqueueDiscovery(data: DiscoveryJobData) {
  const job = await discoveryQueue.add("discover", data);
  logger.info({ queue: QUEUE_NAMES.discovery, jobId: job.id, data }, "discovery job enqueued");
  return job;
}

/**
 * `jobId` determinístico por vaga: se a mesma vaga reaparecer numa segunda
 * rodada de descoberta antes de ser triada, o BullMQ descarta o duplicado em
 * vez de gastar duas chamadas de IA no mesmo projeto.
 *
 * O separador não pode ser `:` — o BullMQ o reserva para suas próprias chaves
 * no Redis e rejeita o job com "Custom Id cannot contain :".
 */
export function jobIdFor({ platform, externalId }: JobRef): string {
  return `${platform}__${externalId}`;
}

/**
 * Libera um `jobId` ocupado por um job já finalizado.
 *
 * O BullMQ ignora silenciosamente um `add` cujo `jobId` já existe — inclusive
 * quando o job existente está `failed`. Como as falhas são retidas de propósito
 * (`removeOnFail: false`), sem essa limpeza uma vaga que falhou na triagem
 * ficaria travada para sempre: toda redescoberta seria descartada como
 * duplicada. Um job ainda `waiting`/`active`/`delayed` é preservado — aí o
 * descarte do duplicado é justamente o que se quer.
 */
async function releaseFinishedJobId(queue: Queue<any, any, any>, jobId: string): Promise<void> {
  const existing = await queue.getJob(jobId);
  if (!existing) return;

  const state = await existing.getState();
  if (state === "failed" || state === "completed") {
    await existing.remove();
  }
}

export async function enqueueTriage(data: TriageJobData) {
  const jobId = jobIdFor(data);
  await releaseFinishedJobId(triageQueue, jobId);

  const job = await triageQueue.add("triage", data, { jobId });
  logger.info({ queue: QUEUE_NAMES.triage, jobId: job.id, ...data }, "triage job enqueued");
  return job;
}

export async function enqueueProposal(data: ProposalJobData) {
  const jobId = jobIdFor(data);
  await releaseFinishedJobId(proposalQueue, jobId);

  const job = await proposalQueue.add("proposal", data, { jobId });
  logger.info({ queue: QUEUE_NAMES.proposal, jobId: job.id, ...data }, "proposal job enqueued");
  return job;
}

export function createQueueWorker<T>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<unknown>,
  opts?: Partial<WorkerOptions>,
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection,
    concurrency: queueConfig.concurrency[name],
    ...opts,
  });

  worker.on("completed", (job) => {
    logger.info({ queue: name, jobId: job.id }, "job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { queue: name, jobId: job?.id, attemptsMade: job?.attemptsMade, error: err.message },
      "job failed",
    );
  });

  return worker;
}

/** Contagens por estado de cada fila — usado pelo endpoint de status. */
export async function queueCounts() {
  const entries = await Promise.all(
    allQueues.map(async (queue) => [
      queue.name,
      await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
    ]),
  );

  return Object.fromEntries(entries) as Record<
    QueueName,
    Record<"waiting" | "active" | "completed" | "failed" | "delayed", number>
  >;
}

export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues.map((queue) => queue.close()));
}

/**
 * Nome fixo do job repetível de descoberta.
 *
 * O BullMQ identifica um agendamento pela combinação nome + opções de repeat.
 * Registrar com nome variável a cada boot acumularia agendadores no Redis e
 * multiplicaria o scraping silenciosamente — daí o nome constante, somado à
 * limpeza de agendamentos antigos em `ensureDiscoverySchedule`.
 */
export { discoveryScheduleConfig };

export const DISCOVERY_SCHEDULER_NAME = "scheduled-discovery";

export interface ScheduleState {
  enabled: boolean;
  everyMs: number | null;
  nextRunAt: string | null;
  options: DiscoveryJobData | null;
}

/**
 * Deixa o agendamento recorrente igual à configuração atual.
 *
 * Idempotente e convergente: remove qualquer agendador de descoberta que não
 * seja exatamente o configurado (intervalo antigo, ou a config tendo sido
 * desligada) e cria o novo só se faltar. Pode ser chamado a cada boot.
 */
export async function ensureDiscoverySchedule(
  config: DiscoveryScheduleConfig,
): Promise<ScheduleState> {
  const existing = await discoveryQueue.getRepeatableJobs();

  const stale = existing.filter(
    (job) =>
      job.name === DISCOVERY_SCHEDULER_NAME &&
      (!config.enabled || job.every !== String(config.everyMs)),
  );

  for (const job of stale) {
    await discoveryQueue.removeRepeatableByKey(job.key);
    logger.info(
      { queue: QUEUE_NAMES.discovery, key: job.key, every: job.every },
      "removed stale discovery schedule",
    );
  }

  if (!config.enabled) {
    logger.info("discovery schedule disabled — run POST /discovery/runs manually");
    return { enabled: false, everyMs: null, nextRunAt: null, options: null };
  }

  const data: DiscoveryJobData = { ...config.options };
  await discoveryQueue.add(DISCOVERY_SCHEDULER_NAME, data, {
    repeat: { every: config.everyMs },
  });

  logger.info(
    { queue: QUEUE_NAMES.discovery, everyMs: config.everyMs, options: data },
    "discovery schedule active",
  );

  return { ...(await discoveryScheduleState()), options: data };
}

/** Estado real lido do Redis — não a configuração pretendida. */
export async function discoveryScheduleState(): Promise<ScheduleState> {
  const jobs = await discoveryQueue.getRepeatableJobs();
  const scheduled = jobs.find((job) => job.name === DISCOVERY_SCHEDULER_NAME);

  if (!scheduled) {
    return { enabled: false, everyMs: null, nextRunAt: null, options: null };
  }

  return {
    enabled: true,
    everyMs: scheduled.every ? Number(scheduled.every) : null,
    nextRunAt: scheduled.next ? new Date(scheduled.next).toISOString() : null,
    options: null,
  };
}
