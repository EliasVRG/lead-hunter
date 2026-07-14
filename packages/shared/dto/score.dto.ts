export interface ScoreDimensions {
  technical_pain: number;
  digital_maturity: number;
  urgency: number;
  financial_potential: number;
}

export type Tier = "COLD" | "WARM" | "HOT";

export interface ScoreResult {
  score: number;
  tiers: Tier;
  dimensions: ScoreDimensions;
  reason: string;
  recommended_approach: string;
}
