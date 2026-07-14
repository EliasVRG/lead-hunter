import { getAIProvider } from "@lead-hunter/ai/factory.js";
import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";
import { logger } from "@lead-hunter/logger";

export async function scoreLeadWithAI(lead: any): Promise<ScoreResult> {
  const provider = getAIProvider();
  logger.info({ website: lead.website }, "sending lead to AI provider for scoring");
  return provider.analyzeLead(lead, { temperature: 0.1 });
}
