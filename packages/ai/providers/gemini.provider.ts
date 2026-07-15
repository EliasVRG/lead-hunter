import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider, AIServiceOptions } from "../provider.js";
import { ScoreResult } from "@lead-hunter/shared/dto/score.dto.js";
import { MatchResult } from "@lead-hunter/shared/dto/match.dto.js";
import { buildLeadScorePrompt } from "../prompts/lead-score.prompt.js";
import { leadScoreSchema } from "../schemas/lead-score.schema.js";
import { buildJobMatchPrompt } from "../prompts/job-match.prompt.js";
import { jobMatchSchema } from "../schemas/job-match.schema.js";
import { buildProposalDraftPrompt } from "../prompts/proposal-draft.prompt.js";
import { proposalDraftSchema } from "../schemas/proposal-draft.schema.js";
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

  private async generateJson(prompt: string, temperature: number): Promise<any> {
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

    return JSON.parse(text);
  }

  async analyzeLead(lead: any, options?: AIServiceOptions): Promise<ScoreResult> {
    const prompt = buildLeadScorePrompt(lead);
    const temperature = options?.temperature ?? 0.1;

    try {
      const parsed = await this.generateJson(prompt, temperature);
      return leadScoreSchema.parse(parsed) as ScoreResult;
    } catch (error) {
      logger.error({ error, leadWebsite: lead.website }, "Gemini AI scoring failed");
      throw error;
    }
  }

  async matchJob(job: any, resume: any, options?: AIServiceOptions): Promise<MatchResult> {
    const prompt = buildJobMatchPrompt(job, resume);
    const temperature = options?.temperature ?? 0.1;

    try {
      const parsed = await this.generateJson(prompt, temperature);
      return jobMatchSchema.parse(parsed) as MatchResult;
    } catch (error) {
      logger.error({ error, jobUrl: job.url }, "Gemini job match scoring failed");
      throw error;
    }
  }

  async draftProposal(job: any, resume: any, options?: AIServiceOptions): Promise<string> {
    const prompt = buildProposalDraftPrompt(job, resume);
    const temperature = options?.temperature ?? 0.4;

    try {
      const parsed = await this.generateJson(prompt, temperature);
      return proposalDraftSchema.parse(parsed).proposalDraft;
    } catch (error) {
      logger.error({ error, jobUrl: job.url }, "Gemini proposal draft generation failed");
      throw error;
    }
  }
}
