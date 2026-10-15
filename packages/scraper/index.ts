import { chromium } from "playwright";

export interface ScanResult {
  status: number;
  title: string;
  meta: string;
}

export async function scanSite(url: string): Promise<ScanResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const result: ScanResult = { status: 0, title: "", meta: "" };

  try {
    const response = await page.goto(url, { timeout: 15000 });
    result.status = response?.status() ?? 0;
    result.title = await page.title();
    result.meta = await page
      .$eval('meta[name="description"]', (el) => el.getAttribute("content") ?? "")
      .catch(() => "");
  } catch {
    // timeout or navigation error
  }

  await browser.close();
  return result;
}

export { extractEmails, extractPhones } from "./contacts.js";
export type { ContactInfo } from "./contacts.js";
export { detectTechnologies } from "./technologies.js";
export type { TechInfo } from "./technologies.js";
export { analyzePerformance } from "./lighthouse.js";
export type { PerformanceMetrics } from "./lighthouse.js";
export { crawlPage } from "./metadata.js";
export type { FullMetadata, SocialLinks } from "./metadata.js";
export { isAllowedByRobots, isPathAllowed } from "./robots.js";
export {
  BASE_URL,
  PLATFORM,
  buildListingUrl,
  enrichWithDetail,
  extractExternalId,
  fetchListingPage,
  parseBudget,
  parseDetailPage,
  parseLastPage,
  parseListingPage,
  scrape99Freelas,
} from "./platforms/99freelas/index.js";
export type {
  BudgetType,
  DiscoveryOptions,
  JobDetailFields,
  ScrapedJobPosting,
} from "./platforms/99freelas/index.js";
