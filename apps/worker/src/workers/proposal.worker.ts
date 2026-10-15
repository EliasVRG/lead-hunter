import { type Job } from "bullmq";
import { type ProposalJobData } from "@lead-hunter/queue";
import { findJobPostingByPlatformAndExternalId, updateJobPostingByRef } from "@lead-hunter/database";
import { loadResumeProfile } from "@lead-hunter/config/resume-profile.js";
import { getAIProvider, type TriageResult } from "@lead-hunter/ai";
import { logger } from "@lead-hunter/logger";

/**
 * Reconstrói o resultado da triagem a partir do banco, para alimentar o prompt
 * da proposta. O payload da fila carrega só a referência da vaga, então os
 * dados vêm da linha persistida pelo estágio anterior.
 */
function triageFromRow(row: {
  score: number | null;
  tier: string | null;
  dimensions: unknown;
  reason: string | null;
  red_flags: string[] | null;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  recommended_action: string | null;
  confidence: number | null;
}): TriageResult | null {
  if (row.score === null || !row.tier) return null;

  return {
    score: row.score,
    tier: row.tier as TriageResult["tier"],
    dimensions: (row.dimensions ?? {}) as TriageResult["dimensions"],
    reason: row.reason ?? "",
    red_flags: row.red_flags ?? [],
    matched_skills: row.matched_skills ?? [],
    missing_skills: row.missing_skills ?? [],
    recommended_action: row.recommended_action ?? "",
    confidence: row.confidence ?? 0.5,
  };
}

/**
 * Estágio 3: monta o rascunho de proposta.
 *
 * O rascunho só é persistido — nada é enviado ao 99Freelas. O envio é sempre
 * manual, depois da revisão (AGENT.md §14).
 */
export async function proposalProcessor(job: Job<ProposalJobData>): Promise<void> {
  const startedAt = Date.now();
  const { platform, externalId } = job.data;

  if (!platform || !externalId) throw new Error("platform and externalId are required");

  logger.info(
    { jobId: job.id, stage: "proposal", status: "start", platform, externalId, attemptsMade: job.attemptsMade },
    "proposal started",
  );

  try {
    const posting = await findJobPostingByPlatformAndExternalId(platform, externalId);
    if (!posting) {
      throw new Error(`job posting ${platform}/${externalId} not found in database`);
    }

    const resume = await loadResumeProfile();
    if (!resume) {
      throw new Error(
        "ResumeProfile not found. Configure config/resume-profile.json before generating proposals.",
      );
    }

    const { data: proposal, meta } = await getAIProvider().draftProposal(
      posting,
      resume,
      triageFromRow(posting),
    );

    await updateJobPostingByRef(platform, externalId, {
      proposal_draft: proposal.body,
      proposal_summary: proposal.summary,
      proposal_key_points: proposal.key_points,
      proposal_questions: proposal.questions,
      proposal_estimated_days: proposal.estimated_days,
      proposal_suggested_price: proposal.suggested_price,
      proposal_currency: proposal.currency,
      proposal_model: meta.model,
      status: "proposal_ready",
    });

    logger.info(
      {
        jobId: job.id,
        stage: "proposal",
        status: "success",
        platform,
        externalId,
        wordCount: proposal.word_count,
        questions: proposal.questions.length,
        suggestedPrice: proposal.suggested_price,
        model: meta.model,
        outputMode: meta.mode,
        aiAttempts: meta.attempts,
        durationMs: Date.now() - startedAt,
      },
      "proposal draft ready for manual review — nothing was submitted",
    );
  } catch (err) {
    logger.error(
      {
        jobId: job.id,
        stage: "proposal",
        status: "error",
        platform,
        externalId,
        attemptsMade: job.attemptsMade,
        error: (err as Error).message,
      },
      "proposal failed",
    );
    throw err;
  }
}
