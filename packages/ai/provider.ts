import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";
import { MatchResult } from "@lead-hunter/shared/dto/match.dto.js";

export interface AIServiceOptions {
  temperature?: number;
}

export interface AIProvider {
  analyzeLead(lead: any, options?: AIServiceOptions): Promise<ScoreResult>;
  matchJob(job: any, resume: any, options?: AIServiceOptions): Promise<MatchResult>;
  draftProposal(job: any, resume: any, options?: AIServiceOptions): Promise<string>;
}
