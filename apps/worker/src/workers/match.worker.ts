import { type Job } from "bullmq";
import { type JobPayload, addJob, JobType } from "@lead-hunter/queue";
import { findJobPostingByPlatformAndExternalId, upsertJobPosting } from "@lead-hunter/database";
import { loadResumeProfile } from "@lead-hunter/config/resume-profile.js";
import { matchJobWithAI } from "../services/ai.js";
import { logger } from "@lead-hunter/logger";

export async function matchProcessor(job: Job<JobPayload>): Promise<void> {
  const { payload, id: jobId } = job.data;
  const retryCount = job.attemptsMade;
  const { platform, externalId } = payload as { platform?: string; externalId?: string };

  if (!platform || !externalId) throw new Error("platform and externalId are required");

  logger.info({ jobId, stage: "match", status: "start", platform, externalId, retryCount }, "match worker started");

  try {
    const t0 = Date.now();

    const jobPosting = await findJobPostingByPlatformAndExternalId(platform, externalId);
    if (!jobPosting) {
      throw new Error(`Job posting ${platform}/${externalId} not found in database`);
    }

    const resume = await loadResumeProfile();
    if (!resume) {
      throw new Error(
        "ResumeProfile not found. Configure config/resume-profile.json before running match scoring.",
      );
    }

    const result = await matchJobWithAI(jobPosting, resume);

    const updated = await upsertJobPosting({
      platform,
      external_id: externalId,
      score: result.score,
      tier: result.tier,
      dimensions: result.dimensions as any,
      reason: result.reason,
      red_flags: result.red_flags,
      status: "reviewing",
    });

    if (updated.tier === "APPLY") {
      await addJob(JobType.ProposalDraft, { platform, externalId });
      logger.info({ jobId, stage: "proposal-draft-enqueue", platform, externalId }, "proposal draft job enqueued");
    }

    logger.info(
      { jobId, stage: "match", status: "success", platform, externalId, tier: result.tier, durationMs: Date.now() - t0 },
      "match worker completed successfully",
    );
  } catch (err) {
    logger.error(
      { jobId, stage: "match", status: "error", retryCount, error: (err as Error).message },
      "match worker failed",
    );
    throw err;
  }
}
