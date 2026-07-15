import { MatchDimensions, MatchTier } from "../dto/match.dto.js";

export type BudgetType = "fixed" | "hourly" | "unknown";

export type JobPostingStatus =
  | "discovered"
  | "reviewing"
  | "proposal_ready"
  | "applied"
  | "won"
  | "lost"
  | "dismissed";

export interface JobPosting {
  id?: number;
  platform: string;
  externalId: string;
  url: string;
  title: string;
  description: string;
  skills: string[];
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  clientName: string | null;
  clientRating: number | null;
  proposalsCount: number | null;
  postedAt: Date | null;
  score: number | null;
  tier: MatchTier | null;
  dimensions: MatchDimensions | null;
  reason: string | null;
  redFlags: string[];
  proposalDraft: string | null;
  status: JobPostingStatus;
  created_at?: Date;
  updated_at?: Date;
}
