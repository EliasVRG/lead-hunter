import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { JobPayload } from "@lead-hunter/queue";

vi.mock("@lead-hunter/database", () => ({
  findJobPostingByPlatformAndExternalId: vi.fn(),
  upsertJobPosting: vi.fn(),
}));

vi.mock("@lead-hunter/config/resume-profile.js", () => ({
  loadResumeProfile: vi.fn(),
}));

vi.mock("../services/ai.js", () => ({
  matchJobWithAI: vi.fn(),
  draftProposalWithAI: vi.fn(),
}));

vi.mock("@lead-hunter/queue", () => ({
  addJob: vi.fn(),
  JobType: { Scrape: "scrape", AiScore: "ai-score", Enrichment: "enrichment", ProposalDraft: "proposal-draft" },
}));

import { matchProcessor } from "./match.worker.js";
import { findJobPostingByPlatformAndExternalId, upsertJobPosting } from "@lead-hunter/database";
import { loadResumeProfile } from "@lead-hunter/config/resume-profile.js";
import { matchJobWithAI } from "../services/ai.js";
import { addJob, JobType } from "@lead-hunter/queue";

function fakeJob(payload: Record<string, unknown>): Job<JobPayload> {
  return { data: { id: "job-1", payload }, attemptsMade: 0 } as unknown as Job<JobPayload>;
}

const jobPosting = { id: 1, platform: "99freelas", external_id: "111", title: "Bot" };
const resume = { skills: ["Node.js"] };

beforeEach(() => {
  vi.mocked(findJobPostingByPlatformAndExternalId).mockReset().mockResolvedValue(jobPosting as any);
  vi.mocked(upsertJobPosting).mockReset();
  vi.mocked(loadResumeProfile).mockReset().mockResolvedValue(resume as any);
  vi.mocked(matchJobWithAI).mockReset();
  vi.mocked(addJob).mockReset();
});

describe("matchProcessor", () => {
  it("enqueues a proposal-draft job only when the match tier is APPLY", async () => {
    vi.mocked(matchJobWithAI).mockResolvedValue({
      score: 92,
      tier: "APPLY",
      dimensions: { skill_match: 90, rate_fit: 90, seniority_fit: 90, urgency: 90 },
      reason: "great fit",
      red_flags: [],
    } as any);
    vi.mocked(upsertJobPosting).mockResolvedValue({ ...jobPosting, tier: "APPLY" } as any);

    await matchProcessor(fakeJob({ platform: "99freelas", externalId: "111" }));

    expect(upsertJobPosting).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "99freelas",
        external_id: "111",
        score: 92,
        tier: "APPLY",
        status: "reviewing",
      }),
    );
    expect(addJob).toHaveBeenCalledTimes(1);
    expect(addJob).toHaveBeenCalledWith(JobType.ProposalDraft, { platform: "99freelas", externalId: "111" });
  });

  it("does not enqueue a proposal-draft job when the tier is not APPLY", async () => {
    vi.mocked(matchJobWithAI).mockResolvedValue({
      score: 40,
      tier: "SKIP",
      dimensions: { skill_match: 10, rate_fit: 10, seniority_fit: 10, urgency: 10 },
      reason: "not a fit",
      red_flags: ["budget too low"],
    } as any);
    vi.mocked(upsertJobPosting).mockResolvedValue({ ...jobPosting, tier: "SKIP" } as any);

    await matchProcessor(fakeJob({ platform: "99freelas", externalId: "111" }));

    expect(addJob).not.toHaveBeenCalled();
  });

  it("throws when the job posting is not found, so BullMQ retries", async () => {
    vi.mocked(findJobPostingByPlatformAndExternalId).mockResolvedValue(null);

    await expect(matchProcessor(fakeJob({ platform: "99freelas", externalId: "999" }))).rejects.toThrow(
      "Job posting 99freelas/999 not found in database",
    );
    expect(matchJobWithAI).not.toHaveBeenCalled();
    expect(upsertJobPosting).not.toHaveBeenCalled();
  });

  it("throws when the resume profile is missing, so BullMQ retries", async () => {
    vi.mocked(loadResumeProfile).mockResolvedValue(null);

    await expect(matchProcessor(fakeJob({ platform: "99freelas", externalId: "111" }))).rejects.toThrow(
      /ResumeProfile not found/,
    );
    expect(matchJobWithAI).not.toHaveBeenCalled();
  });

  it("throws when platform or externalId are missing from the payload", async () => {
    await expect(matchProcessor(fakeJob({ platform: "99freelas" }))).rejects.toThrow(
      "platform and externalId are required",
    );
    expect(findJobPostingByPlatformAndExternalId).not.toHaveBeenCalled();
  });
});
