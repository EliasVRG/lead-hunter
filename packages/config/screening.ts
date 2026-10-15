import { envNumber, envString } from "./env.js";

export interface ScreeningConfig {
  /** Descarta vaga cujo prazo já venceu. */
  dropExpired: boolean;
  /** Teto de propostas concorrentes. `0` desliga a regra. */
  maxProposals: number;
  /** Teto de idade da publicação, em horas. `0` desliga a regra. */
  maxAgeHours: number;
}

/**
 * Filtro determinístico aplicado **antes** da IA.
 *
 * O teto de propostas é absoluto e não relativo à mediana da plataforma: num
 * uso pessoal o volume é baixo demais para uma mediana por categoria ser
 * estável, e um número fixo é previsível — dá para olhar o log e entender
 * exatamente por que a vaga foi cortada. A mediana fica para quando houver
 * histórico que a sustente.
 *
 * 40 é o padrão porque é a ordem de grandeza em que a proposta deixa de ser
 * lida; ajuste conforme o que você observar em `GET /jobs?status=dismissed`.
 */
export const screeningConfig: ScreeningConfig = {
  dropExpired: envString("SCREENING_DROP_EXPIRED", "true") === "true",
  maxProposals: envNumber("SCREENING_MAX_PROPOSALS", 40),
  // Desligado por padrão: a descoberta já filtra por idade via `maxAgeHours`,
  // e duplicar a regra aqui só criaria dois lugares para ajustar a mesma coisa.
  maxAgeHours: envNumber("SCREENING_MAX_AGE_HOURS", 0),
};
