import { AIProvider, AIServiceOptions } from "../provider.js";
import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";
import { buildLeadScorePrompt } from "../prompts/lead-score.prompt.js";
import { leadScoreSchema } from "../schemas/lead-score.schema.js";
import { logger } from "@lead-hunter/logger";

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private modelName: string;

  constructor(baseUrl: string, modelName: string) {
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  async analyzeLead(lead: any, options?: AIServiceOptions): Promise<ScoreResult> {
    const prompt = buildLeadScorePrompt(lead);
    const temperature = options?.temperature ?? 0.1;

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          options: {
            temperature,
          },
          format: "json",
          stream: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama API failed: status=${response.status} response=${text}`);
      }

      const data = (await response.json()) as any;
      const text = data.response;
      if (!text) {
        throw new Error("Empty response received from Ollama API");
      }

      const parsed = JSON.parse(text);
      const validated = leadScoreSchema.parse(parsed);
      return validated as ScoreResult;
    } catch (error) {
      logger.error({ error, leadWebsite: lead.website }, "Ollama AI scoring failed");
      throw error;
    }
  }
}
