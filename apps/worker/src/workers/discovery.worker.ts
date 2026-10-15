import { type Job } from "bullmq";
import { type DiscoveryJobData, enqueueTriage } from "@lead-hunter/queue";
import { scrape99Freelas, type ScrapedJobPosting } from "@lead-hunter/scraper";
import { upsertJobPosting, type JobPostingRow } from "@lead-hunter/database";
import { logger } from "@lead-hunter/logger";

function toRow(job: ScrapedJobPosting): Partial<JobPostingRow> {
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
    client_reviews_count: job.clientReviewsCount,
    proposals_count: job.proposalsCount,
    interested_count: job.interestedCount,
    category: job.category,
    subcategory: job.subcategory,
    experience_level: job.experienceLevel,
    is_urgent: job.isUrgent,
    is_featured: job.isFeatured,
    posted_at: job.postedAt ? new Date(job.postedAt) : null,
    expires_at: job.expiresAt ? new Date(job.expiresAt) : null,
  };
}

/**
 * Estágio 1: descobre projetos no 99Freelas e os entrega à fila de triagem.
 *
 * Só enfileira vagas ainda sem score. Um upsert de vaga já triada atualiza os
 * contadores voláteis (propostas, interessados) sem pagar uma nova chamada de
 * IA — é o que permite rodar a descoberta de forma recorrente.
 */
export async function discoveryProcessor(job: Job<DiscoveryJobData>): Promise<void> {
  const startedAt = Date.now();
  const options = job.data ?? {};

  logger.info(
    { jobId: job.id, stage: "discovery", status: "start", attemptsMade: job.attemptsMade, options },
    "discovery started",
  );

  try {
    const scraped = await scrape99Freelas(options);

    let enqueued = 0;
    let refreshed = 0;

    for (const scrapedJob of scraped) {
      const row = await upsertJobPosting(toRow(scrapedJob));

      if (row.score === null || row.score === undefined) {
        await enqueueTriage({ platform: row.platform, externalId: row.external_id });
        enqueued++;
      } else {
        refreshed++;
      }
    }

    logger.info(
      {
        jobId: job.id,
        stage: "discovery",
        status: "success",
        scraped: scraped.length,
        enqueuedForTriage: enqueued,
        alreadyTriaged: refreshed,
        durationMs: Date.now() - startedAt,
      },
      "discovery completed",
    );
  } catch (err) {
    logger.error(
      {
        jobId: job.id,
        stage: "discovery",
        status: "error",
        attemptsMade: job.attemptsMade,
        error: (err as Error).message,
      },
      "discovery failed",
    );
    throw err;
  }
}
