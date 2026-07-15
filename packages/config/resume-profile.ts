import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResumeProfile } from "@lead-hunter/shared/models/resume-profile.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(currentDir, "../../config/resume-profile.json");

export function resumeProfilePath(): string {
  return process.env.RESUME_PROFILE_PATH || DEFAULT_PATH;
}

export async function loadResumeProfile(): Promise<ResumeProfile | null> {
  try {
    const raw = await readFile(resumeProfilePath(), "utf-8");
    return JSON.parse(raw) as ResumeProfile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveResumeProfile(profile: ResumeProfile): Promise<ResumeProfile> {
  const path = resumeProfilePath();
  await mkdir(dirname(path), { recursive: true });
  const toSave: ResumeProfile = { ...profile, updated_at: new Date() };
  await writeFile(path, JSON.stringify(toSave, null, 2) + "\n", "utf-8");
  return toSave;
}
