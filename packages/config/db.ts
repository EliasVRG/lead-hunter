import { envNumber, envString } from "./env.js";

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Aceita `DATABASE_URL` (forma usada no README e no deploy) com fallback para as
 * variáveis `DB_*` individuais. Antes só os `DB_*` eram lidos, o que fazia o
 * `DATABASE_URL` do `.env` ser silenciosamente ignorado.
 */
function fromDatabaseUrl(url: string): Partial<DbConfig> {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: parsed.pathname.replace(/^\//, "") || undefined,
      user: decodeURIComponent(parsed.username) || undefined,
      password: decodeURIComponent(parsed.password) || undefined,
    };
  } catch {
    return {};
  }
}

const fromUrl = process.env.DATABASE_URL ? fromDatabaseUrl(process.env.DATABASE_URL) : {};

export const dbConfig: DbConfig = {
  host: envString("DB_HOST", fromUrl.host ?? "localhost"),
  port: envNumber("DB_PORT", fromUrl.port ?? 5432),
  database: envString("DB_NAME", fromUrl.database ?? "leads"),
  user: envString("DB_USER", fromUrl.user ?? "lead"),
  password: envString("DB_PASSWORD", fromUrl.password ?? "lead"),
};
