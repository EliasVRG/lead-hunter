import { logger } from "@lead-hunter/logger";
import { BASE_URL, PLATFORM, buildListingUrl, fetchHtml, sleep } from "./http.js";
import { parseDetailPage, parseLastPage, parseListingPage } from "./parse.js";
import type { DiscoveryOptions, ScrapedJobPosting } from "./types.js";

const DEFAULT_DELAY_MS = 1200;

/** Busca e faz o parse de uma página de listagem. */
export async function fetchListingPage(
  page: number,
  options: DiscoveryOptions = {},
): Promise<{ jobs: ScrapedJobPosting[]; lastPage: number }> {
  const url =
    options.searchUrl && page === 1
      ? options.searchUrl
      : buildListingUrl({ page, query: options.query, category: options.category });

  const html = await fetchHtml(url);
  if (!html) return { jobs: [], lastPage: page };

  return { jobs: parseListingPage(html), lastPage: parseLastPage(html) };
}

/** Enriquece uma postagem com os campos que só existem na página de detalhe. */
export async function enrichWithDetail(job: ScrapedJobPosting): Promise<ScrapedJobPosting> {
  const html = await fetchHtml(job.url);
  if (!html) return job;

  const detail = parseDetailPage(html);

  return {
    ...job,
    budgetType: detail.budgetType,
    budgetMin: detail.budgetMin,
    budgetMax: detail.budgetMax,
    currency: detail.currency,
    category: detail.category ?? job.category,
    subcategory: detail.subcategory ?? job.subcategory,
    experienceLevel: detail.experienceLevel ?? job.experienceLevel,
  };
}

function isWithinMaxAge(job: ScrapedJobPosting, maxAgeHours: number): boolean {
  if (!job.postedAt) return true;
  const ageHours = (Date.now() - new Date(job.postedAt).getTime()) / 3_600_000;
  return ageHours <= maxAgeHours;
}

/**
 * Percorre a listagem pública de projetos do 99Freelas.
 *
 * Paginação para assim que a primeira página sem resultado novo aparece ou quando
 * `maxListings`/`maxPages` é atingido. Entre requests há uma pausa fixa — o
 * objetivo é um volume de tráfego comparável ao de navegação manual.
 */
export async function scrape99Freelas(
  options: DiscoveryOptions = {},
): Promise<ScrapedJobPosting[]> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const maxListings = options.maxListings ?? 30;
  const maxPages = options.maxPages ?? 3;
  const fetchDetails = options.fetchDetails ?? true;

  const collected: ScrapedJobPosting[] = [];
  const seen = new Set<string>();
  let lastPage = 1;
  let skippedByAge = 0;

  for (let page = 1; page <= maxPages && collected.length < maxListings; page++) {
    if (page > 1) await sleep(delayMs);

    const result = await fetchListingPage(page, options);
    lastPage = result.lastPage;

    if (result.jobs.length === 0) {
      logger.info({ page }, "99freelas: listing page returned no items, stopping pagination");
      break;
    }

    for (const job of result.jobs) {
      if (collected.length >= maxListings) break;
      if (seen.has(job.externalId)) continue;
      seen.add(job.externalId);

      if (options.maxAgeHours && !isWithinMaxAge(job, options.maxAgeHours)) {
        skippedByAge++;
        continue;
      }

      collected.push(job);
    }

    if (page >= lastPage) break;
  }

  const enriched: ScrapedJobPosting[] = [];
  for (const job of collected) {
    if (!fetchDetails) {
      enriched.push(job);
      continue;
    }

    await sleep(delayMs);
    enriched.push(await enrichWithDetail(job));
  }

  logger.info(
    {
      platform: PLATFORM,
      scraped: enriched.length,
      skippedByAge,
      pagesAvailable: lastPage,
      withBudget: enriched.filter((job) => job.budgetMin !== null).length,
    },
    "99freelas: discovery run finished",
  );

  return enriched;
}

export { BASE_URL, PLATFORM, buildListingUrl } from "./http.js";
export {
  extractExternalId,
  parseBudget,
  parseDetailPage,
  parseLastPage,
  parseListingPage,
} from "./parse.js";
export type {
  BudgetType,
  DiscoveryOptions,
  JobDetailFields,
  ScrapedJobPosting,
} from "./types.js";
