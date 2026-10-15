import { logger } from "@lead-hunter/logger";
import { isAllowedByRobots } from "../../robots.js";

export const PLATFORM = "99freelas";
export const BASE_URL = "https://www.99freelas.com.br";

/**
 * As páginas de projeto do 99Freelas são renderizadas no servidor — título,
 * descrição completa, skills, cliente e contadores já vêm no HTML da listagem.
 * Por isso aqui é `fetch` + parse, não Playwright: subir um Chromium por run
 * custaria segundos e megabytes para ler markup estático.
 */
const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS ?? 20_000);
const MAX_ATTEMPTS = Number(process.env.SCRAPER_MAX_ATTEMPTS ?? 3);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`99freelas: GET ${url} failed with status ${status}`);
    this.name = "HttpError";
  }
}

/** Busca uma página respeitando robots.txt, com retry em erro transitório. */
export async function fetchHtml(url: string): Promise<string | null> {
  if (!(await isAllowedByRobots(url, USER_AGENT))) {
    logger.warn({ url }, "99freelas: blocked by robots.txt, skipping");
    return null;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status === 404) {
        logger.warn({ url }, "99freelas: page not found");
        return null;
      }

      // 429/5xx são transitórios; 4xx restantes não melhoram com retry.
      if (response.status === 429 || response.status >= 500) {
        throw new HttpError(response.status, url);
      }

      if (!response.ok) {
        logger.warn({ url, status: response.status }, "99freelas: unexpected status, giving up");
        return null;
      }

      return await response.text();
    } catch (err) {
      lastError = err;

      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = 1000 * 2 ** (attempt - 1);
        logger.warn(
          { url, attempt, backoffMs, error: (err as Error).message },
          "99freelas: fetch failed, retrying",
        );
        await sleep(backoffMs);
      }
    }
  }

  logger.error({ url, error: (lastError as Error)?.message }, "99freelas: fetch failed permanently");
  return null;
}

/**
 * Monta a URL de listagem.
 *
 * Só `page`, `q` e `categoria` funcionam como query string — os outros filtros da
 * UI (ordenação, data de publicação, ranking) são aplicados via XHR e não têm
 * equivalente em GET. Idade de publicação é filtrada localmente por isso.
 */
export function buildListingUrl(options: {
  page?: number;
  query?: string;
  category?: string;
}): string {
  const url = new URL("/projects", BASE_URL);

  if (options.page && options.page > 1) url.searchParams.set("page", String(options.page));
  if (options.query) url.searchParams.set("q", options.query);
  if (options.category) url.searchParams.set("categoria", options.category);

  return url.toString();
}

export function absoluteUrl(href: string): string {
  return new URL(href, BASE_URL).toString();
}
