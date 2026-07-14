import { describe, it, expect } from "vitest";
import { extractEmails, extractPhones } from "@lead-hunter/scraper";
import { detectTechnologies } from "@lead-hunter/scraper";

describe("extractEmails", () => {
  it("should extract emails from HTML", () => {
    const html = 'contact@company-site.com and admin@test.com.br';
    const emails = extractEmails(html);
    expect(emails).toContain("contact@company-site.com");
    expect(emails).toContain("admin@test.com.br");
  });

  it("should filter blocked domains", () => {
    const html = "foo@example.com bar@email.com";
    expect(extractEmails(html)).toEqual([]);
  });

  it("should deduplicate emails", () => {
    const html = "a@b.com a@b.com";
    expect(extractEmails(html)).toEqual(["a@b.com"]);
  });
});

describe("extractPhones", () => {
  it("should extract phone numbers", () => {
    const html = "Call (11) 99999-8888 or +55 11 91234-5678";
    const phones = extractPhones(html);
    expect(phones.length).toBeGreaterThan(0);
  });
});

describe("detectTechnologies", () => {
  it("should detect WordPress", () => {
    const html = '<meta name="generator" content="WordPress" />';
    const { technologies, cms } = detectTechnologies(html, {});
    expect(technologies).toContain("WordPress");
    expect(cms).toBe("WordPress");
  });

  it("should detect React", () => {
    const html = '<script src="react.min.js"></script>';
    const { technologies } = detectTechnologies(html, {});
    expect(technologies).toContain("React");
  });

  it("should detect Cloudflare", () => {
    const html = "cloudflare";
    const { technologies } = detectTechnologies(html, {});
    expect(technologies).toContain("Cloudflare");
  });
});
