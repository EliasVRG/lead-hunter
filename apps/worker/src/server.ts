import { createWorker, JobType } from "@lead-hunter/queue";
import { jobDiscoveryProcessor } from "./workers/job-discovery.worker.js";
import { matchProcessor } from "./workers/match.worker.js";
import { proposalProcessor } from "./workers/proposal.worker.js";

// job-hunter pivot (specs/completed/fase_00_pivot_job_hunter.md): scrape -> job discovery
// (99Freelas), ai-score -> match scoring against ResumeProfile, proposal-draft -> AI proposal
// draft. The old B2B handlers (scraper/enrichment/ai.worker.ts, company scraping) are kept in
// this directory for historical reference but are no longer wired here.
createWorker({
  [JobType.Scrape]: jobDiscoveryProcessor,
  [JobType.AiScore]: matchProcessor,
  [JobType.ProposalDraft]: proposalProcessor,
});
