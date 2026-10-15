import * as cheerio from "cheerio";
import type { BudgetType, JobDetailFields, ScrapedJobPosting } from "./types.js";
import { PLATFORM, absoluteUrl } from "./http.js";

function clean(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Converte o `data-content` da descrição (HTML escapado com `<br/>`) em texto. */
function htmlToText(html: string): string {
  return cheerio
    .load(`<div>${html.replace(/<br\s*\/?>/gi, "\n")}</div>`)("div")
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** O site expõe datas como epoch em milissegundos no atributo `cp-datetime`. */
function parseCpDatetime(value: string | undefined): string | null {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

/** "1.234,56" (pt-BR) -> 1234.56 */
function parseBrazilianNumber(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractExternalId(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);

    for (let i = segments.length - 1; i >= 0; i--) {
      const trailing = segments[i].match(/(\d+)$/);
      if (trailing) return trailing[1];
    }
  } catch {
    // URL inválida — cai no fallback por hash abaixo
  }

  return Buffer.from(url).toString("base64url").slice(0, 32);
}

/**
 * Interpreta o campo "Orçamento" da tabela de informações adicionais.
 *
 * Valores observados: "Aberto", "R$ 1.000,00 - R$ 2.500,00", "R$ 500,00",
 * e variações por hora. "Aberto" significa que o cliente não definiu faixa —
 * é diferente de não conseguirmos ler o campo, por isso o tipo `open`.
 */
export function parseBudget(text: string): {
  type: BudgetType;
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const normalized = clean(text);
  if (!normalized) return { type: "unknown", min: null, max: null, currency: null };

  if (/aberto/i.test(normalized)) {
    return { type: "open", min: null, max: null, currency: null };
  }

  const currency = /R\$/.test(normalized)
    ? "BRL"
    : /US\$|USD|\$/.test(normalized)
      ? "USD"
      : null;

  const amounts = (normalized.match(/[\d.]+,\d{2}|\d[\d.]*/g) ?? [])
    .map(parseBrazilianNumber)
    .filter((n): n is number => n !== null && n > 0);

  const type: BudgetType = /hora|hour/i.test(normalized)
    ? "hourly"
    : amounts.length > 0
      ? "fixed"
      : "unknown";

  return {
    type,
    min: amounts.length > 0 ? Math.min(...amounts) : null,
    max: amounts.length > 0 ? Math.max(...amounts) : null,
    currency,
  };
}

/**
 * Lê a linha de metadados da listagem:
 * "Desenvolvimento Web | Especialista | Publicado: ... | Propostas: 129 | Interessados: 141"
 */
function parseInformationLine(text: string): {
  subcategory: string | null;
  experienceLevel: string | null;
  proposalsCount: number | null;
  interestedCount: number | null;
} {
  const parts = text
    .split("|")
    .map(clean)
    .filter(Boolean);

  const proposals = text.match(/Propostas:\s*(\d+)/i)?.[1];
  const interested = text.match(/Interessados:\s*(\d+)/i)?.[1];

  const LEVELS = ["Iniciante", "Intermediário", "Especialista"];
  const experienceLevel = parts.find((part) => LEVELS.includes(part)) ?? null;

  // A subcategoria é sempre o primeiro segmento, desde que não seja o nível nem
  // um dos campos rotulados.
  const first = parts[0] ?? "";
  const subcategory =
    first && first !== experienceLevel && !/:/.test(first) ? first : null;

  return {
    subcategory,
    experienceLevel,
    proposalsCount: proposals ? Number(proposals) : null,
    interestedCount: interested ? Number(interested) : null,
  };
}

/**
 * Faz o parse de uma página de listagem (`/projects`) em postagens completas.
 *
 * A listagem é rica o suficiente para alimentar a triagem sem nenhum request
 * extra: a descrição integral vem no atributo `data-content`. O único campo que
 * exige a página de detalhe é o orçamento.
 */
export function parseListingPage(html: string): ScrapedJobPosting[] {
  const $ = cheerio.load(html);

  return $("li.result-item")
    .toArray()
    .map((element): ScrapedJobPosting | null => {
      const item = $(element);
      const link = item.find("h1.title a, h2.title a").first();
      const href = link.attr("href");
      if (!href) return null;

      // `?fs=t` é só um marcador de origem do clique; atrapalha a dedupe por URL.
      const url = absoluteUrl(href).replace(/\?fs=t$/, "");
      const title = clean(link.text()) || clean(item.attr("data-nome"));
      if (!title) return null;

      const descriptionNode = item.find(".item-text.description").first();
      const description = descriptionNode.attr("data-content")
        ? htmlToText(descriptionNode.attr("data-content") as string)
        : clean(descriptionNode.text());

      const info = parseInformationLine(item.find(".item-text.information").first().text());

      const ratingAttr = item.find(".avaliacoes-star").first().attr("data-score");
      const rating = ratingAttr !== undefined ? Number(ratingAttr) : NaN;
      const reviewsCount = item.find(".avaliacoes-text").first().text().match(/(\d+)/)?.[1];
      // Clientes sem histórico vêm com data-score="0.0" e nenhum texto de
      // avaliações. Isso é "sem nota", não nota zero — manter 0 faria a IA
      // tratar cliente novo como cliente mal avaliado.
      const clientRating = Number.isFinite(rating) && (rating > 0 || reviewsCount) ? rating : null;

      const flagTitles = item
        .find(".flags img")
        .toArray()
        .map((img) => ($(img).attr("title") ?? "").toLowerCase());

      return {
        platform: PLATFORM,
        externalId: clean(item.attr("data-id")) || extractExternalId(url),
        url,
        title,
        description,
        skills: item
          .find("a.habilidade")
          .toArray()
          .map((skill) => clean($(skill).text()))
          .filter(Boolean),
        // Orçamento só existe na página de detalhe — ver `enrichWithDetail`.
        budgetType: "unknown",
        budgetMin: null,
        budgetMax: null,
        currency: null,
        clientName: clean(item.find(".item-text.client a").first().text()) || null,
        clientRating: Number.isFinite(clientRating) ? clientRating : null,
        clientReviewsCount: reviewsCount ? Number(reviewsCount) : null,
        proposalsCount: info.proposalsCount,
        interestedCount: info.interestedCount,
        category: null,
        subcategory: info.subcategory,
        experienceLevel: info.experienceLevel,
        isUrgent: flagTitles.some((flag) => flag.includes("urgente")),
        isFeatured: flagTitles.some((flag) => flag.includes("destaque")),
        postedAt: parseCpDatetime(item.find("b.datetime").first().attr("cp-datetime")),
        expiresAt: parseCpDatetime(item.find(".datetime-restante").first().attr("cp-datetime")),
      };
    })
    .filter((job): job is ScrapedJobPosting => job !== null);
}

/** Quantas páginas a listagem anuncia na paginação. */
export function parseLastPage(html: string): number {
  const $ = cheerio.load(html);
  const pages = $(".pagination-component .page-item")
    .toArray()
    .map((el) => Number($(el).attr("data-page")))
    .filter((page) => Number.isFinite(page));

  return pages.length > 0 ? Math.max(...pages) : 1;
}

/**
 * Faz o parse da página de detalhe, de onde saem os campos ausentes na listagem.
 * A fonte é a tabela "Informações adicionais" (pares `<th>` rótulo / `<td>` valor).
 */
export function parseDetailPage(html: string): JobDetailFields {
  const $ = cheerio.load(html);
  const fields = new Map<string, string>();

  $(".info-adicionais table tr").each((_, row) => {
    const label = clean($(row).find("th").first().text()).replace(/:$/, "").toLowerCase();
    const value = clean($(row).find("td").first().text());
    if (label && value) fields.set(label, value);
  });

  const budget = parseBudget(fields.get("orçamento") ?? "");
  const minimumValue = parseBudget(clean($(".valor-minimo").first().text()));

  // "Valor Mínimo" é o piso que o cliente aceita receber em propostas. Quando o
  // orçamento é "Aberto" ele é o único sinal numérico disponível.
  const min = budget.min ?? minimumValue.min;

  return {
    budgetType: budget.type,
    budgetMin: min,
    budgetMax: budget.max,
    currency: budget.currency ?? minimumValue.currency,
    category: fields.get("categoria") ?? null,
    subcategory: fields.get("subcategoria") ?? null,
    experienceLevel: fields.get("nível de experiência") ?? null,
  };
}
