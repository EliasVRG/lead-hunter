import { type Job } from "bullmq";
import { type JobPayload, addJob, JobType } from "@lead-hunter/queue";
import { scanSite } from "@lead-hunter/scraper";
import { upsertLead } from "@lead-hunter/database";
import { logger } from "@lead-hunter/logger";

export async function scraperProcessor(job: Job<JobPayload>): Promise<void> {
    const { payload, id: jobId } = job.data;
    const retryCount = job.attemptsMade;
    const lead = payload as { name?: string; website?: string; city?: string };

    if (!lead.website) throw new Error("website is required");

    logger.info(
        { jobId, stage: "scraper", status: "start", website: lead.website, retryCount },
        "job started",
    );

    const t0 = Date.now();

    const t1 = Date.now();
    logger.info({ jobId, stage: "scraper", status: "start", website: lead.website }, "scraping");
    const scraped = await scanSite(lead.website);
    logger.info(
        { jobId, stage: "scraper", status: "success", durationMs: Date.now() - t1 },
        "scrape done",
    );

    const t2 = Date.now();
    logger.info({ jobId, stage: "db", status: "start" }, "persisting");
    await upsertLead({
        website: lead.website,
        name: lead.name ?? scraped.title ?? null,
        city: lead.city ?? null,
        status_code: scraped.status ?? null,
        title: scraped.title ?? null,
        meta: scraped.meta ?? null,
    });
    logger.info(
        { jobId, stage: "db", status: "success", durationMs: Date.now() - t2 },
        "persist done",
    );

    await addJob(JobType.Enrichment, { website: lead.website, name: lead.name, city: lead.city });
    logger.info({ jobId, stage: "enrichment-enqueue" }, "enrichment job enqueued");

    logger.info(
        { jobId, stage: "scraper", status: "success", durationMs: Date.now() - t0 },
        "job completed",
    );
}