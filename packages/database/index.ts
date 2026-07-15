import postgres from "postgres";
import { logger } from "@lead-hunter/logger";

const sql = postgres({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "leads",
  user: process.env.DB_USER ?? "lead",
  password: process.env.DB_PASSWORD ?? "lead",
});

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
  proposals_count: number | null;
  posted_at: Date | null;
  score: number | null;
  tier: string | null;
  dimensions: any | null;
  reason: string | null;
  red_flags: string[] | null;
  proposal_draft: string | null;
  status: string;
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

export async function updateJobPostingStatus(
  id: number,
  status: string,
): Promise<JobPostingRow | null> {
  const [result] = await sql`
    UPDATE job_postings SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (result ?? null) as unknown as JobPostingRow | null;
}

export { sql };
