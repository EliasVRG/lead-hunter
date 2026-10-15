import { describe, it, expect } from "vitest";
import {
  DIMENSION_WEIGHTS,
  PROPOSAL_RESPONSE_FORMAT,
  TIER_THRESHOLDS,
  TRIAGE_RESPONSE_FORMAT,
  extractJson,
  normalizeProposal,
  normalizeTriage,
  scoreFromDimensions,
  tierForScore,
  unassessableDimensions,
} from "@lead-hunter/ai";

const validTriage = {
  dimensions: { skill_match: 34, rate_fit: 14, seniority_fit: 16, urgency: 12 },
  score: 76,
  tier: "APPLY",
  reason: "Stack bate com Node e Postgres.",
  red_flags: [],
  matched_skills: ["Node.js"],
  missing_skills: [],
  recommended_action: "Candidatar-se.",
  confidence: 0.8,
};

describe("normalizeTriage", () => {
  it("accepts a well-formed payload unchanged", () => {
    expect(normalizeTriage(validTriage)).toMatchObject({ score: 76, tier: "APPLY" });
  });

  it("recomputes score from the dimensions instead of trusting the model's arithmetic", () => {
    const result = normalizeTriage({ ...validTriage, score: 95 });
    expect(result.score).toBe(76);
  });

  it("derives tier from the recomputed score, overriding the model", () => {
    // Dimensões somam 20 -> SKIP, apesar de o modelo ter dito APPLY.
    const result = normalizeTriage({
      ...validTriage,
      dimensions: { skill_match: 10, rate_fit: 4, seniority_fit: 3, urgency: 3 },
      tier: "APPLY",
    });
    expect(result.score).toBe(20);
    expect(result.tier).toBe("SKIP");
  });

  it("clamps dimensions that exceed their weight", () => {
    const result = normalizeTriage({
      ...validTriage,
      dimensions: { skill_match: 400, rate_fit: -5, seniority_fit: 20, urgency: 20 },
    });
    expect(result.dimensions.skill_match).toBe(DIMENSION_WEIGHTS.skill_match);
    expect(result.dimensions.rate_fit).toBe(0);
    expect(result.score).toBe(80);
  });

  it("rounds fractional dimension scores to integers", () => {
    const result = normalizeTriage({
      ...validTriage,
      dimensions: { skill_match: 33.7, rate_fit: 14.2, seniority_fit: 16, urgency: 12 },
    });
    expect(result.dimensions).toEqual({
      skill_match: 34,
      rate_fit: 14,
      seniority_fit: 16,
      urgency: 12,
    });
  });

  it("coerces numbers sent as strings", () => {
    const result = normalizeTriage({
      ...validTriage,
      dimensions: { skill_match: "34", rate_fit: "14", seniority_fit: "16", urgency: "12" },
    });
    expect(result.score).toBe(76);
  });

  it("rescales confidence reported as a percentage", () => {
    expect(normalizeTriage({ ...validTriage, confidence: 85 }).confidence).toBe(0.85);
    expect(normalizeTriage({ ...validTriage, confidence: 0.85 }).confidence).toBe(0.85);
  });

  it("supplies defaults for optional list fields", () => {
    const result = normalizeTriage({
      dimensions: validTriage.dimensions,
      reason: "ok",
    });
    expect(result.red_flags).toEqual([]);
    expect(result.matched_skills).toEqual([]);
    expect(result.recommended_action).toBe("");
  });

  it("dedupes and trims list entries", () => {
    const result = normalizeTriage({
      ...validTriage,
      matched_skills: [" Node.js ", "Node.js", "", "Postgres"],
    });
    expect(result.matched_skills).toEqual(["Node.js", "Postgres"]);
  });

  it("rejects a payload with no dimensions at all", () => {
    expect(() => normalizeTriage({ reason: "sem dimensões" })).toThrow();
  });

  it("rejects an empty reason — an unexplained score is not usable", () => {
    expect(() => normalizeTriage({ ...validTriage, reason: "" })).toThrow();
  });
});

/**
 * No 99Freelas praticamente todo projeto é publicado com orçamento "Aberto"
 * (14 de 14 na primeira rodada real). Contar `rate_fit` nesse caso fixava a
 * dimensão num valor constante e derrubava o teto do score para 75, tornando
 * APPLY (>= 70) quase inalcançável. Daí a renormalização.
 */
