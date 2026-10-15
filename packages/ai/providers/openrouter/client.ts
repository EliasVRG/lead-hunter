import { logger } from "@lead-hunter/logger";
import { aiConfig, type OpenRouterConfig } from "@lead-hunter/config/ai.js";
import type { ResponseFormatJsonSchema } from "../../contracts/json-schema.js";
import { extractJson } from "./json.js";

export interface StructuredRequest<T> {
  /** Rótulo usado nos logs, ex: "triage" ou "proposal". */
  task: string;
  system: string;
  user: string;
  temperature: number;
  responseFormat: ResponseFormatJsonSchema;
  /** Valida e normaliza o objeto cru. Deve lançar quando o output é inaceitável. */
  normalize: (raw: unknown) => T;
}

export interface StructuredResponse<T> {
  data: T;
  meta: {
    model: string;
    /** Modo de output que acabou funcionando. */
    mode: OutputMode;
    attempts: number;
    promptTokens: number | null;
    completionTokens: number | null;
    durationMs: number;
  };
}

/**
 * Modos de output, do mais confiável ao mais permissivo.
 *
 * `json_schema` faz o OpenRouter validar a forma antes de devolver, mas só
 * alguns modelos gratuitos o suportam. `json_object` garante JSON sintático sem
 * garantir a forma. `prompt` é a última linha: nenhuma garantia do provider, só
 * a instrução no texto — para modelos que rejeitam `response_format` por
 * completo. Cair de nível não perde garantias de verdade porque o contrato é
 * imposto localmente em `normalize`.
 */
export type OutputMode = "json_schema" | "json_object" | "prompt";

const MODE_SEQUENCE: OutputMode[] = ["json_schema", "json_object", "prompt"];

class OpenRouterHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterMs: number | null,
  ) {
    super(`OpenRouter request failed: status=${status} body=${body.slice(0, 400)}`);
    this.name = "OpenRouterHttpError";
  }

  /** 429 e 5xx melhoram com espera; 4xx restantes não. */
  get isTransient(): boolean {
    return this.status === 429 || this.status >= 500;
  }

  /**
   * Alguns 4xx significam "este modelo não aceita esse response_format".
   * Nesse caso vale reduzir o modo de output em vez de trocar de modelo.
   */
  get isUnsupportedFormat(): boolean {
    if (this.status !== 400 && this.status !== 404 && this.status !== 422) return false;
    return /response_format|json_schema|structured|schema|not support/i.test(this.body);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function buildResponseFormat(mode: OutputMode, format: ResponseFormatJsonSchema) {
  if (mode === "json_schema") return format;
  if (mode === "json_object") return { type: "json_object" as const };
  return undefined;
}

/**
 * No modo `prompt` o provider não impõe nada, então o schema vai inline na
 * mensagem do sistema — é a única forma de o modelo saber a forma esperada.
 */
function systemFor(mode: OutputMode, system: string, format: ResponseFormatJsonSchema): string {
  if (mode !== "prompt") return system;

  return [
    system,
    "",
    "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem bloco de código.",
    "O objeto deve seguir exatamente este JSON Schema:",
    JSON.stringify(format.json_schema.schema),
  ].join("\n");
}

export class OpenRouterClient {
  private readonly config: OpenRouterConfig;

  constructor(config: OpenRouterConfig = aiConfig.openrouter) {
    this.config = config;

    if (!this.config.apiKey) {
      logger.warn(
        "OPENROUTER_API_KEY is not set — triage and proposal jobs will fail until it is configured",
      );
    }
    if (this.config.models.length === 0) {
      throw new Error("OPENROUTER_MODELS is empty: at least one model is required");
    }
  }

  private async postChatCompletion(
    model: string,
    mode: OutputMode,
    request: StructuredRequest<unknown>,
  ): Promise<{ text: string; usage: { prompt: number | null; completion: number | null } }> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        // O OpenRouter usa estes dois para atribuição de uso no dashboard.
        "HTTP-Referer": this.config.referer,
        "X-Title": this.config.title,
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature,
        max_tokens: this.config.maxOutputTokens,
        messages: [
          { role: "system", content: systemFor(mode, request.system, request.responseFormat) },
          { role: "user", content: request.user },
        ],
        response_format: buildResponseFormat(mode, request.responseFormat),
      }),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new OpenRouterHttpError(
        response.status,
        await response.text(),
        parseRetryAfter(response.headers.get("retry-after")),
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string; reasoning?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    // O OpenRouter às vezes devolve 200 com um erro no corpo (ex: upstream caiu).
    if (payload.error) {
      throw new OpenRouterHttpError(502, JSON.stringify(payload.error), null);
    }

    const text = payload.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
      throw new Error("OpenRouter returned an empty completion");
    }

    return {
      text,
      usage: {
        prompt: payload.usage?.prompt_tokens ?? null,
        completion: payload.usage?.completion_tokens ?? null,
      },
    };
  }

  /**
   * Executa a requisição percorrendo a cadeia de modelos gratuitos.
   *
   * Para cada modelo tenta os modos de output em ordem decrescente de garantia.
   * Um erro de conteúdo (JSON inválido, schema reprovado) consome uma tentativa
   * naquele modelo; esgotadas as tentativas, passa para o próximo modelo. Só
   * falha de vez quando a cadeia inteira acaba — o que importa para o tier
   * gratuito, onde o limite de cota é por modelo.
   */
  async complete<T>(request: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    const startedAt = Date.now();
    const errors: string[] = [];
    let attempts = 0;

    for (const model of this.config.models) {
      let modeIndex = 0;

      for (let attempt = 1; attempt <= this.config.maxAttemptsPerModel; attempt++) {
        const mode = MODE_SEQUENCE[Math.min(modeIndex, MODE_SEQUENCE.length - 1)];
        attempts++;

        try {
          const { text, usage } = await this.postChatCompletion(
            model,
            mode,
            request as StructuredRequest<unknown>,
          );
          const data = request.normalize(extractJson(text));

          logger.info(
            {
              task: request.task,
              model,
              mode,
              attempts,
              promptTokens: usage.prompt,
              completionTokens: usage.completion,
              durationMs: Date.now() - startedAt,
            },
            "openrouter completion accepted",
          );

          return {
            data,
            meta: {
              model,
              mode,
              attempts,
              promptTokens: usage.prompt,
              completionTokens: usage.completion,
              durationMs: Date.now() - startedAt,
            },
          };
        } catch (err) {
          const message = (err as Error).message;
          errors.push(`${model}/${mode}: ${message}`);

          logger.warn(
            { task: request.task, model, mode, attempt, error: message },
            "openrouter attempt failed",
          );

          if (err instanceof OpenRouterHttpError) {
            if (err.isUnsupportedFormat && modeIndex < MODE_SEQUENCE.length - 1) {
              // Modelo não aceita este response_format: reduz o modo e tenta de
              // novo sem contar como falha real do modelo.
              modeIndex++;
              attempt--;
              continue;
            }

            if (!err.isTransient) break; // auth/billing/modelo inexistente: trocar de modelo

            if (attempt < this.config.maxAttemptsPerModel) {
              await sleep(err.retryAfterMs ?? 1000 * 2 ** (attempt - 1));
            }
            continue;
          }

          // Erro de conteúdo (JSON inválido ou schema reprovado): se ainda há
          // modo mais permissivo, desce um nível — o schema vai inline no prompt.
          if (modeIndex < MODE_SEQUENCE.length - 1) modeIndex++;
        }
      }
    }

    throw new Error(
      `OpenRouter failed for task "${request.task}" after ${attempts} attempt(s) across ${this.config.models.length} model(s): ${errors.join(" | ")}`,
    );
  }
}
