import { type Job } from "bullmq";
import { type TriageJobData, enqueueProposal } from "@lead-hunter/queue";
import { findJobPostingByPlatformAndExternalId, updateJobPostingByRef } from "@lead-hunter/database";
import { loadResumeProfile } from "@lead-hunter/config/resume-profile.js";
import { getAIProvider } from "@lead-hunter/ai";
import { notifyQuietly } from "@lead-hunter/notifier";
import { logger } from "@lead-hunter/logger";

/**
 * Estágio 2: pontua a compatibilidade da vaga com o currículo.
 *
 * Só o tier APPLY segue para a fila de proposta — MAYBE e SKIP ficam no banco
 * para consulta via `GET /jobs`. Gerar rascunho para tudo queimaria a cota
 * gratuita do OpenRouter em vagas que não vão ser respondidas.
 */
export async function triageProcessor(job: Job<TriageJobData>): Promise<void> {
  const startedAt = Date.now();
  const { platform, externalId } = job.data;

  if (!platform || !externalId) throw new Error("platform and externalId are required");

  logger.info(
    { jobId: job.id, stage: "triage", status: "start", platform, externalId, attemptsMade: job.attemptsMade },
    "triage started",
  );

  try {
    const posting = await findJobPostingByPlatformAndExternalId(platform, externalId);
    if (!posting) {
      throw new Error(`job posting ${platform}/${externalId} not found in database`);
    }

    const resume = await loadResumeProfile();
    if (!resume) {
      throw new Error(
        "ResumeProfile not found. Configure config/resume-profile.json before running triage.",
      );
    }

    const { data: triage, meta } = await getAIProvider().triage(posting, resume);

    const updated = await updateJobPostingByRef(platform, externalId, {
      score: triage.score,
      tier: triage.tier,
      dimensions: triage.dimensions,
      unassessed_dimensions: triage.unassessed,
      reason: triage.reason,
      red_flags: triage.red_flags,
      matched_skills: triage.matched_skills,
      missing_skills: triage.missing_skills,
      recommended_action: triage.recommended_action,
      confidence: triage.confidence,
      triage_model: meta.model,
      status: "triaged",
    });

    if (updated?.tier === "APPLY") {
      await enqueueProposal({ platform, externalId, score: triage.score });

      // Avisa aqui, e não quando o rascunho fica pronto: a proposta leva mais
      // ~20s e pode estar atrás de fila ou rate limit. Numa plataforma onde a
      // vaga acumula centenas de concorrentes em horas, o que importa é saber
      // que ela existe — o rascunho alcança depois.
      await notifyQuietly({
        title: `Vaga compatível (${triage.score}) — ${posting.title}`,
        body: [
          triage.matched_skills.length > 0 ? `Skills: ${triage.matched_skills.join(", ")}` : "",
          `${posting.proposals_count ?? 0} propostas concorrentes`,
          triage.red_flags.length > 0 ? `Atenção: ${triage.red_flags.join("; ")}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        url: posting.url,
        urgency: "critical",
      });
    }

    logger.info(
      {
        jobId: job.id,
        stage: "triage",
        status: "success",
        platform,
        externalId,
        score: triage.score,
        tier: triage.tier,
        unassessed: triage.unassessed,
        redFlags: triage.red_flags.length,
        model: meta.model,
        outputMode: meta.mode,
        aiAttempts: meta.attempts,
        durationMs: Date.now() - startedAt,
      },
      "triage completed",
    );
  } catch (err) {
    logger.error(
      {
        jobId: job.id,
        stage: "triage",
        status: "error",
        platform,
        externalId,
        attemptsMade: job.attemptsMade,
        error: (err as Error).message,
      },
      "triage failed",
    );
    throw err;
  }
}
