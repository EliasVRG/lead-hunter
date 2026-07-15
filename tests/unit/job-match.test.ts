import { describe, it, expect } from "vitest";
import { jobMatchSchema } from "@lead-hunter/ai/schemas/job-match.schema.js";
import { buildJobMatchPrompt } from "@lead-hunter/ai/prompts/job-match.prompt.js";
import { proposalDraftSchema } from "@lead-hunter/ai/schemas/proposal-draft.schema.js";
import { buildProposalDraftPrompt } from "@lead-hunter/ai/prompts/proposal-draft.prompt.js";

describe("Job Match Scoring AI", () => {
  it("should validate a correct job match payload", () => {
    const validPayload = {
      score: 82,
      tier: "APPLY",
      dimensions: {
        skill_match: 35,
        rate_fit: 18,
        seniority_fit: 17,
        urgency: 12,
      },
      reason: "Stack pedida bate com o perfil; orçamento dentro da faixa aceita.",
      red_flags: [],
      recommended_action: "Candidatar-se com proposta focada em experiência com scraping.",
    };

    const parsed = jobMatchSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("should fail validation if score is out of bounds", () => {
    const invalidPayload = {
      score: 150,
      tier: "APPLY",
      dimensions: { skill_match: 35, rate_fit: 18, seniority_fit: 17, urgency: 12 },
      reason: "Invalid",
      red_flags: [],
      recommended_action: "N/A",
    };

    const parsed = jobMatchSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it("should fail validation on an unknown tier", () => {
    const invalidPayload = {
      score: 50,
      tier: "HOT",
      dimensions: { skill_match: 20, rate_fit: 10, seniority_fit: 10, urgency: 10 },
      reason: "Invalid tier",
      red_flags: [],
      recommended_action: "N/A",
    };

    const parsed = jobMatchSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it("should build a prompt containing job and resume information", () => {
    const job = {
      title: "Automação de scraping com Playwright",
      description: "Precisamos de um scraper resiliente",
      skills: ["Node.js", "Playwright"],
      budgetType: "fixed",
      budgetMin: 2000,
      budgetMax: 4000,
      currency: "BRL",
    };
    const resume = {
      name: "Elias",
      seniority: "pleno",
      skills: ["Node.js", "Playwright", "TypeScript"],
      stack: ["Node.js"],
      minRate: 1500,
      maxRate: 5000,
      currency: "BRL",
    };

    const prompt = buildJobMatchPrompt(job, resume);
    expect(prompt).toContain("Automação de scraping com Playwright");
    expect(prompt).toContain("Node.js, Playwright");
    expect(prompt).toContain("pleno");
    expect(prompt).toContain("skill_match");
  });
});

describe("Proposal Draft AI", () => {
  it("should validate a correct proposal draft payload", () => {
    const parsed = proposalDraftSchema.safeParse({ proposalDraft: "Tenho experiência com..." });
    expect(parsed.success).toBe(true);
  });

  it("should fail validation on empty proposal text", () => {
    const parsed = proposalDraftSchema.safeParse({ proposalDraft: "" });
    expect(parsed.success).toBe(false);
  });

  it("should build a prompt referencing the specific job", () => {
    const job = { title: "Bot de automação para 99Freelas", description: "...", skills: ["Playwright"] };
    const resume = { name: "Elias", skills: ["Playwright"], stack: ["Node.js"], bio: "Dev freelancer" };

    const prompt = buildProposalDraftPrompt(job, resume);
    expect(prompt).toContain("Bot de automação para 99Freelas");
    expect(prompt).toContain("proposalDraft");
  });
});
