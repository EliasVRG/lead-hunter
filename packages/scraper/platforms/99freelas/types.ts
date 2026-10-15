export type BudgetType = "fixed" | "hourly" | "open" | "unknown";

/** Saída canônica do scraper, uma por projeto do 99Freelas. */
export interface ScrapedJobPosting {
  platform: string;
  externalId: string;
  url: string;
  title: string;
  description: string;
  skills: string[];
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  clientName: string | null;
  clientRating: number | null;
  clientReviewsCount: number | null;
  proposalsCount: number | null;
  interestedCount: number | null;
  category: string | null;
  subcategory: string | null;
  experienceLevel: string | null;
  isUrgent: boolean;
  isFeatured: boolean;
  postedAt: string | null;
  expiresAt: string | null;
}

/** Dados que só existem na página de detalhe do projeto. */
export interface JobDetailFields {
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  category: string | null;
  subcategory: string | null;
  experienceLevel: string | null;
}

export interface DiscoveryOptions {
  /** Termo de busca (`?q=`). */
  query?: string;
  /** Slug de categoria (`?categoria=`), ex: "web-mobile-e-software". */
  category?: string;
  /** Quantas páginas da listagem percorrer. Cada página traz 10 projetos. */
  maxPages?: number;
  /** Teto absoluto de projetos retornados. */
  maxListings?: number;
  /** Pausa entre requests, para não martelar o site. */
  delayMs?: number;
  /** Busca a página de detalhe de cada projeto (necessário para orçamento). */
  fetchDetails?: boolean;
  /** Descarta projetos publicados há mais de N horas. */
  maxAgeHours?: number;
  /** URL completa de listagem — sobrepõe query/category. */
  searchUrl?: string;
}
