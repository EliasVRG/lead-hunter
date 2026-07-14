import { Queue, Worker, type Job, type WorkerOptions } from "bullmq";
import { logger } from "@lead-hunter/logger";

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6391),
};

export enum JobType {
  Scrape = "scrape",
  AiScore = "ai-score",
  Enrichment = "enrichment",
}

export interface JobPayload {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: Date;
}

export const leadQueue = new Queue<JobPayload>("leads", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export function createWorker(
  handlers: Partial<Record<JobType, (job: Job<JobPayload>) => Promise<unknown>>>,
  opts?: Partial<WorkerOptions>,
) {
  const worker = new Worker<JobPayload>("leads", async (job) => {
    const { type } = job.data;
    const handler = handlers[type];
    if (!handler) {
      logger.warn({ jobId: job.id, type }, "no handler for job type, skipping");
      return;
    }
    return handler(job);
  }, { connection, ...opts });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, type: job.data.type }, "job completed");
  });
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, type: job?.data.type, error: err.message }, "job failed");
  });

  return worker;
}

export async function addJob(
  type: JobType,
  payload: Record<string, unknown>,
) {
  const job: JobPayload = {
    id: crypto.randomUUID(),
    type,
    payload,
    attempts: 0,
    createdAt: new Date(),
  };
  await leadQueue.add(type, job);
  logger.info({ jobId: job.id, type }, "job enqueued");
  return job;
}
