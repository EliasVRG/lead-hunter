import { getAIProvider } from "@lead-hunter/ai/factory.js";
import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";
import { MatchResult } from "@lead-hunter/shared/dto/match.dto.js";
import { logger } from "@lead-hunter/logger";

export async function scoreLeadWithAI(lead: any): Promise<ScoreResult> {
  const provider = getAIProvider();
  logger.info({ website: lead.website }, "sending lead to AI provider for scoring");
  return provider.analyzeLead(lead, { temperature: 0.1 });
}

export async function matchJobWithAI(job: any, resume: any): Promise<MatchResult> {
  const provider = getAIProvider();
  logger.info({ jobUrl: job.url }, "sending job to AI provider for match scoring");
  return provider.matchJob(job, resume, { temperature: 0.1 });
}

export async function draftProposalWithAI(job: any, resume: any): Promise<string> {
  const provider = getAIProvider();
  logger.info({ jobUrl: job.url }, "sending job to AI provider for proposal draft");
  return provider.draftProposal(job, resume, { temperature: 0.4 });
}
