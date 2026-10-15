import postgres from "postgres";
import { dbConfig } from "@lead-hunter/config/db.js";
import { logger } from "@lead-hunter/logger";

const sql = postgres(dbConfig);

export interface Lead {
  id?: number;
  name: string | null;
  website: string | null;
  city: string | null;
  status_code: number | null;
  title: string | null;
  meta: string | null;
  tech: string | null;
  score: number | null;
  tiers: string | null;
  dimensions: any | null;
  reason: string | null;
  recommended_approach: string | null;
  emails?: string[];
  phones?: string[];
  social_linkedin?: string | null;
  social_instagram?: string | null;
  social_facebook?: string | null;
  tech_stack?: string[];
  cms?: string | null;
  performance_score?: number | null;
  lighthouse_performance?: number | null;
  lighthouse_accessibility?: number | null;
  lighthouse_seo?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export async function upsertLead(lead: Partial<Lead>): Promise<Lead> {
  if (!lead.website) throw new Error("website is required");

  const entries = Object.entries(lead).filter(
    ([k, v]) => k !== "id" && v !== undefined,
  );

  const cols = entries.map(([k]) => k);
  const vals = entries.map(([, v]) => v);

  const updates = cols
    .filter((k) => k !== "website")
    .map((k) => `${k} = COALESCE(EXCLUDED.${k}, leads.${k})`);

  const [result] = await sql.unsafe(
    `INSERT INTO leads (${cols.join(", ")})
     VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")})
     ON CONFLICT (website)
     DO UPDATE SET ${updates.join(", ")}
     RETURNING *`,
    vals,
  );

  return result as unknown as Lead;
}

export async function findLeadByWebsite(website: string): Promise<Lead | null> {
  const [result] = await sql`
    SELECT * FROM leads WHERE website = ${website}
  `;
  return (result ?? null) as unknown as Lead | null;
}

export async function healthcheck(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (err) {
    logger.error(err, "database healthcheck failed");
    return false;
  }
}

export const JOB_POSTING_STATUSES = [
  "discovered",
  "triaged",
  "proposal_ready",
  "applied",
  "won",
  "lost",
  "dismissed",
] as const;

export type JobPostingStatus = (typeof JOB_POSTING_STATUSES)[number];

export interface JobPostingRow {
  id?: number;
  platform: string;
  external_id: string;
  url: string;
  title: string;
  description: string | null;
  skills: string[] | null;
  budget_type: string | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  client_name: string | null;
  client_rating: number | null;
  client_reviews_count: number | null;
  proposals_count: number | null;
  interested_count: number | null;
  category: string | null;
  subcategory: string | null;
  experience_level: string | null;
  is_urgent: boolean | null;
  is_featured: boolean | null;
  posted_at: Date | null;
  expires_at: Date | null;

  // Contrato de triagem (packages/ai/contracts/triage.contract.ts)
  score: number | null;
  tier: string | null;
  dimensions: Record<string, number> | null;
  /** Dimensões fora do cálculo do score por falta de dado na vaga. */
  unassessed_dimensions: string[] | null;
  reason: string | null;
  red_flags: string[] | null;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  recommended_action: string | null;
  confidence: number | null;
  triage_model: string | null;

  // Contrato de proposta (packages/ai/contracts/proposal.contract.ts)
  proposal_draft: string | null;
  proposal_summary: string | null;
  proposal_key_points: string[] | null;
  proposal_questions: string[] | null;
  proposal_estimated_days: number | null;
  proposal_suggested_price: number | null;
  proposal_currency: string | null;
  proposal_model: string | null;

