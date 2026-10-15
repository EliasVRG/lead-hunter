import { aiConfig } from "@lead-hunter/config/ai.js";
import type { ResumeProfile } from "@lead-hunter/shared/models/resume-profile.js";
import {
  PROPOSAL_RESPONSE_FORMAT,
  normalizeProposal,
  type ProposalDraft,
} from "../../contracts/proposal.contract.js";
import {
  TRIAGE_RESPONSE_FORMAT,
  normalizeTriage,
  type TriageResult,
} from "../../contracts/triage.contract.js";
import { PROPOSAL_SYSTEM_PROMPT, buildProposalPrompt } from "../../prompts/proposal.prompt.js";
import {
  TRIAGE_SYSTEM_PROMPT,
  buildTriagePrompt,
  type TriageJobInput,
} from "../../prompts/triage.prompt.js";
import { OpenRouterClient, type StructuredResponse } from "./client.js";

export class OpenRouterProvider {
  constructor(private readonly client = new OpenRouterClient(aiConfig.openrouter)) {}

  triage(job: TriageJobInput, resume: ResumeProfile): Promise<StructuredResponse<TriageResult>> {
    return this.client.complete({
      task: "triage",
      system: TRIAGE_SYSTEM_PROMPT,
      user: buildTriagePrompt(job, resume),
      temperature: aiConfig.temperature.triage,
      responseFormat: TRIAGE_RESPONSE_FORMAT,
      // Quais dimensões são avaliáveis é decidido pelo `budget_type` que o
      // scraper extraiu, não pelo que o modelo respondeu — é fato observável
      // da vaga. O prompt ainda pede `unassessed` para o modelo pontuar 0 em
      // vez de inventar meia-nota, e para a justificativa dizer isso.
      normalize: (raw) => normalizeTriage(raw, { budgetType: job.budget_type }),
    });
  }

  draftProposal(
    job: TriageJobInput,
    resume: ResumeProfile,
    triage: TriageResult | null,
  ): Promise<StructuredResponse<ProposalDraft>> {
    return this.client.complete({
      task: "proposal",
      system: PROPOSAL_SYSTEM_PROMPT,
      user: buildProposalPrompt(job, resume, triage),
      temperature: aiConfig.temperature.proposal,
      responseFormat: PROPOSAL_RESPONSE_FORMAT,
      normalize: normalizeProposal,
    });
  }
}

export { OpenRouterClient } from "./client.js";
export type { OutputMode, StructuredRequest, StructuredResponse } from "./client.js";
export { extractJson, JsonExtractionError } from "./json.js";
