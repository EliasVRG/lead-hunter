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

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private modelName: string;

  constructor(baseUrl: string, modelName: string) {
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  private async generateJson(prompt: string, temperature: number): Promise<any> {
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

    return JSON.parse(text);
  }

  async analyzeLead(lead: any, options?: AIServiceOptions): Promise<ScoreResult> {
    const prompt = buildLeadScorePrompt(lead);
    const temperature = options?.temperature ?? 0.1;

    try {
      const parsed = await this.generateJson(prompt, temperature);
      return leadScoreSchema.parse(parsed) as ScoreResult;
    } catch (error) {
      logger.error({ error, leadWebsite: lead.website }, "Ollama AI scoring failed");
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
      logger.error({ error, jobUrl: job.url }, "Ollama job match scoring failed");
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
      logger.error({ error, jobUrl: job.url }, "Ollama proposal draft generation failed");
      throw error;
    }
  }
}
