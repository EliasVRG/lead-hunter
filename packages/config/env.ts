import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

/**
 * Carrega o `.env` da raiz do monorepo.
 *
 * Todo módulo de config importa este arquivo como efeito colateral (`import "./env.js"`)
 * antes de ler `process.env`. ESM avalia imports na ordem em que aparecem, então isso
 * garante que o `.env` já esteja carregado independentemente de qual app é o entrypoint
 * (api, worker, vitest ou um script solto).
 */
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "package-lock.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}

export const repoRoot = findRepoRoot();

loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });

export function envString(key: string, fallback = ""): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

export function envNumber(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function envList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;

  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}
