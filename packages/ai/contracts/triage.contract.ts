import { z } from "zod";
import {
  enumField,
  integerRange,
  responseFormat,
  stringArray,
  stringField,
  strictObject,
} from "./json-schema.js";

export const TIERS = ["SKIP", "MAYBE", "APPLY"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Pesos máximos de cada dimensão. O score final é a soma delas, então os pesos
 * somam 100 e mudar um deles muda a escala — os limiares de tier abaixo
 * assumem este total.
 */
export const DIMENSION_WEIGHTS = {
  skill_match: 40,
  rate_fit: 20,
  seniority_fit: 20,
  urgency: 20,
} as const;

export type DimensionKey = keyof typeof DIMENSION_WEIGHTS;

export const TIER_THRESHOLDS = { APPLY: 70, MAYBE: 40 } as const;

/**
 * Schema de **aceitação** da resposta crua do modelo.
 *
 * Deliberadamente mais frouxo que o contrato final: aceita número fracionário,
 * string numérica e campos fora de faixa, porque modelos gratuitos erram esses
 * detalhes com frequência. O aperto acontece em `normalizeTriage`, que é a
 * fronteira entre "o que o modelo disse" e "o que o sistema garante".
 * Rejeitar aqui gastaria uma chamada a mais para corrigir algo que sabemos
 * consertar deterministicamente.
 */
const numericish = z.coerce.number().finite();

export const rawTriageSchema = z.object({
  dimensions: z.object({
    skill_match: numericish,
    rate_fit: numericish,
    seniority_fit: numericish,
    urgency: numericish,
  }),
  score: numericish.optional(),
  tier: z.string().optional(),
  reason: z.string().min(1),
  red_flags: z.array(z.string()).default([]),
  matched_skills: z.array(z.string()).default([]),
  missing_skills: z.array(z.string()).default([]),
  recommended_action: z.string().default(""),
  confidence: numericish.default(0.5),
});

/** Contrato final, já normalizado — é isto que workers e banco consomem. */
export interface TriageResult {
  score: number;
  tier: Tier;
  dimensions: Record<DimensionKey, number>;
  reason: string;
  red_flags: string[];
  matched_skills: string[];
  missing_skills: string[];
  recommended_action: string;
  confidence: number;
}

export const triageResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: z.enum(TIERS),
  dimensions: z.object({
    skill_match: z.number().int().min(0).max(DIMENSION_WEIGHTS.skill_match),
    rate_fit: z.number().int().min(0).max(DIMENSION_WEIGHTS.rate_fit),
    seniority_fit: z.number().int().min(0).max(DIMENSION_WEIGHTS.seniority_fit),
    urgency: z.number().int().min(0).max(DIMENSION_WEIGHTS.urgency),
  }),
  reason: z.string().min(1),
  red_flags: z.array(z.string()),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  recommended_action: z.string(),
  confidence: z.number().min(0).max(1),
});

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function tierForScore(score: number): Tier {
  if (score >= TIER_THRESHOLDS.APPLY) return "APPLY";
  if (score >= TIER_THRESHOLDS.MAYBE) return "MAYBE";
  return "SKIP";
}

/**
 * Converte a resposta crua no contrato final.
 *
 * Duas coisas o modelo **não** decide, por mais que as tenha escrito:
 * - `score` é recalculado como a soma das dimensões. Modelos pequenos erram
 *   essa soma com frequência, e um score que não corresponde às dimensões
 *   torna a explicação inútil.
 * - `tier` é derivado do score pelos limiares. Senão o mesmo score produziria
 *   tiers diferentes entre modelos da cadeia de fallback, e é o tier que
 *   dispara a fila de proposta.
 *
 * As red flags entram no score pelas dimensões (o prompt instrui isso) e não
 * rebaixam o tier automaticamente — um rebaixamento silencioso tornaria o
 * score exibido inconsistente com a decisão tomada.
 */
export function normalizeTriage(raw: unknown): TriageResult {
  const parsed = rawTriageSchema.parse(raw);

  const dimensions = {
    skill_match: clampInt(parsed.dimensions.skill_match, 0, DIMENSION_WEIGHTS.skill_match),
    rate_fit: clampInt(parsed.dimensions.rate_fit, 0, DIMENSION_WEIGHTS.rate_fit),
    seniority_fit: clampInt(parsed.dimensions.seniority_fit, 0, DIMENSION_WEIGHTS.seniority_fit),
    urgency: clampInt(parsed.dimensions.urgency, 0, DIMENSION_WEIGHTS.urgency),
  };

  const score = Object.values(dimensions).reduce((total, value) => total + value, 0);

  const dedupe = (items: string[]) =>
    [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, 12);

  return triageResultSchema.parse({
    score,
    tier: tierForScore(score),
    dimensions,
    reason: parsed.reason.trim(),
    red_flags: dedupe(parsed.red_flags),
    matched_skills: dedupe(parsed.matched_skills),
    missing_skills: dedupe(parsed.missing_skills),
    recommended_action: parsed.recommended_action.trim(),
    // Alguns modelos devolvem confiança em porcentagem (0-100) em vez de 0-1.
    confidence: Math.min(1, Math.max(0, parsed.confidence > 1 ? parsed.confidence / 100 : parsed.confidence)),
  });
}

export const TRIAGE_RESPONSE_FORMAT = responseFormat(
  "triage_result",
  strictObject({
    dimensions: strictObject({
      skill_match: integerRange(0, DIMENSION_WEIGHTS.skill_match, "Aderência das skills exigidas ao stack do profissional"),
      rate_fit: integerRange(0, DIMENSION_WEIGHTS.rate_fit, "Compatibilidade entre orçamento da vaga e faixa de valor aceita"),
      seniority_fit: integerRange(0, DIMENSION_WEIGHTS.seniority_fit, "Compatibilidade entre complexidade da vaga e senioridade"),
      urgency: integerRange(0, DIMENSION_WEIGHTS.urgency, "Vale agir rápido? Poucas propostas, publicação recente"),
    }),
    score: integerRange(0, 100, "Soma exata das quatro dimensões"),
    tier: enumField(TIERS, "SKIP se score<40, MAYBE se 40-69, APPLY se >=70"),
    reason: stringField("Em português, 2 a 4 frases justificando cada dimensão"),
    red_flags: stringArray("Sinais de golpe ou vaga ruim. Vazio se não houver", 6),
    matched_skills: stringArray("Skills da vaga que o profissional domina", 12),
    missing_skills: stringArray("Skills da vaga ausentes no perfil", 12),
    recommended_action: stringField("Em português: candidatar-se ou não, e por quê"),
    confidence: { type: "number", minimum: 0, maximum: 1, description: "Confiança na avaliação, 0 a 1" },
  }),
);
