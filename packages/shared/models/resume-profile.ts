export interface OpenSourceProject {
  name: string;
  url: string;
  description: string;
}

export interface ResumeLinks {
  github?: string;
  linkedin?: string;
  portfolio?: string;
}

/**
 * Currículo do usuário — fonte da verdade da triagem, versionado em
 * `config/resume-profile.json`.
 *
 * `seniority`, `availability` e `remotePreference` são strings livres e não
 * unions fechados: o valor vai direto para o prompt, onde "junior-pleno" ou
 * "immediate" são descrições perfeitamente legíveis. Um union forçaria
 * reescrever o currículo real para caber no tipo, sem ganho nenhum.
 */
export interface ResumeProfile {
  id?: number;
  name: string;
  headline: string;
  seniority: string;
  skills: string[];
  roles: string[];
  stack: string[];

  /** Faixa de valor por hora. Usada na dimensão rate_fit da triagem. */
  minRateHr: number | null;
  maxRateHr: number | null;
  /** Faixa por projeto fechado, quando aplicável. */
  minRate?: number | null;
  maxRate?: number | null;
  currency: string;

  availability: string;
  remotePreference: string;
  languages: string[];
  bio: string;

  /** Realizações concretas — matéria-prima do corpo da proposta. */
  highlights?: string[];
  openSource?: OpenSourceProject[];
  links?: ResumeLinks;

  updated_at?: Date;
}
