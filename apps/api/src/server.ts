import Fastify from "fastify";
import { addJob, JobType, leadQueue } from "@lead-hunter/queue";
import { findLeadByWebsite, healthcheck, listJobPostings, updateJobPostingStatus } from "@lead-hunter/database";
import { loadResumeProfile, saveResumeProfile } from "@lead-hunter/config/resume-profile.js";
import type { ResumeProfile } from "@lead-hunter/shared/models/resume-profile.js";
import { logger } from "@lead-hunter/logger";
import { createBullBoard } from "@bull-board/api";
import { FastifyAdapter } from "@bull-board/fastify";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";

const serverAdapter = new FastifyAdapter();
serverAdapter.setBasePath("/queues");

createBullBoard({
  queues: [new BullMQAdapter(leadQueue)],
  serverAdapter,
});

const app = Fastify({ logger: false });
app.register(serverAdapter.registerPlugin(), { prefix: "/queues" });

// Deprecated: kept only until the job-hunter migration (specs/completed/fase_00_pivot_job_hunter.md)
// is validated end to end. Do not add new features to this route — use /discovery/runs instead.
app.post<{ Body: { name?: string; website: string; city?: string } }>(
  "/leads",
  async (req, reply) => {
    const { name, website, city } = req.body;

    if (!website) {
      return reply.status(400).send({ error: "website is required" });
    }

    const existing = await findLeadByWebsite(website);
    if (existing) {
      logger.info({ website }, "duplicate lead rejected");
      return reply.status(409).send({ error: "lead already exists", lead: existing });
    }

    const lead = { name, website, city };
    const job = await addJob(JobType.Scrape, lead);
    logger.info({ jobId: job.id, website }, "lead enqueued");

    return reply.status(202).send({ jobId: job.id, lead });
  },
);

app.get("/resume-profile", async (_req, reply) => {
  const profile = await loadResumeProfile();
  if (!profile) {
    return reply.status(404).send({ error: "resume profile not configured yet" });
  }
  return reply.status(200).send(profile);
});

app.post<{ Body: Partial<ResumeProfile> }>("/resume-profile", async (req, reply) => {
  const body = req.body;

  if (!body.name || !body.headline || !body.seniority) {
    return reply.status(400).send({ error: "name, headline and seniority are required" });
  }

  const profile: ResumeProfile = {
    name: body.name,
    headline: body.headline,
    seniority: body.seniority,
    skills: body.skills ?? [],
    roles: body.roles ?? [],
    stack: body.stack ?? [],
    minRate: body.minRate ?? null,
    maxRate: body.maxRate ?? null,
    currency: body.currency ?? "BRL",
    availability: body.availability ?? "project-based",
    remotePreference: body.remotePreference ?? "remote-only",
    languages: body.languages ?? [],
    bio: body.bio ?? "",
  };

  const saved = await saveResumeProfile(profile);
  logger.info({ name: saved.name }, "resume profile saved");

  return reply.status(200).send(saved);
});

app.post<{ Body: { searchUrl?: string; maxListings?: number } }>(
  "/discovery/runs",
  async (req, reply) => {
    const { searchUrl, maxListings } = req.body ?? {};

    const job = await addJob(JobType.Scrape, { searchUrl, maxListings });
    logger.info({ jobId: job.id }, "discovery run enqueued");

    return reply.status(202).send({ jobId: job.id });
  },
);

app.get<{ Querystring: { tier?: string; status?: string } }>("/jobs", async (req, reply) => {
  const { tier, status } = req.query;
  const jobs = await listJobPostings({ tier, status });
  return reply.status(200).send(jobs);
});

app.patch<{ Params: { id: string }; Body: { status: string } }>(
  "/jobs/:id/status",
  async (req, reply) => {
    const id = Number(req.params.id);
    const { status } = req.body ?? {};

    const validStatuses = ["discovered", "reviewing", "proposal_ready", "applied", "won", "lost", "dismissed"];
    if (!status || !validStatuses.includes(status)) {
      return reply.status(400).send({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }

    const updated = await updateJobPostingStatus(id, status);
    if (!updated) {
      return reply.status(404).send({ error: "job posting not found" });
    }

    return reply.status(200).send(updated);
  },
);

app.get("/health", async (_req, reply) => {
  const dbOk = await healthcheck();
  const status = dbOk ? "ok" : "degraded";
  const code = dbOk ? 200 : 503;
  return reply.status(code).send({ status, database: dbOk ? "up" : "down" });
});

const port = Number(process.env.API_PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  logger.info({ port }, "api started");
});
