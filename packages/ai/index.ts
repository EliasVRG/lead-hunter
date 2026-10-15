import { OpenRouterProvider } from "./providers/openrouter/index.js";

/**
 * Ponto único de acesso à IA (AGENT.md §1.4 — "AI is a service, not logic").
 *
 * Só existe OpenRouter: ele já é um roteador para dezenas de modelos, inclusive
 * os gratuitos, então ter provedores irmãos aqui duplicaria a abstração que ele
 * próprio oferece. Trocar de modelo é mudar `OPENROUTER_MODELS` no `.env`.
 */
let cached: OpenRouterProvider | null = null;

export function getAIProvider(): OpenRouterProvider {
  cached ??= new OpenRouterProvider();
  return cached;
}

/** Usado em testes para descartar a instância memoizada. */
export function resetAIProvider(): void {
  cached = null;
}

export { OpenRouterProvider } from "./providers/openrouter/index.js";
export { OpenRouterClient, extractJson, JsonExtractionError } from "./providers/openrouter/index.js";
export type { OutputMode, StructuredRequest, StructuredResponse } from "./providers/openrouter/index.js";

export {
  DIMENSION_WEIGHTS,
  TIERS,
  TIER_THRESHOLDS,
  TRIAGE_RESPONSE_FORMAT,
  normalizeTriage,
  tierForScore,
  triageResultSchema,
} from "./contracts/triage.contract.js";
export type { DimensionKey, Tier, TriageResult } from "./contracts/triage.contract.js";

export {
  PROPOSAL_RESPONSE_FORMAT,
  normalizeProposal,
  proposalDraftSchema,
} from "./contracts/proposal.contract.js";
export type { ProposalDraft } from "./contracts/proposal.contract.js";

export { TRIAGE_SYSTEM_PROMPT, buildTriagePrompt } from "./prompts/triage.prompt.js";
export type { TriageJobInput } from "./prompts/triage.prompt.js";
export { PROPOSAL_SYSTEM_PROMPT, buildProposalPrompt } from "./prompts/proposal.prompt.js";
