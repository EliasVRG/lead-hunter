import { chromium, type Browser } from "playwright";
import { isAllowedByRobots } from "../robots.js";
import { logger } from "@lead-hunter/logger";

const PLATFORM = "99freelas";
const BASE_URL = "https://www.99freelas.com.br";

/**
 * Seletores CSS do 99Freelas. São um ponto de partida e PRECISAM ser
 * validados/ajustados contra o HTML real do site antes do primeiro uso —
 * não foi possível inspecionar a página ao vivo a partir deste ambiente.
 */
const SELECTORS = {
  listingTitleLink: "a[data-testid='job-title'], a.project-title, h2 a, h3 a",
  detailTitle: "h1",
  detailDescription: "[data-testid='job-description'], .project-description, .description",
  detailSkills: "[data-testid='job-skill'], .skill-tag, .project-skills li",
  detailBudget: "[data-testid='job-budget'], .project-budget, .budget",
  detailClientName: "[data-testid='client-name'], .client-name",
  detailClientRating: "[data-testid='client-rating'], .client-rating",
  detailProposalsCount: "[data-testid='proposals-count'], .proposals-count",
  detailPostedAt: "time, [data-testid='posted-at']",
};

export interface ScrapedJobPosting {
  platform: string;
  externalId: string;
  url: string;
  title: string;
  description: string;
  skills: string[];
  budgetType: "fixed" | "hourly" | "unknown";
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  clientName: string | null;
  clientRating: number | null;
  proposalsCount: number | null;
  postedAt: string | null;
}

export interface DiscoveryOptions {
  searchUrl?: string;
  maxListings?: number;
  delayMs?: number;
}

export function extractExternalId(url: string): string {
  try {
    const { pathname } = new URL(url);
    const segments = pathname.split("/").filter(Boolean);

    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(segments[i])) return segments[i];
    }

    const trailing = (segments[segments.length - 1] ?? "").match(/(\d+)$/);
    if (trailing) return trailing[1];
  } catch {
    // invalid URL, fall through to hash fallback below
  }

  return Buffer.from(url).toString("base64url").slice(0, 32);
}

export function parseBudget(text: string): {
  type: "fixed" | "hourly" | "unknown";
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!text) return { type: "unknown", min: null, max: null, currency: null };

  const currency = text.includes("R$") ? "BRL" : text.includes("US$") || text.includes("$") ? "USD" : null;
  const numbers = (text.match(/[\d.,]+/g) ?? [])
    .map((n) => Number(n.replace(/\./g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
  const type = /hora|hour/i.test(text) ? "hourly" : /fixo|fixed/i.test(text) ? "fixed" : "unknown";

  return {
    type,
    min: numbers.length > 0 ? Math.min(...numbers) : null,
    max: numbers.length > 1 ? Math.max(...numbers) : (numbers[0] ?? null),
    currency,
  };
}

async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

export async function discoverJobUrls(options: DiscoveryOptions = {}): Promise<string[]> {
  const searchUrl = options.searchUrl ?? `${BASE_URL}/projetos`;

  const allowed = await isAllowedByRobots(searchUrl);
  if (!allowed) {
    logger.warn({ url: searchUrl }, "99freelas: blocked by robots.txt, skipping discovery");
    return [];
  }

  return withBrowser(async (browser) => {
    const page = await browser.newPage();

    try {
      await page.goto(searchUrl, { timeout: 20000, waitUntil: "domcontentloaded" });

      const links = await page.$$eval(SELECTORS.listingTitleLink, (els) =>
        els.map((el) => (el as any).href).filter(Boolean),
      );

      const unique = [...new Set(links)];
      const limit = options.maxListings ?? 30;
      return unique.slice(0, limit);
    } catch (err) {
      logger.error({ err, url: searchUrl }, "99freelas: failed to discover job listings");
      return [];
    } finally {
      await page.close();
    }
  });
}

export async function scrapeJobDetail(url: string): Promise<ScrapedJobPosting | null> {
  const allowed = await isAllowedByRobots(url);
  if (!allowed) {
    logger.warn({ url }, "99freelas: blocked by robots.txt, skipping detail scrape");
    return null;
  }

  return withBrowser(async (browser) => {
    const page = await browser.newPage();

    try {
      await page.goto(url, { timeout: 20000, waitUntil: "domcontentloaded" });

      const title = await page.$eval(SELECTORS.detailTitle, (el) => el.textContent?.trim() ?? "").catch(() => "");
      const description = await page
        .$eval(SELECTORS.detailDescription, (el) => el.textContent?.trim() ?? "")
        .catch(() => "");
      const skills = await page
        .$$eval(SELECTORS.detailSkills, (els) => els.map((el) => el.textContent?.trim() ?? "").filter(Boolean))
        .catch(() => [] as string[]);
      const budgetText = await page
        .$eval(SELECTORS.detailBudget, (el) => el.textContent?.trim() ?? "")
        .catch(() => "");
      const clientName = await page
        .$eval(SELECTORS.detailClientName, (el) => el.textContent?.trim() ?? "")
        .catch(() => null);
      const clientRatingText = await page
        .$eval(SELECTORS.detailClientRating, (el) => el.textContent?.trim() ?? "")
        .catch(() => "");
      const proposalsText = await page
        .$eval(SELECTORS.detailProposalsCount, (el) => el.textContent?.trim() ?? "")
        .catch(() => "");
      const postedAt = await page
        .$eval(SELECTORS.detailPostedAt, (el) => el.getAttribute("datetime") ?? el.textContent?.trim() ?? "")
        .catch(() => null);

      if (!title) {
        logger.warn({ url }, "99freelas: could not extract title, selectors may be outdated");
        return null;
      }

      const budget = parseBudget(budgetText);
      const ratingMatch = clientRatingText.replace(",", ".").match(/[\d.]+/)?.[0];
      const proposalsMatch = proposalsText.match(/\d+/)?.[0];

      return {
        platform: PLATFORM,
        externalId: extractExternalId(url),
        url,
        title,
        description,
        skills,
        budgetType: budget.type,
        budgetMin: budget.min,
        budgetMax: budget.max,
        currency: budget.currency,
        clientName: clientName || null,
        clientRating: ratingMatch ? Number(ratingMatch) : null,
        proposalsCount: proposalsMatch ? Number(proposalsMatch) : null,
        postedAt: postedAt || null,
      };
    } catch (err) {
      logger.error({ err, url }, "99freelas: failed to scrape job detail");
      return null;
    } finally {
      await page.close();
    }
  });
}

export async function scrape99Freelas(options: DiscoveryOptions = {}): Promise<ScrapedJobPosting[]> {
  const urls = await discoverJobUrls(options);
  const delayMs = options.delayMs ?? 1500;
  const results: ScrapedJobPosting[] = [];

  for (const url of urls) {
    const job = await scrapeJobDetail(url);
    if (job) results.push(job);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  logger.info({ discovered: urls.length, scraped: results.length }, "99freelas: discovery run finished");
  return results;
}
