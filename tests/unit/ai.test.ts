import { describe, it, expect } from "vitest";
import { leadScoreSchema } from "@lead-hunter/ai/schemas/lead-score.schema.js";
import { buildLeadScorePrompt } from "@lead-hunter/ai/prompts/lead-score.prompt.js";
import { getAIProvider } from "@lead-hunter/ai/factory.js";
import { GeminiProvider } from "@lead-hunter/ai/providers/gemini.provider.js";

describe("Lead Scoring AI Tests", () => {
  it("should validate a correct lead score payload", () => {
    const validPayload = {
      score: 87,
      tiers: "HOT",
      dimensions: {
        technical_pain: 25,
        digital_maturity: 20,
        urgency: 18,
        financial_potential: 24,
      },
      reason: "Site lento, tecnologia antiga e forte presença comercial indicam alta oportunidade.",
      recommended_approach: "Abordagem consultiva focada em performance e modernização de infraestrutura.",
    };

    const parsed = leadScoreSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it("should fail validation if score is out of bounds", () => {
    const invalidPayload = {
      score: 105,
      tiers: "HOT",
      dimensions: {
        technical_pain: 25,
        digital_maturity: 20,
        urgency: 18,
        financial_potential: 24,
      },
      reason: "Invalid score range",
      recommended_approach: "Abordagem customizada",
    };

    const parsed = leadScoreSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it("should build prompt contains lead information", () => {
    const lead = {
      website: "exemplo.com",
      title: "Página de Exemplo",
      meta: "Meta descrição",
      tech_stack: ["wordpress", "google-analytics"],
      cms: "WordPress",
      performance_score: 45,
    };

    const prompt = buildLeadScorePrompt(lead);
    expect(prompt).toContain("exemplo.com");
    expect(prompt).toContain("WordPress");
    expect(prompt).toContain("wordpress, google-analytics");
    expect(prompt).toContain("45");
  });

  it("should return the correct provider from factory", () => {
    // Under default environment setting, provider is gemini
    const provider = getAIProvider();
    expect(provider).toBeInstanceOf(GeminiProvider);
  });
});
