import { ScoreDimensions, Tier } from "../dto/score.dto.js";

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
  tiers: Tier | null;
  dimensions: ScoreDimensions | null;
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
