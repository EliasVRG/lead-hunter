import { describe, it, expect } from "vitest";
import { screenJobPosting, type ScreeningConfig } from "@lead-hunter/screening";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const config = (overrides: Partial<ScreeningConfig> = {}): ScreeningConfig => ({
  dropExpired: true,
  maxProposals: 40,
  maxAgeHours: 0,
  ...overrides,
});

const live = { proposals_count: 3, posted_at: hoursAgo(1), expires_at: hoursAhead(500) };

describe("screenJobPosting", () => {
  it("keeps a fresh job with few competitors", () => {
    expect(screenJobPosting(live, config(), NOW)).toEqual({ keep: true });
  });

  describe("prazo encerrado", () => {
    it("drops a job whose deadline has passed", () => {
      const verdict = screenJobPosting({ ...live, expires_at: hoursAgo(1) }, config(), NOW);
      expect(verdict).toMatchObject({ keep: false, rule: "expired" });
    });

    it("drops a job expiring exactly now", () => {
      const verdict = screenJobPosting({ ...live, expires_at: new Date(NOW).toISOString() }, config(), NOW);
      expect(verdict.keep).toBe(false);
    });

    it("keeps it when the rule is off", () => {
      const verdict = screenJobPosting(
        { ...live, expires_at: hoursAgo(1) },
        config({ dropExpired: false }),
        NOW,
      );
      expect(verdict).toEqual({ keep: true });
    });
  });

  describe("concorrência", () => {
    it("drops a job above the proposal ceiling", () => {
      // O caso que motivou a fase: 230 propostas e mesmo assim virava APPLY.
      const verdict = screenJobPosting({ ...live, proposals_count: 230 }, config(), NOW);
      expect(verdict).toMatchObject({ keep: false, rule: "too_many_proposals" });
      expect((verdict as { reason: string }).reason).toContain("230");
    });

    it("keeps a job exactly at the ceiling", () => {
      expect(screenJobPosting({ ...live, proposals_count: 40 }, config(), NOW).keep).toBe(true);
    });

    it("drops a job one above the ceiling", () => {
      expect(screenJobPosting({ ...live, proposals_count: 41 }, config(), NOW).keep).toBe(false);
    });

    it("treats maxProposals 0 as disabled", () => {
      const verdict = screenJobPosting(
        { ...live, proposals_count: 9999 },
        config({ maxProposals: 0 }),
        NOW,
      );
      expect(verdict).toEqual({ keep: true });
    });
  });

  describe("idade", () => {
    it("is off by default — discovery already filters by maxAgeHours", () => {
      expect(screenJobPosting({ ...live, posted_at: hoursAgo(500) }, config(), NOW).keep).toBe(true);
    });

    it("drops an old job once enabled", () => {
      const verdict = screenJobPosting(
        { ...live, posted_at: hoursAgo(50) },
        config({ maxAgeHours: 24 }),
        NOW,
      );
      expect(verdict).toMatchObject({ keep: false, rule: "too_old" });
    });
  });

  /**
   * O scraper pode falhar em ler um campo. Tratar "não sei" como "está morta"
   * descartaria vaga boa em silêncio — o filtro só corta com evidência.
   */
  describe("dado ausente nunca descarta", () => {
    it.each([
      ["expires_at", { expires_at: null }],
      ["proposals_count", { proposals_count: null }],
      ["posted_at", { posted_at: null }],
    ])("keeps the job when %s is missing", (_field, patch) => {
      const verdict = screenJobPosting(
        { ...live, ...patch },
        config({ maxAgeHours: 1 }),
        NOW,
      );
      expect(verdict).toEqual({ keep: true });
    });

    it("keeps the job when every field is missing", () => {
      expect(screenJobPosting({}, config({ maxAgeHours: 1 }), NOW)).toEqual({ keep: true });
    });

    it("ignores an unparseable date instead of dropping", () => {
      const verdict = screenJobPosting({ ...live, expires_at: "ontem" }, config(), NOW);
      expect(verdict).toEqual({ keep: true });
    });
  });

  it("reproduces the pre-filter behaviour with every rule disabled", () => {
    const off = config({ dropExpired: false, maxProposals: 0, maxAgeHours: 0 });
    const dead = { proposals_count: 9999, posted_at: hoursAgo(9999), expires_at: hoursAgo(1) };
    expect(screenJobPosting(dead, off, NOW)).toEqual({ keep: true });
  });

  it("reports expiry before competition when both apply", () => {
    // Prazo encerrado é fato definitivo; concorrência é limiar escolhido.
    const verdict = screenJobPosting(
      { proposals_count: 500, expires_at: hoursAgo(1) },
      config(),
      NOW,
    );
    expect(verdict).toMatchObject({ rule: "expired" });
  });
});
