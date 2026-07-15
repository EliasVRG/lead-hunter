export interface MatchDimensions {
  skill_match: number;
  rate_fit: number;
  seniority_fit: number;
  urgency: number;
}

export type MatchTier = "SKIP" | "MAYBE" | "APPLY";

export interface MatchResult {
  score: number;
  tier: MatchTier;
  dimensions: MatchDimensions;
  reason: string;
  red_flags: string[];
  recommended_action: string;
}
