import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildListingUrl,
  extractExternalId,
  parseBudget,
  parseDetailPage,
  parseLastPage,
  parseListingPage,
} from "@lead-hunter/scraper";

/**
 * As fixtures são HTML real capturado de www.99freelas.com.br. Testar contra elas
 * é o que detecta a quebra de seletor: se o site mudar o markup, estes testes
 * continuam verdes mas a captura de uma fixture nova falha — e é a fixture, não
 * o parser, que precisa ser atualizada primeiro.
 */
const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, "../fixtures/99freelas", name), "utf-8");

const listingHtml = fixture("listing.html");
const detailHtml = fixture("detail.html");

describe("parseListingPage", () => {
  const jobs = parseListingPage(listingHtml);

  it("extracts every result item on the page", () => {
    expect(jobs).toHaveLength(10);
  });

  it("reads the full description from data-content instead of the truncated text", () => {
    const job = jobs[0];
    // O texto visível é cortado com "..."; o data-content traz o original.
    expect(job.description.length).toBeGreaterThan(900);
    expect(job.description).toContain("Argon2D");
    expect(job.description).not.toContain("&ccedil;");
    expect(job.description).not.toContain("<br");
  });

  it("maps the listing fields of a fully populated item", () => {
    expect(jobs[0]).toMatchObject({
      platform: "99freelas",
      externalId: "791466",
      title: "Desenvolvimento de aplicativo web para gestão de associados",
      skills: ["HTML5", "MySQL", "PHP5"],
      clientName: "Hugo R",
      clientRating: 5,
      clientReviewsCount: 12,
      proposalsCount: 129,
      interestedCount: 141,
      subcategory: "Desenvolvimento Web",
      experienceLevel: "Especialista",
      isUrgent: true,
      isFeatured: true,
    });
  });

  it("strips the ?fs=t click-tracking suffix so the URL dedupes", () => {
    expect(jobs[0].url).toBe(
      "https://www.99freelas.com.br/project/desenvolvimento-de-aplicativo-web-para-gestao-de-associados-791466",
    );
  });

  it("converts cp-datetime epoch millis into an ISO timestamp", () => {
    expect(jobs[0].postedAt).toBe("2026-10-14T16:29:30.000Z");
    expect(jobs[0].expiresAt).toBe("2026-11-13T16:29:31.000Z");
  });

  it("reports a client with no history as unrated rather than rated zero", () => {
    // data-score="0.0" sem texto de avaliações significa cliente novo.
    const unrated = jobs.find((job) => job.externalId === "791592");
    expect(unrated?.clientReviewsCount).toBeNull();
    expect(unrated?.clientRating).toBeNull();
  });

  it("leaves budget unset — the listing page does not carry it", () => {
    expect(jobs[0].budgetType).toBe("unknown");
    expect(jobs[0].budgetMin).toBeNull();
  });
});

describe("parseLastPage", () => {
  it("reads the highest advertised page number", () => {
    expect(parseLastPage(listingHtml)).toBe(137);
  });

  it("falls back to a single page when there is no pagination", () => {
    expect(parseLastPage("<html><body></body></html>")).toBe(1);
  });
});

describe("parseDetailPage", () => {
  it("reads the additional-information table", () => {
    expect(parseDetailPage(detailHtml)).toEqual({
      budgetType: "open",
      // "Orçamento: Aberto" não traz faixa; o piso vem de "Valor Mínimo: R$ 50,00".
      budgetMin: 50,
      budgetMax: null,
      currency: "BRL",
      category: "Web, Mobile & Software",
      subcategory: "Desenvolvimento Web",
      experienceLevel: "Especialista",
    });
  });
});

describe("parseBudget", () => {
  it("treats an open budget as open, not as unreadable", () => {
    expect(parseBudget("Aberto")).toEqual({
      type: "open",
      min: null,
      max: null,
      currency: null,
    });
  });

  it("parses a Brazilian-formatted range", () => {
    expect(parseBudget("R$ 1.000,00 - R$ 2.500,00")).toEqual({
      type: "fixed",
      min: 1000,
      max: 2500,
      currency: "BRL",
    });
  });

  it("parses a single fixed amount", () => {
    expect(parseBudget("R$ 50,00")).toMatchObject({ type: "fixed", min: 50, max: 50, currency: "BRL" });
  });

  it("detects hourly rates", () => {
    expect(parseBudget("R$ 120,00 por hora")).toMatchObject({ type: "hourly", min: 120 });
  });

  it("returns unknown for empty input", () => {
    expect(parseBudget("")).toEqual({ type: "unknown", min: null, max: null, currency: null });
  });
});

describe("extractExternalId", () => {
  it("takes the trailing numeric id from the project slug", () => {
    expect(
      extractExternalId("https://www.99freelas.com.br/project/criacao-de-logotipo-791591"),
    ).toBe("791591");
  });

  it("falls back to a stable hash for URLs without an id", () => {
    const id = extractExternalId("not a url");
    expect(id).toBe(extractExternalId("not a url"));
    expect(id.length).toBeGreaterThan(0);
  });
});

describe("buildListingUrl", () => {
  it("uses /projects — /projetos returns 404 on the live site", () => {
    expect(buildListingUrl({})).toBe("https://www.99freelas.com.br/projects");
  });

  it("omits page=1 and appends the filters that work as GET params", () => {
    expect(buildListingUrl({ page: 1 })).toBe("https://www.99freelas.com.br/projects");
    expect(buildListingUrl({ page: 3, query: "node", category: "web-mobile-e-software" })).toBe(
      "https://www.99freelas.com.br/projects?page=3&q=node&categoria=web-mobile-e-software",
    );
  });
});
