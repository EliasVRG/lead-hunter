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

export interface DiscoveryScheduleConfig {
  enabled: boolean;
  everyMs: number;
  /** Opções passadas ao job agendado. */
  options: {
    maxAgeHours: number;
    maxPages: number;
    maxListings: number;
    query?: string;
    category?: string;
  };
}

/**
 * Descoberta automática recorrente.
 *
 * `maxAgeHours` é curto de propósito: rodando a cada poucos minutos, repaginar
 * vagas antigas só repete trabalho já feito na rodada anterior e gasta requests
 * no 99Freelas sem trazer nada novo.
 */
export const discoveryScheduleConfig: DiscoveryScheduleConfig = {
  enabled: envString("DISCOVERY_SCHEDULE_ENABLED", "false") === "true",
  // 10 minutos: a listagem traz 10 vagas por página e o site tem rate limit
  // implícito. Mais curto que isso martela sem aumentar a cobertura.
  everyMs: envNumber("DISCOVERY_SCHEDULE_EVERY_MS", 600_000),
  options: {
    maxAgeHours: envNumber("DISCOVERY_SCHEDULE_MAX_AGE_HOURS", 3),
    maxPages: envNumber("DISCOVERY_SCHEDULE_MAX_PAGES", 2),
    maxListings: envNumber("DISCOVERY_SCHEDULE_MAX_LISTINGS", 20),
    query: envString("DISCOVERY_SCHEDULE_QUERY") || undefined,
    category: envString("DISCOVERY_SCHEDULE_CATEGORY") || undefined,
  },
};
