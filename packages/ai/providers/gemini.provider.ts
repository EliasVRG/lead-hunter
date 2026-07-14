import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider, AIServiceOptions } from "../provider.js";
import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";
import { buildLeadScorePrompt } from "../prompts/lead-score.prompt.js";
import { leadScoreSchema } from "../schemas/lead-score.schema.js";
import { logger } from "@lead-hunter/logger";

export class GeminiProvider implements AIProvider {
  private ai: any;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    if (!apiKey) {
      logger.warn("GEMINI_API_KEY is missing. GeminiProvider might fail if invoked.");
    }
    // Using standard GoogleGenerativeAI SDK instantiation
    this.ai = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async analyzeLead(lead: any, options?: AIServiceOptions): Promise<ScoreResult> {
    const prompt = buildLeadScorePrompt(lead);
    const temperature = options?.temperature ?? 0.1;

    try {
      const model = this.ai.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          temperature,
          responseMimeType: "application/json",
        },
      });

      const response = await model.generateContent(prompt);
      const text = response.response.text();
      if (!text) {
        throw new Error("Empty response received from Gemini API");
      }

      const parsed = JSON.parse(text);
      const validated = leadScoreSchema.parse(parsed);
      return validated as ScoreResult;
    } catch (error) {
      logger.error({ error, leadWebsite: lead.website }, "Gemini AI scoring failed");
      throw error;
    }
  }
}
