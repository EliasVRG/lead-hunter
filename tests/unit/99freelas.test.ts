import { describe, it, expect } from "vitest";
import { parseBudget, extractExternalId } from "@lead-hunter/scraper";

describe("parseBudget", () => {
  it("should parse a fixed budget range in BRL", () => {
    const result = parseBudget("Orçamento fixo: R$ 1.500,00 a R$ 3.000,00");
    expect(result.type).toBe("fixed");
    expect(result.currency).toBe("BRL");
    expect(result.min).toBe(1500);
    expect(result.max).toBe(3000);
  });

  it("should parse an hourly rate", () => {
    const result = parseBudget("R$ 80,00 por hora");
    expect(result.type).toBe("hourly");
    expect(result.min).toBe(80);
  });

  it("should return unknown for empty text", () => {
    const result = parseBudget("");
    expect(result.type).toBe("unknown");
    expect(result.min).toBeNull();
    expect(result.max).toBeNull();
  });
});

describe("extractExternalId", () => {
  it("should extract a numeric id that is its own path segment", () => {
    expect(extractExternalId("https://www.99freelas.com.br/projetos/12345/bot-de-scraping")).toBe("12345");
  });

  it("should extract a trailing numeric id from a slug", () => {
    expect(extractExternalId("https://www.99freelas.com.br/projetos/bot-de-scraping-12345")).toBe("12345");
  });

  it("should fall back to a stable hash when no numeric id is present", () => {
    const id1 = extractExternalId("https://www.99freelas.com.br/projetos/sem-id-numerico");
    const id2 = extractExternalId("https://www.99freelas.com.br/projetos/sem-id-numerico");
    expect(id1).toBe(id2);
    expect(id1.length).toBeGreaterThan(0);
  });
});
