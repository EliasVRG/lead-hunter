import { describe, it, expect, vi, afterEach } from "vitest";
import { isPathAllowed, isAllowedByRobots } from "./robots.js";

describe("isPathAllowed", () => {
  it("allows everything when robots.txt has no matching rules", () => {
    expect(isPathAllowed("", "/projetos/123")).toBe(true);
  });

  it("blocks a path matched by Disallow", () => {
    const robotsTxt = "User-agent: *\nDisallow: /admin";
    expect(isPathAllowed(robotsTxt, "/admin/dashboard")).toBe(false);
    expect(isPathAllowed(robotsTxt, "/projetos/123")).toBe(true);
  });

  it("lets a more specific Allow override a broader Disallow", () => {
    const robotsTxt = ["User-agent: *", "Disallow: /projetos", "Allow: /projetos/detalhe"].join("\n");
    expect(isPathAllowed(robotsTxt, "/projetos")).toBe(false);
    expect(isPathAllowed(robotsTxt, "/projetos/detalhe/123")).toBe(true);
  });

  it("prefers rules for a specific user-agent over the wildcard group", () => {
    const robotsTxt = [
      "User-agent: *",
      "Disallow: /projetos",
      "User-agent: LeadHunterBot",
      "Allow: /projetos",
    ].join("\n");

    expect(isPathAllowed(robotsTxt, "/projetos/123", "LeadHunterBot")).toBe(true);
    expect(isPathAllowed(robotsTxt, "/projetos/123", "OtherBot")).toBe(false);
  });
});

describe("isAllowedByRobots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows the path when robots.txt is absent (non-ok response)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, text: async () => "" }),
    );

    await expect(isAllowedByRobots("https://www.99freelas.com.br/projetos/123")).resolves.toBe(true);
  });

  it("allows the path when fetching robots.txt fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await expect(isAllowedByRobots("https://www.99freelas.com.br/projetos/123")).resolves.toBe(true);
  });

  it("respects a Disallow rule fetched from robots.txt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "User-agent: *\nDisallow: /projetos",
      }),
    );

    await expect(isAllowedByRobots("https://www.99freelas.com.br/projetos/123")).resolves.toBe(false);
  });
});
