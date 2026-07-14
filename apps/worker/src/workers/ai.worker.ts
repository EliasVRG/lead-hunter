import { type Job } from "bullmq";
import { type JobPayload } from "@lead-hunter/queue";
import { findLeadByWebsite, upsertLead } from "@lead-hunter/database";
import { scoreLeadWithAI } from "../services/ai.js";
import { logger } from "@lead-hunter/logger";

export async function aiScoreProcessor(job: Job<JobPayload>) {
  const { payload, id: jobId } = job.data;
  const retryCount = job.attemptsMade;
  const leadPayload = payload as { website?: string };

  if (!leadPayload.website) throw new Error("website is required");

  logger.info(
    { jobId, stage: "ai-score", status: "start", website: leadPayload.website, retryCount },
    "AI scoring worker job started"
  );

  try {
    const t0 = Date.now();

    // Retrieve enriched lead from DB
    const lead = await findLeadByWebsite(leadPayload.website);
    if (!lead) {
      throw new Error(`Lead with website ${leadPayload.website} not found in database`);
    }

    // Analyze lead using AI Service
    const result = await scoreLeadWithAI(lead);

    await upsertLead({
      website: lead.website!,
      score: result.score,
      tiers: result.tiers,
      dimensions: result.dimensions as any,
      reason: result.reason,
      recommended_approach: result.recommended_approach,
    });

    logger.info(
      { jobId, stage: "ai-score", status: "success", website: lead.website, durationMs: Date.now() - t0 },
      "AI scoring worker job completed successfully"
    );

    return result;
  } catch (err) {
    logger.error(
      { jobId, stage: "ai-score", status: "error", retryCount, error: (err as Error).message },
      "AI scoring worker job failed"
    );
    throw err;
  }
}
