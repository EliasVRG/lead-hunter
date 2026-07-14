import { AIProvider, AIServiceOptions } from "../provider.js";
import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";
import { buildLeadScorePrompt } from "../prompts/lead-score.prompt.js";
import { leadScoreSchema } from "../schemas/lead-score.schema.js";
import { logger } from "@lead-hunter/logger";

export class OpenRouterProvider implements AIProvider {
  private apiKey: string;
  private modelName: string;
  private baseUrl: string;

  constructor(apiKey: string, modelName: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.baseUrl = baseUrl || "https://openrouter.ai/api/v1";
  }

  async analyzeLead(lead: any, options?: AIServiceOptions): Promise<ScoreResult> {
    const prompt = buildLeadScorePrompt(lead);
    const temperature = options?.temperature ?? 0.1;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          temperature,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter API failed: status=${response.status} response=${text}`);
      }

      const data = (await response.json()) as any;
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("Empty response received from OpenRouter API");
      }

      const parsed = JSON.parse(text);
      const validated = leadScoreSchema.parse(parsed);
      return validated as ScoreResult;
    } catch (error) {
      logger.error({ error, leadWebsite: lead.website }, "OpenRouter AI scoring failed");
      throw error;
    }
  }
}
