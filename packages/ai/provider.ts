import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";

export interface AIServiceOptions {
  temperature?: number;
}

export interface AIProvider {
  analyzeLead(lead: any, options?: AIServiceOptions): Promise<ScoreResult>;
}