describe("unassessableDimensions", () => {
  it.each(["open", "unknown"])("drops rate_fit when the budget is %s", (budgetType) => {
    expect(unassessableDimensions({ budgetType })).toEqual(["rate_fit"]);
  });

  it.each(["fixed", "hourly"])("keeps every dimension when the budget is %s", (budgetType) => {
    expect(unassessableDimensions({ budgetType })).toEqual([]);
  });

  it("assesses everything when no context is given", () => {
    // Um orçamento ilegível chega como 'unknown' do scraper, não como null —
    // `null` aqui significa "ninguém passou contexto", e aí o comportamento
    // conservador é não excluir nada.
    expect(unassessableDimensions({})).toEqual([]);
    expect(unassessableDimensions({ budgetType: null })).toEqual([]);
  });
});

describe("scoreFromDimensions", () => {
  const perfect = { skill_match: 40, rate_fit: 20, seniority_fit: 20, urgency: 20 };

  it("sums the dimensions when all are assessable", () => {
    expect(scoreFromDimensions(perfect)).toBe(100);
    expect(scoreFromDimensions({ ...perfect, skill_match: 20 })).toBe(80);
  });

  it("rescales to 0-100 over the remaining weights", () => {
    // 38 + 18 + 5 = 61 de 80 disponíveis -> 76, não 61.
    const score = scoreFromDimensions(
      { skill_match: 38, rate_fit: 0, seniority_fit: 18, urgency: 5 },
      ["rate_fit"],
    );
    expect(score).toBe(76);
  });

  it("ignores whatever the excluded dimension scored", () => {
    const dims = { skill_match: 30, rate_fit: 20, seniority_fit: 15, urgency: 10 };
    expect(scoreFromDimensions(dims, ["rate_fit"])).toBe(
      scoreFromDimensions({ ...dims, rate_fit: 0 }, ["rate_fit"]),
    );
  });

  it("still reaches 100 when every assessable dimension is maxed", () => {
    expect(scoreFromDimensions({ ...perfect, rate_fit: 0 }, ["rate_fit"])).toBe(100);
  });

  it("falls back to the MAYBE threshold when nothing can be assessed", () => {
    // 0 viraria SKIP, afirmando incompatibilidade onde há só ignorância.
    const score = scoreFromDimensions({ skill_match: 0, rate_fit: 0, seniority_fit: 0, urgency: 0 }, [
      "skill_match",
      "rate_fit",
      "seniority_fit",
      "urgency",
    ]);
    expect(score).toBe(TIER_THRESHOLDS.MAYBE);
    expect(tierForScore(score)).toBe("MAYBE");
  });
});

describe("normalizeTriage with an open budget", () => {
  const dims = { skill_match: 38, rate_fit: 0, seniority_fit: 18, urgency: 5 };

  it("renormalizes the score and records the excluded dimension", () => {
    const result = normalizeTriage(
      { ...validTriage, dimensions: dims },
      { budgetType: "open" },
    );

    expect(result.unassessed).toEqual(["rate_fit"]);
    expect(result.score).toBe(76);
    expect(result.tier).toBe("APPLY");
  });

  it("would have scored the same job below APPLY without renormalization", () => {
    const result = normalizeTriage({ ...validTriage, dimensions: dims }, { budgetType: "fixed" });

    expect(result.unassessed).toEqual([]);
    expect(result.score).toBe(61);
    expect(result.tier).toBe("MAYBE");
  });

  it("keeps the raw dimension values visible for the explanation", () => {
    const result = normalizeTriage({ ...validTriage, dimensions: dims }, { budgetType: "open" });
    expect(result.dimensions).toEqual(dims);
  });

  it("ignores an `unassessed` claimed by the model — the budget type decides", () => {
    const result = normalizeTriage(
      { ...validTriage, dimensions: dims, unassessed: ["skill_match", "urgency"] },
      { budgetType: "open" },
    );
    expect(result.unassessed).toEqual(["rate_fit"]);
  });
});

describe("tierForScore", () => {
  it.each([
    [0, "SKIP"],
    [39, "SKIP"],
    [40, "MAYBE"],
    [69, "MAYBE"],
    [70, "APPLY"],
    [100, "APPLY"],
  ])("maps score %i to %s", (score, tier) => {
    expect(tierForScore(score)).toBe(tier);
  });
});

