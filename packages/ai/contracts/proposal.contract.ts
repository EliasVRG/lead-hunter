import { z } from "zod";
import {
  nullableNumber,
  responseFormat,
  stringArray,
  stringField,
  strictObject,
} from "./json-schema.js";

/**
 * A proposta sai estruturada, não como um blob de texto.
 *
 * `body` é o que vai colado no formulário do 99Freelas; os outros campos
 * existem para revisão antes do envio — dá para bater o olho em `key_points` e
 * `questions` e decidir se vale abrir o rascunho inteiro, e `suggested_price`
 * fica visível como número em vez de enterrado no meio do texto.
 */
export interface ProposalDraft {
  summary: string;
  body: string;
  key_points: string[];
  questions: string[];
  estimated_days: number | null;
  suggested_price: number | null;
  currency: string | null;
  word_count: number;
}

const numericish = z.union([z.coerce.number().finite(), z.null()]).catch(null);

export const rawProposalSchema = z.object({
  summary: z.string().default(""),
  body: z.string().min(1),
  key_points: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  estimated_days: numericish.default(null),
  suggested_price: numericish.default(null),
  currency: z.string().nullable().default(null),
});

export const proposalDraftSchema = z.object({
  summary: z.string(),
  body: z.string().min(1),
  key_points: z.array(z.string()),
  questions: z.array(z.string()),
  estimated_days: z.number().int().positive().nullable(),
  suggested_price: z.number().positive().nullable(),
  currency: z.string().nullable(),
  word_count: z.number().int().nonnegative(),
});

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function normalizeProposal(raw: unknown): ProposalDraft {
  const parsed = rawProposalSchema.parse(raw);

  // Modelos às vezes embrulham o corpo em fences ou prefixam "Proposta:".
  const body = parsed.body
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/, "")
    .replace(/^\s*(proposta|proposal)\s*:\s*/i, "")
    .trim();

  const dedupe = (items: string[], limit: number) =>
    [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(0, limit);

  const positiveInt = (value: number | null) =>
    value !== null && value > 0 ? Math.round(value) : null;

  const suggestedPrice = parsed.suggested_price !== null && parsed.suggested_price > 0
    ? Math.round(parsed.suggested_price * 100) / 100
    : null;

  return proposalDraftSchema.parse({
    summary: parsed.summary.trim(),
    body,
    key_points: dedupe(parsed.key_points, 5),
    questions: dedupe(parsed.questions, 3),
    estimated_days: positiveInt(parsed.estimated_days),
    suggested_price: suggestedPrice,
    // Sem preço não há moeda a declarar — evita salvar "BRL" solto no banco.
    currency: suggestedPrice !== null ? (parsed.currency?.trim().toUpperCase() || "BRL") : null,
    word_count: countWords(body),
  });
}

export const PROPOSAL_RESPONSE_FORMAT = responseFormat(
  "proposal_draft",
  strictObject({
    summary: stringField("Uma frase resumindo o ângulo da proposta"),
    body: stringField(
      "Corpo da proposta em português, primeira pessoa, 3 a 5 parágrafos curtos, sem saudação nem despedida",
    ),
    key_points: stringArray("2 a 5 pontos que sustentam a candidatura", 5),
    questions: stringArray("Até 3 perguntas de esclarecimento ao cliente", 3),
    estimated_days: nullableNumber("Prazo estimado em dias, ou null se não der para estimar"),
    suggested_price: nullableNumber("Valor sugerido da proposta, ou null"),
    currency: { type: ["string", "null"], description: "Moeda do valor sugerido, ex: BRL" },
  }),
);
