/**
 * Extração de JSON de respostas de LLM.
 *
 * Mesmo pedindo `response_format`, modelos gratuitos frequentemente devolvem o
 * objeto embrulhado: fence markdown, um parágrafo antes, ou um bloco de
 * raciocínio. Em vez de gastar uma chamada extra pedindo "só o JSON", estes
 * helpers recuperam o objeto localmente.
 */

/** Acha o primeiro objeto JSON balanceado, ignorando chaves dentro de strings. */
function findFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/** Remove vírgulas sobrando antes de `}` ou `]`, um erro comum de modelo. */
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

export class JsonExtractionError extends Error {
  constructor(readonly rawText: string) {
    super("could not extract a JSON object from the model response");
    this.name = "JsonExtractionError";
  }
}

export function extractJson(text: string): unknown {
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim();

  const candidates = [withoutFences, findFirstJsonObject(withoutFences)].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of candidates) {
    for (const attempt of [candidate, stripTrailingCommas(candidate)]) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // tenta o próximo candidato
      }
    }
  }

  throw new JsonExtractionError(text);
}
