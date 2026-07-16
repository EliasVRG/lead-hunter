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

import { proposalProcessor } from "./proposal.worker.js";
import { findJobPostingByPlatformAndExternalId, upsertJobPosting } from "@lead-hunter/database";
import { loadResumeProfile } from "@lead-hunter/config/resume-profile.js";
import { draftProposalWithAI } from "../services/ai.js";

function fakeJob(payload: Record<string, unknown>): Job<JobPayload> {
  return { data: { id: "job-1", payload }, attemptsMade: 0 } as unknown as Job<JobPayload>;
}

const jobPosting = { id: 1, platform: "99freelas", external_id: "111", title: "Bot" };
const resume = { skills: ["Node.js"] };

beforeEach(() => {
  vi.mocked(findJobPostingByPlatformAndExternalId).mockReset().mockResolvedValue(jobPosting as any);
  vi.mocked(upsertJobPosting).mockReset();
  vi.mocked(loadResumeProfile).mockReset().mockResolvedValue(resume as any);
  vi.mocked(draftProposalWithAI).mockReset();
});

describe("proposalProcessor", () => {
  it("saves the AI-generated draft and marks the posting proposal_ready", async () => {
    vi.mocked(draftProposalWithAI).mockResolvedValue("Olá, tenho experiência com...");
    vi.mocked(upsertJobPosting).mockResolvedValue({ ...jobPosting, status: "proposal_ready" } as any);

    await proposalProcessor(fakeJob({ platform: "99freelas", externalId: "111" }));

    expect(draftProposalWithAI).toHaveBeenCalledWith(jobPosting, resume);
    expect(upsertJobPosting).toHaveBeenCalledWith({
      platform: "99freelas",
      external_id: "111",
      proposal_draft: "Olá, tenho experiência com...",
      status: "proposal_ready",
    });
  });

  it("throws when the job posting is not found, so BullMQ retries", async () => {
    vi.mocked(findJobPostingByPlatformAndExternalId).mockResolvedValue(null);

    await expect(proposalProcessor(fakeJob({ platform: "99freelas", externalId: "999" }))).rejects.toThrow(
      "Job posting 99freelas/999 not found in database",
    );
    expect(draftProposalWithAI).not.toHaveBeenCalled();
    expect(upsertJobPosting).not.toHaveBeenCalled();
  });

  it("throws when the resume profile is missing, so BullMQ retries", async () => {
    vi.mocked(loadResumeProfile).mockResolvedValue(null);

    await expect(proposalProcessor(fakeJob({ platform: "99freelas", externalId: "111" }))).rejects.toThrow(
      /ResumeProfile not found/,
    );
    expect(draftProposalWithAI).not.toHaveBeenCalled();
  });

  it("throws when platform or externalId are missing from the payload", async () => {
    await expect(proposalProcessor(fakeJob({ externalId: "111" }))).rejects.toThrow(
      "platform and externalId are required",
    );
    expect(findJobPostingByPlatformAndExternalId).not.toHaveBeenCalled();
  });
});
