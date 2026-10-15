import { describe, it, expect, vi, beforeEach } from "vitest";

const enqueueTriage = vi.fn().mockResolvedValue({ id: "t1" });
const updateJobPostingByRef = vi.fn().mockResolvedValue({});
const upsertJobPosting = vi.fn();
const scrape99Freelas = vi.fn();

vi.mock("@lead-hunter/queue", () => ({ enqueueTriage }));
vi.mock("@lead-hunter/scraper", () => ({ scrape99Freelas }));
vi.mock("@lead-hunter/database", () => ({ upsertJobPosting, updateJobPostingByRef }));

const { discoveryProcessor } = await import("../../apps/worker/src/workers/discovery.worker.js");

const scraped = (externalId: string) => ({
  platform: "99freelas",
  externalId,
  url: `https://www.99freelas.com.br/project/x-${externalId}`,
  title: "t",
  description: "d",
  skills: [],
  budgetType: "open" as const,
  budgetMin: null,
  budgetMax: null,
  currency: null,
  clientName: null,
  clientRating: null,
  clientReviewsCount: null,
  proposalsCount: 3,
  interestedCount: 3,
  category: null,
  subcategory: null,
  experienceLevel: null,
  isUrgent: false,
  isFeatured: false,
  postedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
});

const row = (overrides: Record<string, unknown>) => ({
  platform: "99freelas",
  external_id: "1",
  score: null,
  status: "discovered",
  proposals_count: 3,
  posted_at: new Date(),
  expires_at: new Date(Date.now() + 86_400_000),
  ...overrides,
});

const job = { id: "d1", attemptsMade: 0, data: {} };

beforeEach(() => {
  enqueueTriage.mockClear();
  updateJobPostingByRef.mockClear();
  upsertJobPosting.mockReset();
  scrape99Freelas.mockReset();
});

describe("discovery screening", () => {
  it("sends a live job to triage", async () => {
    scrape99Freelas.mockResolvedValue([scraped("1")]);
    upsertJobPosting.mockResolvedValue(row({}));

    await discoveryProcessor(job as never);

    expect(enqueueTriage).toHaveBeenCalledWith({ platform: "99freelas", externalId: "1" });
    expect(updateJobPostingByRef).not.toHaveBeenCalled();
  });

  it("dismisses an over-subscribed job without spending an AI call", async () => {
    scrape99Freelas.mockResolvedValue([scraped("1")]);
    upsertJobPosting.mockResolvedValue(row({ proposals_count: 230 }));

    await discoveryProcessor(job as never);

    expect(enqueueTriage).not.toHaveBeenCalled();
    const [, , fields] = updateJobPostingByRef.mock.calls[0];
    expect(fields.status).toBe("dismissed");
    expect(fields.dismissed_reason).toContain("too_many_proposals");
    expect(fields.dismissed_reason).toContain("230");
  });

  it("dismisses an expired job", async () => {
    scrape99Freelas.mockResolvedValue([scraped("1")]);
    upsertJobPosting.mockResolvedValue(row({ expires_at: new Date(Date.now() - 1000) }));

    await discoveryProcessor(job as never);

    expect(enqueueTriage).not.toHaveBeenCalled();
    expect(updateJobPostingByRef.mock.calls[0][2].dismissed_reason).toContain("expired");
  });

  it("leaves an already-triaged job alone", async () => {
    scrape99Freelas.mockResolvedValue([scraped("1")]);
    upsertJobPosting.mockResolvedValue(row({ score: 72, status: "triaged" }));

    await discoveryProcessor(job as never);

    expect(enqueueTriage).not.toHaveBeenCalled();
    expect(updateJobPostingByRef).not.toHaveBeenCalled();
  });

  /**
   * Uma vaga descartada volta na listagem a cada rodada e continua sem score.
   * Sem a guarda de status ela seria reavaliada para sempre — e um descarte
   * manual feito na tela de revisão seria desfeito na rodada seguinte.
   */
  it("does not re-screen a job that is already dismissed", async () => {
    scrape99Freelas.mockResolvedValue([scraped("1")]);
    upsertJobPosting.mockResolvedValue(row({ status: "dismissed", proposals_count: 230 }));

    await discoveryProcessor(job as never);

    expect(enqueueTriage).not.toHaveBeenCalled();
    expect(updateJobPostingByRef).not.toHaveBeenCalled();
  });

  it("does not resurrect a manually dismissed job that is otherwise healthy", async () => {
    scrape99Freelas.mockResolvedValue([scraped("1")]);
    upsertJobPosting.mockResolvedValue(row({ status: "dismissed" }));

    await discoveryProcessor(job as never);

    expect(enqueueTriage).not.toHaveBeenCalled();
  });

  it("handles a mixed batch independently", async () => {
    scrape99Freelas.mockResolvedValue([scraped("1"), scraped("2"), scraped("3")]);
    upsertJobPosting
      .mockResolvedValueOnce(row({ external_id: "1" }))
      .mockResolvedValueOnce(row({ external_id: "2", proposals_count: 500 }))
      .mockResolvedValueOnce(row({ external_id: "3", score: 80 }));

    await discoveryProcessor(job as never);

    expect(enqueueTriage).toHaveBeenCalledTimes(1);
    expect(enqueueTriage).toHaveBeenCalledWith({ platform: "99freelas", externalId: "1" });
    expect(updateJobPostingByRef).toHaveBeenCalledTimes(1);
    expect(updateJobPostingByRef.mock.calls[0][1]).toBe("2");
  });
});
