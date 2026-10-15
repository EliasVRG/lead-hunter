import Fastify from "fastify";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { allQueues, enqueueDiscovery, enqueueProposal, queueCounts } from "@lead-hunter/queue";
import {
  JOB_POSTING_STATUSES,
  findJobPostingById,
  healthcheck,
  listJobPostings,
  updateJobPostingStatus,
  type JobPostingStatus,
} from "@lead-hunter/database";
import { loadResumeProfile, saveResumeProfile } from "@lead-hunter/config/resume-profile.js";
import { aiConfig } from "@lead-hunter/config/ai.js";
import type { ResumeProfile } from "@lead-hunter/shared/models/resume-profile.js";
import { logger } from "@lead-hunter/logger";

const serverAdapter = new FastifyAdapter();
serverAdapter.setBasePath("/queues");

createBullBoard({
  queues: allQueues.map((queue) => new BullMQAdapter(queue)),
  serverAdapter,
});

const app = Fastify({ logger: false });
app.register(serverAdapter.registerPlugin(), { prefix: "/queues" });

app.get("/resume-profile", async (_req, reply) => {
  const profile = await loadResumeProfile();
  if (!profile) {
    return reply.status(404).send({ error: "resume profile not configured yet" });
  }
  return reply.status(200).send(profile);
});

app.post<{ Body: Partial<ResumeProfile> }>("/resume-profile", async (req, reply) => {
  const body = req.body ?? {};

  if (!body.name || !body.headline || !body.seniority) {
    return reply.status(400).send({ error: "name, headline and seniority are required" });
  }

  const saved = await saveResumeProfile({
    name: body.name,
    headline: body.headline,
    seniority: body.seniority,
    skills: body.skills ?? [],
    roles: body.roles ?? [],
    stack: body.stack ?? [],
    minRateHr: body.minRateHr ?? null,
    maxRateHr: body.maxRateHr ?? null,
    minRate: body.minRate ?? null,
    maxRate: body.maxRate ?? null,
    currency: body.currency ?? "BRL",
    availability: body.availability ?? "project-based",
    remotePreference: body.remotePreference ?? "remote-only",
    languages: body.languages ?? [],
    bio: body.bio ?? "",
    highlights: body.highlights ?? [],
    openSource: body.openSource ?? [],
    links: body.links ?? {},
  });

  logger.info({ name: saved.name }, "resume profile saved");
  return reply.status(200).send(saved);
});

/**
 * Dispara um ciclo de descoberta. A API só enfileira — scraping e IA acontecem
 * no worker (AGENT.md §1.3).
 */
app.post<{
  Body: {
    query?: string;
    category?: string;
    maxPages?: number;
    maxListings?: number;
    maxAgeHours?: number;
    fetchDetails?: boolean;
    searchUrl?: string;
  };
}>("/discovery/runs", async (req, reply) => {
  const body = req.body ?? {};
  const job = await enqueueDiscovery(body);

  return reply.status(202).send({ jobId: job.id, queue: "discovery", options: body });
});

app.get<{ Querystring: { tier?: string; status?: string } }>("/jobs", async (req, reply) => {
  const { tier, status } = req.query;
  const jobs = await listJobPostings({ tier, status });
  return reply.status(200).send(jobs);
});

app.patch<{ Params: { id: string }; Body: { status?: string } }>(
  "/jobs/:id/status",
  async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return reply.status(400).send({ error: "id must be an integer" });
    }

    const { status } = req.body ?? {};
    if (!status || !JOB_POSTING_STATUSES.includes(status as JobPostingStatus)) {
      return reply
        .status(400)
        .send({ error: `status must be one of: ${JOB_POSTING_STATUSES.join(", ")}` });
    }

    const updated = await updateJobPostingStatus(id, status as JobPostingStatus);
    if (!updated) {
      return reply.status(404).send({ error: "job posting not found" });
    }

    return reply.status(200).send(updated);
  },
);

/**
 * Pede um rascunho de proposta para uma vaga específica, independente do tier.
 *
 * A triagem só enfileira proposta automaticamente para `APPLY`. Este endpoint é
 * a saída manual: você leu uma `MAYBE`, gostou, e quer o rascunho sem esperar
 * que o score suba.
 */
app.post<{ Params: { id: string } }>("/jobs/:id/proposal", async (req, reply) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return reply.status(400).send({ error: "id must be an integer" });
  }

  const posting = await findJobPostingById(id);
  if (!posting) {
    return reply.status(404).send({ error: "job posting not found" });
  }

  const job = await enqueueProposal({
    platform: posting.platform,
    externalId: posting.external_id,
    score: posting.score ?? undefined,
  });

  return reply.status(202).send({
    jobId: job.id,
    queue: "proposal",
    posting: { id, title: posting.title, score: posting.score, tier: posting.tier },
  });
});

/** Visão rápida do pipeline sem abrir o Bull Board. */
app.get("/queues/status", async (_req, reply) => {
  return reply.status(200).send(await queueCounts());
});

app.get("/health", async (_req, reply) => {
  const dbOk = await healthcheck();
  const aiConfigured = Boolean(aiConfig.openrouter.apiKey);

  return reply.status(dbOk ? 200 : 503).send({
    status: dbOk && aiConfigured ? "ok" : "degraded",
    database: dbOk ? "up" : "down",
    // Sem chave, descoberta funciona mas triagem e proposta falham — vale
    // aparecer aqui em vez de só estourar no worker.
    openrouter: aiConfigured ? "configured" : "missing OPENROUTER_API_KEY",
    models: aiConfig.openrouter.models,
  });
});

const port = Number(process.env.API_PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  logger.info({ port, bullBoard: `http://localhost:${port}/queues` }, "api started");
});