describe("normalizeProposal", () => {
  const validProposal = {
    summary: "Experiência direta com o stack pedido.",
    body: "Entendi que você precisa de um sistema de associados.\n\nJá construí algo parecido.",
    key_points: ["Node.js", "Postgres"],
    questions: ["O ECONSIG tem sandbox?"],
    estimated_days: 20,
    suggested_price: 4500.5,
    currency: "brl",
  };

  it("computes word_count from the cleaned body", () => {
    const result = normalizeProposal(validProposal);
    expect(result.word_count).toBe(result.body.split(/\s+/).filter(Boolean).length);
  });

  it("strips markdown fences and a redundant 'Proposta:' prefix", () => {
    const result = normalizeProposal({
      ...validProposal,
      body: "```\nProposta: Entendi o escopo do projeto.\n```",
    });
    expect(result.body).toBe("Entendi o escopo do projeto.");
  });

  it("uppercases the currency and rounds the price to cents", () => {
    const result = normalizeProposal({ ...validProposal, suggested_price: 4500.555 });
    expect(result.currency).toBe("BRL");
    expect(result.suggested_price).toBe(4500.56);
  });

  it("drops the currency when there is no price to denominate", () => {
    const result = normalizeProposal({ ...validProposal, suggested_price: null });
    expect(result.suggested_price).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("nulls out non-positive estimates instead of persisting zero days", () => {
    const result = normalizeProposal({ ...validProposal, estimated_days: 0, suggested_price: -10 });
    expect(result.estimated_days).toBeNull();
    expect(result.suggested_price).toBeNull();
  });

  it("caps key_points at 5 and questions at 3", () => {
    const result = normalizeProposal({
      ...validProposal,
      key_points: ["a", "b", "c", "d", "e", "f", "g"],
      questions: ["1", "2", "3", "4", "5"],
    });
    expect(result.key_points).toHaveLength(5);
    expect(result.questions).toHaveLength(3);
  });

  it("rejects an empty body", () => {
    expect(() => normalizeProposal({ ...validProposal, body: "   " })).toThrow();
  });
});

describe("extractJson", () => {
  it("parses a clean JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a markdown-fenced object", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers an object buried in prose", () => {
    expect(extractJson('Claro! Aqui vai:\n{"a":1}\nEspero que ajude.')).toEqual({ a: 1 });
  });

  it("tolerates a trailing comma", () => {
    expect(extractJson('{"a":1,"b":2,}')).toEqual({ a: 1, b: 2 });
  });

  it("does not stop at a closing brace that is inside a string", () => {
    expect(extractJson('{"a":"} not the end","b":2}')).toEqual({ a: "} not the end", b: 2 });
  });

  it("handles nested objects", () => {
    expect(extractJson('prefixo {"a":{"b":{"c":1}}} sufixo')).toEqual({ a: { b: { c: 1 } } });
  });

  it("throws when there is no object to find", () => {
    expect(() => extractJson("desculpe, não consigo ajudar")).toThrow();
  });
});

/**
 * Os structured outputs do OpenRouter, no modo strict, exigem
 * `additionalProperties: false` e que `required` liste todas as propriedades.
 * Um schema fora dessa forma é recusado com 400 pelo provider.
 */
describe("response_format schemas", () => {
  it.each([
    ["triage", TRIAGE_RESPONSE_FORMAT],
    ["proposal", PROPOSAL_RESPONSE_FORMAT],
  ])("%s declares a strict, fully-required schema", (_name, format) => {
    expect(format.json_schema.strict).toBe(true);

    const walk = (schema: Record<string, any>) => {
      if (schema.type === "object") {
        expect(schema.additionalProperties).toBe(false);
        expect(new Set(schema.required)).toEqual(new Set(Object.keys(schema.properties)));
        Object.values(schema.properties).forEach((child) => walk(child as Record<string, any>));
      }
    };

    walk(format.json_schema.schema as Record<string, any>);
  });

  it("keeps the triage schema in sync with the dimension weights", () => {
    const dimensions = (TRIAGE_RESPONSE_FORMAT.json_schema.schema.properties as any).dimensions;
    for (const [key, weight] of Object.entries(DIMENSION_WEIGHTS)) {
      expect(dimensions.properties[key].maximum).toBe(weight);
    }
  });
});
