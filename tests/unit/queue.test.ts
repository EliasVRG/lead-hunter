import { describe, it, expect } from "vitest";
import { JobType } from "@lead-hunter/queue";

describe("JobType", () => {
  it("should have valid job types", () => {
    expect(JobType.Scrape).toBe("scrape");
    expect(JobType.AiScore).toBe("ai-score");
    expect(JobType.Enrichment).toBe("enrichment");
    expect(JobType.ProposalDraft).toBe("proposal-draft");
  });
});
