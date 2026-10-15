import { envNumber, envString } from "./env.js";

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
  };
  /** Jobs processados em paralelo por worker. */
  concurrency: {
    discovery: number;
    triage: number;
    proposal: number;
  };
  attempts: number;
  backoffDelayMs: number;
}

export const queueConfig: QueueConfig = {
  redis: {
    host: envString("REDIS_HOST", "localhost"),
    port: envNumber("REDIS_PORT", 6391),
  },
  concurrency: {
    // Discovery é serial de propósito: um único run já pagina o 99Freelas com
    // rate limit interno, e rodar dois em paralelo só multiplicaria requests.
    discovery: envNumber("DISCOVERY_CONCURRENCY", 1),
    // Triagem e proposta batem no tier gratuito do OpenRouter, que é rate-limited
    // por conta — concorrência baixa evita queimar a cota em 429.
    triage: envNumber("TRIAGE_CONCURRENCY", 2),
    proposal: envNumber("PROPOSAL_CONCURRENCY", 1),
  },
  attempts: envNumber("QUEUE_ATTEMPTS", 3),
  backoffDelayMs: envNumber("QUEUE_BACKOFF_DELAY_MS", 5_000),
};
