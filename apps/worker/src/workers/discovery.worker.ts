import { type Job } from "bullmq";
import { type DiscoveryJobData, enqueueTriage } from "@lead-hunter/queue";
import { scrape99Freelas, type ScrapedJobPosting } from "@lead-hunter/scraper";
import {
  updateJobPostingByRef,
  upsertJobPosting,
  type JobPostingRow,
} from "@lead-hunter/database";
import { screenJobPosting } from "@lead-hunter/screening";
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
 * Três caminhos possíveis por vaga:
 *
 * 1. já tem score → só atualiza os contadores voláteis (propostas,
 *    interessados), sem pagar nova chamada de IA. É o que permite rodar a
 *    descoberta de forma recorrente.
 * 2. reprovada no filtro determinístico → gravada como `dismissed` com motivo,
 *    sem chamar IA.
 * 3. o resto → fila de triagem.
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
    let screenedOut = 0;

    for (const scrapedJob of scraped) {
      const row = await upsertJobPosting(toRow(scrapedJob));
      const alreadyTriaged = row.score !== null && row.score !== undefined;

      if (alreadyTriaged) {
        refreshed++;
        continue;
      }

      // Uma vaga já descartada volta na listagem a cada rodada e continua sem
      // score. Sem esta guarda ela seria reavaliada indefinidamente — e um
      // descarte manual feito na tela de revisão seria desfeito.
      if (row.status === "dismissed") continue;

      const verdict = screenJobPosting(row);

      if (!verdict.keep) {
        await updateJobPostingByRef(row.platform, row.external_id, {
          status: "dismissed",
          dismissed_reason: `${verdict.rule}: ${verdict.reason}`,
        });
        screenedOut++;
        logger.debug(
          { externalId: row.external_id, rule: verdict.rule, reason: verdict.reason },
          "job screened out before triage",
        );
        continue;
      }

      await enqueueTriage({ platform: row.platform, externalId: row.external_id });
      enqueued++;
    }

    logger.info(
      {
        jobId: job.id,
        stage: "discovery",
        status: "success",
        scraped: scraped.length,
        enqueuedForTriage: enqueued,
        alreadyTriaged: refreshed,
        screenedOut,
        // Cada vaga cortada é uma chamada de triagem que não foi gasta — o
        // número que diz se o filtro está pagando o próprio custo.
        aiCallsSaved: screenedOut,
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
