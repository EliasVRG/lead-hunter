import { type Job } from "bullmq";
import { type JobPayload, addJob, JobType } from "@lead-hunter/queue";
import { scrape99Freelas, type ScrapedJobPosting } from "@lead-hunter/scraper";
import { upsertJobPosting } from "@lead-hunter/database";
import { logger } from "@lead-hunter/logger";

function toRow(job: ScrapedJobPosting) {
  return {
    platform: job.platform,
    external_id: job.externalId,
    url: job.url,
    title: job.title,
    description: job.description,
    skills: job.skills,
    budget_type: job.budgetType,
    budget_min: job.budgetMin,
    budget_max: job.budgetMax,
    currency: job.currency,
    client_name: job.clientName,
    client_rating: job.clientRating,
    proposals_count: job.proposalsCount,
    posted_at: job.postedAt ? new Date(job.postedAt) : null,
    status: "discovered",
  };
}

export async function jobDiscoveryProcessor(job: Job<JobPayload>): Promise<void> {
  const { payload, id: jobId } = job.data;
  const retryCount = job.attemptsMade;
  const options = payload as { searchUrl?: string; maxListings?: number };

  logger.info({ jobId, stage: "job-discovery", status: "start", retryCount }, "job discovery started");

  try {
    const t0 = Date.now();

    const scraped = await scrape99Freelas(options);
    logger.info(
      { jobId, stage: "job-discovery", scraped: scraped.length, durationMs: Date.now() - t0 },
      "99freelas scrape done",
    );

    let enqueued = 0;
    for (const scrapedJob of scraped) {
      const row = await upsertJobPosting(toRow(scrapedJob));

      if (row.score === null || row.score === undefined) {
        await addJob(JobType.AiScore, { platform: row.platform, externalId: row.external_id });
        enqueued++;
      }
    }

    logger.info(
      { jobId, stage: "job-discovery", status: "success", scraped: scraped.length, enqueued, durationMs: Date.now() - t0 },
      "job discovery completed",
    );
  } catch (err) {
    logger.error(
      { jobId, stage: "job-discovery", status: "error", retryCount, error: (err as Error).message },
      "job discovery failed",
    );
    throw err;
  }
}
