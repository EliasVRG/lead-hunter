import { createWorker, JobType } from "@lead-hunter/queue";
import { scraperProcessor } from "./workers/scraper.worker.js";
import { enrichmentProcessor } from "./workers/enrichment.worker.js";
import { aiScoreProcessor } from "./workers/ai.worker.js";

createWorker({
  [JobType.Scrape]: scraperProcessor,
  [JobType.Enrichment]: enrichmentProcessor,
  [JobType.AiScore]: aiScoreProcessor,
});