import { describe, it, expect, vi, beforeEach } from "vitest";

const notifyQuietly = vi.fn().mockResolvedValue(true);
const enqueueProposal = vi.fn().mockResolvedValue({ id: "p1" });
const updateJobPostingByRef = vi.fn();

const posting = {
  platform: "99freelas",
  external_id: "790517",
  url: "https://www.99freelas.com.br/project/sistema-web-790517",
  title: "Sistema web para gerar mapas numerológicos",
  proposals_count: 230,
};

let triageResult: Record<string, unknown>;

vi.mock("@lead-hunter/notifier", () => ({ notifyQuietly }));
vi.mock("@lead-hunter/queue", () => ({ enqueueProposal }));
vi.mock("@lead-hunter/database", () => ({
  findJobPostingByPlatformAndExternalId: vi.fn().mockResolvedValue(posting),
  updateJobPostingByRef,
}));
vi.mock("@lead-hunter/config/resume-profile.js", () => ({
  loadResumeProfile: vi.fn().mockResolvedValue({ name: "Elias", skills: ["PHP"] }),
}));
vi.mock("@lead-hunter/ai", () => ({
  getAIProvider: () => ({
    triage: vi.fn(async () => ({
      data: triageResult,
      meta: { model: "stub:free", mode: "json_schema", attempts: 1 },
    })),
  }),
}));

const { triageProcessor } = await import("../../apps/worker/src/workers/triage.worker.js");

function result(overrides: Record<string, unknown> = {}) {
  return {
    score: 82,
    tier: "APPLY",
    dimensions: { skill_match: 38, rate_fit: 0, seniority_fit: 18, urgency: 10 },
    unassessed: ["rate_fit"],
    reason: "boa aderência",
    red_flags: [],
    matched_skills: ["PHP", "MySQL"],
    missing_skills: [],
    recommended_action: "candidatar-se",
    confidence: 0.8,
    ...overrides,
  };
}

const job = { id: "j1", attemptsMade: 0, data: { platform: "99freelas", externalId: "790517" } };

beforeEach(() => {
  notifyQuietly.mockClear();
  enqueueProposal.mockClear();
  triageResult = result();
  updateJobPostingByRef.mockResolvedValue({ tier: "APPLY" });
});

describe("triage notification", () => {
  it("alerts on APPLY with the score, title and link", async () => {
    await triageProcessor(job as never);

    expect(notifyQuietly).toHaveBeenCalledTimes(1);
    const sent = notifyQuietly.mock.calls[0][0];
    expect(sent.title).toContain("82");
    expect(sent.title).toContain("Sistema web para gerar mapas numerológicos");
    expect(sent.url).toBe(posting.url);
  });

  it("includes competing proposal count — the user decides on speed", async () => {
    await triageProcessor(job as never);
    expect(notifyQuietly.mock.calls[0][0].body).toContain("230 propostas concorrentes");
  });

  it("surfaces red flags in the alert", async () => {
    triageResult = result({ red_flags: ["Cliente sem avaliações"] });
    await triageProcessor(job as never);
    expect(notifyQuietly.mock.calls[0][0].body).toContain("Cliente sem avaliações");
  });

  it.each(["MAYBE", "SKIP"])("stays silent on %s", async (tier) => {
    triageResult = result({ tier, score: 50 });
    updateJobPostingByRef.mockResolvedValue({ tier });

    await triageProcessor(job as never);

    expect(notifyQuietly).not.toHaveBeenCalled();
    expect(enqueueProposal).not.toHaveBeenCalled();
  });

  it("notifies at triage, not after the draft — the draft lags ~20s behind", async () => {
    await triageProcessor(job as never);
    // Enfileirar a proposta e avisar acontecem na mesma passagem; o aviso não
    // espera o rascunho ficar pronto.
    expect(enqueueProposal).toHaveBeenCalledTimes(1);
    expect(notifyQuietly).toHaveBeenCalledTimes(1);
  });
});
