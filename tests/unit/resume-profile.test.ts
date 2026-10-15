import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadResumeProfile, saveResumeProfile } from "@lead-hunter/config/resume-profile.js";
import type { ResumeProfile } from "@lead-hunter/shared/models/resume-profile.js";

describe("ResumeProfile file storage", () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "resume-profile-test-"));
    originalEnv = process.env.RESUME_PROFILE_PATH;
    process.env.RESUME_PROFILE_PATH = join(tmpDir, "resume-profile.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.RESUME_PROFILE_PATH;
    else process.env.RESUME_PROFILE_PATH = originalEnv;
  });

  it("returns null when no profile has been saved yet", async () => {
    const profile = await loadResumeProfile();
    expect(profile).toBeNull();
  });

  it("persists and reloads a resume profile", async () => {
    const profile: ResumeProfile = {
      name: "Elias",
      headline: "Backend Developer",
      seniority: "pleno",
      skills: ["Node.js"],
      roles: ["Backend Developer"],
      stack: ["Node.js", "TypeScript"],
      minRateHr: 60,
      maxRateHr: 120,
      minRate: 1000,
      maxRate: 5000,
      currency: "BRL",
      availability: "project-based",
      remotePreference: "remote-only",
      languages: ["Português"],
      bio: "Dev freelancer",
    };

    const saved = await saveResumeProfile(profile);
    expect(saved.updated_at).toBeDefined();

    const reloaded = await loadResumeProfile();
    expect(reloaded?.name).toBe("Elias");
    expect(reloaded?.skills).toEqual(["Node.js"]);
  });
});
