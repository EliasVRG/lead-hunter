import { type Job } from "bullmq";
import { type JobPayload } from "@lead-hunter/queue";
import { findJobPostingByPlatformAndExternalId, upsertJobPosting } from "@lead-hunter/database";
import { loadResumeProfile } from "@lead-hunter/config/resume-profile.js";
import { draftProposalWithAI } from "../services/ai.js";
import { logger } from "@lead-hunter/logger";

export async function proposalProcessor(job: Job<JobPayload>): Promise<void> {
  const { payload, id: jobId } = job.data;
  const retryCount = job.attemptsMade;
  const { platform, externalId } = payload as { platform?: string; externalId?: string };

  if (!platform || !externalId) throw new Error("platform and externalId are required");

  logger.info({ jobId, stage: "proposal", status: "start", platform, externalId, retryCount }, "proposal worker started");

  try {
    const t0 = Date.now();

    const jobPosting = await findJobPostingByPlatformAndExternalId(platform, externalId);
    if (!jobPosting) {
      throw new Error(`Job posting ${platform}/${externalId} not found in database`);
    }

    const resume = await loadResumeProfile();
    if (!resume) {
      throw new Error(
        "ResumeProfile not found. Configure config/resume-profile.json before generating proposals.",
      );
    }

    const proposalDraft = await draftProposalWithAI(jobPosting, resume);

    await upsertJobPosting({
      platform,
      external_id: externalId,
      proposal_draft: proposalDraft,
      status: "proposal_ready",
    });

    logger.info(
      { jobId, stage: "proposal", status: "success", platform, externalId, durationMs: Date.now() - t0 },
      "proposal worker completed successfully. Sending remains manual — no auto-apply.",
    );
  } catch (err) {
    logger.error(
      { jobId, stage: "proposal", status: "error", retryCount, error: (err as Error).message },
      "proposal worker failed",
    );
    throw err;
  }
}
