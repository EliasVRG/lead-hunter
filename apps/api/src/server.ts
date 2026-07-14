import Fastify from "fastify";
import { addJob, JobType, leadQueue } from "@lead-hunter/queue";
import { findLeadByWebsite, healthcheck } from "@lead-hunter/database";
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
