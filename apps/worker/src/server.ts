import { QUEUE_NAMES, closeQueues, createQueueWorker } from "@lead-hunter/queue";
import { logger } from "@lead-hunter/logger";
import { discoveryProcessor } from "./workers/discovery.worker.js";
import { triageProcessor } from "./workers/triage.worker.js";
import { proposalProcessor } from "./workers/proposal.worker.js";

/**
 * discovery (99Freelas) → triage (match x currículo) → proposal (rascunho).
 * Cada estágio é um worker próprio porque as concorrências são diferentes:
 * ver `queueConfig.concurrency`.
 */
const workers = [
  createQueueWorker(QUEUE_NAMES.discovery, discoveryProcessor),
  createQueueWorker(QUEUE_NAMES.triage, triageProcessor),
  createQueueWorker(QUEUE_NAMES.proposal, proposalProcessor),
];

logger.info({ queues: Object.values(QUEUE_NAMES) }, "worker started");

/**
 * Encerra esperando o job em andamento terminar. Sem isso, um Ctrl+C no meio de
 * uma chamada de IA deixaria a vaga marcada como ativa no Redis até o lock
 * expirar, e o retry gastaria uma segunda chamada no mesmo projeto.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down worker");
  await Promise.all(workers.map((worker) => worker.close()));
  await closeQueues();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
