import { envList, envNumber, envString } from "./env.js";

/**
 * Cadeia padrão de modelos **gratuitos** do OpenRouter, em ordem de preferência.
 *
 * A ordem não é arbitrária: os dois primeiros anunciam `structured_outputs` em
 * `GET /api/v1/models` (aceitam `response_format: { type: "json_schema" }`, que é o
 * modo mais confiável para o contrato de output); os dois últimos só aceitam
 * `json_object` e servem de rede de segurança quando os primeiros batem em
 * rate limit — o tier gratuito tem cota diária por conta.
 *
 * Para revalidar a lista:
 *   curl -s https://openrouter.ai/api/v1/models | jq '.data[] | select(.id | endswith(":free"))'
 */
const DEFAULT_FREE_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "dots-studio/dots-3-note-preview:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  /** Cadeia de fallback: o primeiro modelo que devolver output válido ganha. */
  models: string[];
  /** Tentativas por modelo antes de cair para o próximo (erros de rede/429/5xx). */
  maxAttemptsPerModel: number;
  requestTimeoutMs: number;
  /** Teto de tokens de saída — protege a cota gratuita de respostas descontroladas. */
  maxOutputTokens: number;
  /** Enviados ao OpenRouter para atribuição de uso (opcionais, mas recomendados). */
  referer: string;
  title: string;
}

export interface AIConfig {
  provider: "openrouter";
  openrouter: OpenRouterConfig;
  temperature: {
    triage: number;
    proposal: number;
  };
}

export const aiConfig: AIConfig = {
  provider: "openrouter",
  openrouter: {
    apiKey: envString("OPENROUTER_API_KEY"),
    baseUrl: envString("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    models: envList("OPENROUTER_MODELS", DEFAULT_FREE_MODELS),
    maxAttemptsPerModel: envNumber("OPENROUTER_MAX_ATTEMPTS_PER_MODEL", 2),
    requestTimeoutMs: envNumber("OPENROUTER_TIMEOUT_MS", 90_000),
    maxOutputTokens: envNumber("OPENROUTER_MAX_OUTPUT_TOKENS", 2048),
    referer: envString("OPENROUTER_REFERER", "https://github.com/local/job-hunter"),
    title: envString("OPENROUTER_TITLE", "job-hunter"),
  },
  temperature: {
    triage: envNumber("AI_TEMPERATURE_TRIAGE", 0.1),
    proposal: envNumber("AI_TEMPERATURE_PROPOSAL", 0.4),
  },
};

export { DEFAULT_FREE_MODELS };
