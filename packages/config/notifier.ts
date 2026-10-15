import { envString } from "./env.js";

export type NotifierDriver = "desktop" | "webhook" | "none";

export interface NotifierConfig {
  driver: NotifierDriver;
  webhookUrl: string;
}

const DRIVERS: NotifierDriver[] = ["desktop", "webhook", "none"];

function parseDriver(raw: string): NotifierDriver {
  return DRIVERS.includes(raw as NotifierDriver) ? (raw as NotifierDriver) : "none";
}

/**
 * Padrão `none`: notificação é opt-in. O driver `desktop` depende de
 * `notify-send` e de uma sessão gráfica, que não existem num container ou numa
 * sessão SSH — avisar em silêncio que não avisa é pior do que estar desligado.
 */
export const notifierConfig: NotifierConfig = {
  driver: parseDriver(envString("NOTIFIER", "none")),
  webhookUrl: envString("NOTIFIER_WEBHOOK_URL"),
};
