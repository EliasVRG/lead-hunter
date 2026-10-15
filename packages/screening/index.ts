import { screeningConfig, type ScreeningConfig } from "@lead-hunter/config/screening.js";

export type ScreeningRule = "expired" | "too_many_proposals" | "too_old";

export type ScreeningVerdict =
  | { keep: true }
  | { keep: false; rule: ScreeningRule; reason: string };

const KEEP: ScreeningVerdict = { keep: true };

/** Só o que o filtro precisa ler — qualquer linha do banco satisfaz. */
export interface ScreenableJob {
  proposals_count?: number | null;
  posted_at?: Date | string | null;
  expires_at?: Date | string | null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function hoursBetween(from: number, to: number): number {
  return (to - from) / 3_600_000;
}

/**
 * Decide se a vaga merece uma chamada de IA.
 *
 * Roda antes da triagem e usa só fatos observáveis — nenhuma heurística de
 * compatibilidade, que é o trabalho da IA. O ponto é não gastar cota (nem
 * tempo de revisão) com vaga que já morreu.
 *
 * Toda regra é desligável, e com todas desligadas o retorno é sempre `keep` —
 * reproduzindo exatamente o comportamento anterior ao filtro.
 *
 * Dado ausente **nunca** descarta: o scraper pode falhar em ler um campo, e
 * tratar "não sei" como "está morta" descartaria vaga boa em silêncio.
 */
export function screenJobPosting(
  job: ScreenableJob,
  config: ScreeningConfig = screeningConfig,
  now: number = Date.now(),
): ScreeningVerdict {
  if (config.dropExpired) {
    const expiresAt = toTime(job.expires_at);
    if (expiresAt !== null && expiresAt <= now) {
      return {
        keep: false,
        rule: "expired",
        reason: `prazo encerrado em ${new Date(expiresAt).toISOString()}`,
      };
    }
  }

  if (config.maxProposals > 0) {
    const proposals = job.proposals_count;
    if (typeof proposals === "number" && proposals > config.maxProposals) {
      return {
        keep: false,
        rule: "too_many_proposals",
        reason: `${proposals} propostas concorrentes (teto ${config.maxProposals})`,
      };
    }
  }

  if (config.maxAgeHours > 0) {
    const postedAt = toTime(job.posted_at);
    if (postedAt !== null) {
      const age = hoursBetween(postedAt, now);
      if (age > config.maxAgeHours) {
        return {
          keep: false,
          rule: "too_old",
          reason: `publicada há ${Math.round(age)}h (teto ${config.maxAgeHours}h)`,
        };
      }
    }
  }

  return KEEP;
}

export { screeningConfig };
export type { ScreeningConfig };