  status: JobPostingStatus;
  created_at?: Date;
  updated_at?: Date;
}

export async function upsertJobPosting(job: Partial<JobPostingRow>): Promise<JobPostingRow> {
  if (!job.platform || !job.external_id) {
    throw new Error("platform and external_id are required");
  }

  const entries = Object.entries(job).filter(
    ([k, v]) => k !== "id" && v !== undefined,
  );

  const cols = entries.map(([k]) => k);
  // Objetos (ex: `dimensions`) vão crus de propósito: o postgres.js já serializa
  // objeto para json. Pré-serializar aqui gravaria a string JSON como escalar
  // de texto dentro do jsonb, não como objeto.
  const vals = entries.map(([, v]) => v);

  const updates = cols
    .filter((k) => k !== "platform" && k !== "external_id")
    .map((k) => `${k} = COALESCE(EXCLUDED.${k}, job_postings.${k})`);

  const [result] = await sql.unsafe(
    `INSERT INTO job_postings (${cols.join(", ")})
     VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")})
     ON CONFLICT (platform, external_id)
     DO UPDATE SET ${updates.join(", ")}, updated_at = NOW()
     RETURNING *`,
    vals,
  );

  return result as unknown as JobPostingRow;
}

/**
 * Atualiza uma vaga já existente, identificada por (platform, external_id).
 *
 * Os estágios de triagem e proposta usam isto em vez de `upsertJobPosting`:
 * eles só têm campos parciais (score, rascunho) e não a vaga inteira. Um
 * `INSERT ... ON CONFLICT DO UPDATE` parcial não funciona aqui porque o
 * Postgres valida as restrições `NOT NULL` (url, title) ao formar a tupla
 * proposta, antes de chegar à resolução do conflito — o insert estoura mesmo
 * quando a linha já existe e a intenção era apenas atualizá-la.
 *
 * Retorna `null` quando nenhuma linha casa com a referência.
 */
export async function updateJobPostingByRef(
  platform: string,
  externalId: string,
  fields: Partial<JobPostingRow>,
): Promise<JobPostingRow | null> {
  const entries = Object.entries(fields).filter(
    ([k, v]) => k !== "id" && k !== "platform" && k !== "external_id" && v !== undefined,
  );

  if (entries.length === 0) {
    return findJobPostingByPlatformAndExternalId(platform, externalId);
  }

  const assignments = entries.map(([k], i) => `${k} = $${i + 1}`);
  const values = entries.map(([, v]) => v);

  const [result] = await sql.unsafe(
    `UPDATE job_postings
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE platform = $${values.length + 1} AND external_id = $${values.length + 2}
     RETURNING *`,
    [...values, platform, externalId],
  );

  return (result ?? null) as unknown as JobPostingRow | null;
}

export async function findJobPostingByPlatformAndExternalId(
  platform: string,
  externalId: string,
): Promise<JobPostingRow | null> {
  const [result] = await sql`
    SELECT * FROM job_postings WHERE platform = ${platform} AND external_id = ${externalId}
  `;
  return (result ?? null) as unknown as JobPostingRow | null;
}

export async function findJobPostingById(id: number): Promise<JobPostingRow | null> {
  const [result] = await sql`
    SELECT * FROM job_postings WHERE id = ${id}
  `;
  return (result ?? null) as unknown as JobPostingRow | null;
}

export async function listJobPostings(filters: {
  tier?: string;
  status?: string;
}): Promise<JobPostingRow[]> {
  const conditions = [];
  if (filters.tier) conditions.push(sql`tier = ${filters.tier}`);
  if (filters.status) conditions.push(sql`status = ${filters.status}`);

  if (conditions.length === 0) {
    return sql`SELECT * FROM job_postings ORDER BY score DESC NULLS LAST, created_at DESC` as unknown as Promise<JobPostingRow[]>;
  }

  const where = conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`);
  return sql`SELECT * FROM job_postings WHERE ${where} ORDER BY score DESC NULLS LAST, created_at DESC` as unknown as Promise<JobPostingRow[]>;
}

/**
 * Vagas com rascunho pronto, para a tela de revisão.
 *
 * Exclui `applied`/`won`/`lost` porque a tela é fila de trabalho, não
 * histórico: o que já foi enviado sai dela. `dismissed` também sai.
 */
export async function listProposalsForReview(): Promise<JobPostingRow[]> {
  return sql`
    SELECT * FROM job_postings
    WHERE proposal_draft IS NOT NULL
      AND status NOT IN ('applied', 'won', 'lost', 'dismissed')
    ORDER BY score DESC NULLS LAST, posted_at DESC NULLS LAST
  ` as unknown as Promise<JobPostingRow[]>;
}

export async function updateJobPostingStatus(
  id: number,
  status: JobPostingStatus,
): Promise<JobPostingRow | null> {
  const [result] = await sql`
    UPDATE job_postings SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (result ?? null) as unknown as JobPostingRow | null;
}

export { sql };
