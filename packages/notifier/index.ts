import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { notifierConfig, type NotifierConfig } from "@lead-hunter/config/notifier.js";
import { logger } from "@lead-hunter/logger";

const run = promisify(execFile);

export interface Notification {
  title: string;
  body: string;
  /** Aberto pelo usuário a partir do aviso. */
  url?: string;
  /** `critical` mantém o aviso na tela até ser dispensado (driver desktop). */
  urgency?: "normal" | "critical";
}

export interface Notifier {
  readonly driver: string;
  send(notification: Notification): Promise<void>;
}

const NOOP: Notifier = {
  driver: "none",
  async send() {},
};

/**
 * `notify-send`, presente em qualquer desktop Linux com libnotify.
 *
 * A URL vai no corpo em vez de virar botão: ações do `notify-send` exigem um
 * daemon que fique vivo esperando o clique, e o worker não é esse processo.
 * Texto selecionável resolve o caso de uso sem processo extra.
 */
const desktopNotifier: Notifier = {
  driver: "desktop",
  async send({ title, body, url, urgency = "normal" }) {
    const text = url ? `${body}\n${url}` : body;
    await run("notify-send", [
      "--app-name=Job Hunter",
      `--urgency=${urgency}`,
      "--icon=emblem-important",
      title,
      text,
    ]);
  },
};

function webhookNotifier(url: string): Notifier {
  return {
    driver: "webhook",
    async send(notification) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `text` junta tudo porque Slack, Discord e Telegram leem esse campo;
        // os campos soltos ficam para quem consome o payload estruturado.
        body: JSON.stringify({
          ...notification,
          text: [notification.title, notification.body, notification.url]
            .filter(Boolean)
            .join("\n"),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`webhook responded ${response.status}`);
      }
    },
  };
}

export function createNotifier(config: NotifierConfig = notifierConfig): Notifier {
  if (config.driver === "desktop") return desktopNotifier;

  if (config.driver === "webhook") {
    if (!config.webhookUrl) {
      logger.warn("NOTIFIER=webhook but NOTIFIER_WEBHOOK_URL is empty — notifications disabled");
      return NOOP;
    }
    return webhookNotifier(config.webhookUrl);
  }

  return NOOP;
}

let cached: Notifier | null = null;

export function getNotifier(): Notifier {
  cached ??= createNotifier();
  return cached;
}

/**
 * Envia sem nunca lançar.
 *
 * Quem chama está no meio de um job cujo resultado **já foi persistido**.
 * Propagar uma falha de notificação marcaria o job como falho e provocaria um
 * retry — reprocessando a vaga e gastando cota de IA de novo, para consertar
 * algo que não é o trabalho do job. Perder o aviso é o mal menor.
 */
export async function notifyQuietly(notification: Notification): Promise<boolean> {
  const notifier = getNotifier();
  if (notifier.driver === "none") return false;

  try {
    await notifier.send(notification);
    logger.info({ driver: notifier.driver, title: notification.title }, "notification sent");
    return true;
  } catch (err) {
    logger.warn(
      { driver: notifier.driver, error: (err as Error).message },
      "notification failed — job result is already persisted, continuing",
    );
    return false;
  }
}

/**
 * Checagem única no boot.
 *
 * Sem isto, um `NOTIFIER=desktop` numa máquina sem `libnotify-bin` falharia em
 * silêncio uma vez por vaga aprovada — e o usuário concluiria que o sistema não
 * está achando nada, quando na verdade só o aviso não chega.
 */
export async function verifyNotifier(): Promise<boolean> {
  const notifier = getNotifier();

  if (notifier.driver === "none") {
    logger.info("notifications disabled (NOTIFIER=none)");
    return false;
  }

  if (notifier.driver === "desktop") {
    try {
      await run("notify-send", ["--version"]);
    } catch {
      logger.warn(
        "NOTIFIER=desktop but `notify-send` was not found. " +
          "Install it with: sudo apt install libnotify-bin — " +
          "until then, APPLY jobs are saved but no alert is sent.",
      );
      return false;
    }
  }

  logger.info({ driver: notifier.driver }, "notifications ready");
  return true;
}

/** Usado em testes para descartar a instância memoizada. */
export function resetNotifier(): void {
  cached = null;
}
