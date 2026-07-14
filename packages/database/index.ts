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

export { sql };
