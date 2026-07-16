import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { JobPayload } from "@lead-hunter/queue";

vi.mock("@lead-hunter/scraper", () => ({
  scrape99Freelas: vi.fn(),
}));

vi.mock("@lead-hunter/database", () => ({
  upsertJobPosting: vi.fn(),
}));

vi.mock("@lead-hunter/queue", () => ({
  addJob: vi.fn(),
  JobType: { Scrape: "scrape", AiScore: "ai-score", Enrichment: "enrichment", ProposalDraft: "proposal-draft" },
}));

import { jobDiscoveryProcessor } from "./job-discovery.worker.js";
import { scrape99Freelas } from "@lead-hunter/scraper";
import { upsertJobPosting } from "@lead-hunter/database";
import { addJob, JobType } from "@lead-hunter/queue";

function fakeJob(payload: Record<string, unknown>): Job<JobPayload> {
  return { data: { id: "job-1", payload }, attemptsMade: 0 } as unknown as Job<JobPayload>;
}

beforeEach(() => {
  vi.mocked(scrape99Freelas).mockReset();
  vi.mocked(upsertJobPosting).mockReset();
  vi.mocked(addJob).mockReset();
});

describe("jobDiscoveryProcessor", () => {
  it("enqueues ai-score only for postings without a score, and dispatches with the discovered scraper options", async () => {
    vi.mocked(scrape99Freelas).mockResolvedValue([
      {
        platform: "99freelas",
        externalId: "111",
        url: "https://www.99freelas.com.br/projetos/111",
        title: "Bot de scraping",
        description: "desc",
        skills: ["Node.js"],
        budgetType: "fixed",
        budgetMin: 1000,
        budgetMax: 2000,
        currency: "BRL",
        clientName: "Cliente A",
        clientRating: 4.5,
        proposalsCount: 3,
        postedAt: "2026-07-10T00:00:00.000Z",
        status: 200,
      },
      {
        platform: "99freelas",
        externalId: "222",
        url: "https://www.99freelas.com.br/projetos/222",
        title: "Landing page",
        description: "desc 2",
        skills: ["React"],
        budgetType: "hourly",
        budgetMin: 80,
        budgetMax: null,
        currency: "BRL",
        clientName: null,
        clientRating: null,
        proposalsCount: null,
        postedAt: null,
        status: 200,
      },
    ] as any);

    vi.mocked(upsertJobPosting)
      .mockResolvedValueOnce({ platform: "99freelas", external_id: "111", score: null } as any)
      .mockResolvedValueOnce({ platform: "99freelas", external_id: "222", score: 80 } as any);

    await jobDiscoveryProcessor(fakeJob({ searchUrl: "https://example.com/busca", maxListings: 10 }));

    expect(scrape99Freelas).toHaveBeenCalledWith({ searchUrl: "https://example.com/busca", maxListings: 10 });

    expect(upsertJobPosting).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        platform: "99freelas",
        external_id: "111",
        url: "https://www.99freelas.com.br/projetos/111",
        title: "Bot de scraping",
        budget_type: "fixed",
        budget_min: 1000,
        budget_max: 2000,
        posted_at: new Date("2026-07-10T00:00:00.000Z"),
        status: "discovered",
      }),
    );
    expect(upsertJobPosting).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ external_id: "222", posted_at: null, status: "discovered" }),
    );

    expect(addJob).toHaveBeenCalledTimes(1);
    expect(addJob).toHaveBeenCalledWith(JobType.AiScore, { platform: "99freelas", externalId: "111" });
  });

  it("propagates scrape errors so BullMQ can retry the job", async () => {
    vi.mocked(scrape99Freelas).mockRejectedValue(new Error("site unreachable"));

    await expect(jobDiscoveryProcessor(fakeJob({}))).rejects.toThrow("site unreachable");
    expect(upsertJobPosting).not.toHaveBeenCalled();
    expect(addJob).not.toHaveBeenCalled();
  });
});
