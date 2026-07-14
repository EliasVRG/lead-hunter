import { type Job } from "bullmq";
import { type JobPayload, addJob, JobType } from "@lead-hunter/queue";
import { crawlPage, extractEmails, extractPhones, detectTechnologies, analyzePerformance } from "@lead-hunter/scraper";
import { upsertLead } from "@lead-hunter/database";
import { logger } from "@lead-hunter/logger";

export async function enrichmentProcessor(job: Job<JobPayload>): Promise<void> {
  const { payload, id: jobId } = job.data;
  const retryCount = job.attemptsMade;
  const lead = payload as { name?: string; website?: string; city?: string };

  if (!lead.website) throw new Error("website is required");

  logger.info({ jobId, stage: "enrichment", status: "start", website: lead.website, retryCount }, "enrichment started");

  try {
    const t0 = Date.now();

    const page = await crawlPage(lead.website);
    logger.info({ jobId, stage: "crawl", durationMs: Date.now() - t0 }, "page crawled");

    const t1 = Date.now();
    const emails = extractEmails(page.bodyText);
    const phones = extractPhones(page.bodyText);
    logger.info({ jobId, stage: "contacts", emails: emails.length, phones: phones.length, durationMs: Date.now() - t1 }, "contacts extracted");

    const t2 = Date.now();
    const { technologies, cms } = detectTechnologies(page.bodyText, {});
    logger.info({ jobId, stage: "tech", technologies: technologies.length, cms, durationMs: Date.now() - t2 }, "tech detected");

    const t3 = Date.now();
    const perf = await analyzePerformance(lead.website);
    logger.info({ jobId, stage: "performance", durationMs: Date.now() - t3 }, "performance analyzed");

    const t4 = Date.now();
    await upsertLead({
      website: lead.website,
      emails,
      phones,
      social_linkedin: page.socials.linkedin,
      social_instagram: page.socials.instagram,
      social_facebook: page.socials.facebook,
      tech_stack: technologies,
      cms,
      performance_score: perf.performance,
      lighthouse_performance: perf.performance,
      lighthouse_accessibility: perf.accessibility,
      lighthouse_seo: perf.seo,
    });
    logger.info({ jobId, stage: "db", durationMs: Date.now() - t4 }, "enrichment persisted");

    await addJob(JobType.AiScore, { website: lead.website });
    logger.info({ jobId, stage: "ai-score-enqueue" }, "AI score job enqueued");

    logger.info({ jobId, stage: "enrichment", status: "success", durationMs: Date.now() - t0 }, "enrichment completed");
  } catch (err) {
    logger.error({ jobId, stage: "enrichment", status: "error", retryCount, error: (err as Error).message }, "enrichment failed");
    throw err;
  }
};
