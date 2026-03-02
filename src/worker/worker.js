import "dotenv/config";
import { Worker } from "bullmq";
import { ingestLogSchema } from "../shared/schemas.js";
import { redis } from "../lib/redis.js";
import { config, must } from "../lib/config.js";
import { pool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

must("databaseUrl");

const worker = new Worker(
  config.queueName,
  async (job) => {
    const jobId = job.id;

    const parsed = ingestLogSchema.safeParse(job.data);
    if (!parsed.success) {
      const msg = parsed.error.message;
      await pool.query(
        "UPDATE ingest_jobs SET status = 'failed', processed_at = now(), error = $2 WHERE job_id = $1",
        [jobId, msg],
      );
      throw new Error(msg);
    }

    const l = parsed.data;

    await pool.query(
      `
      INSERT INTO logs (ts, service, env, level, message, trace_id, span_id, attrs, context, raw)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)
      `,
      [
        l.ts,
        l.service,
        l.env ?? "prod",
        l.level,
        l.message,
        l.traceId ?? null,
        l.spanId ?? null,
        JSON.stringify(l.attrs ?? {}),
        JSON.stringify(l.context ?? {}),
        JSON.stringify(l.raw ?? l),
      ],
    );

    await pool.query("UPDATE ingest_jobs SET status = 'processed', processed_at = now() WHERE job_id = $1", [jobId]);
    return { ok: true };
  },
  { connection: redis, concurrency: 10 },
);

worker.on("completed", (job) => logger.debug({ jobId: job.id }, "job completed"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));

process.on("SIGINT", async () => {
  logger.info("worker shutting down...");
  await worker.close();
  await pool.end();
  await redis.quit();
  process.exit(0);
});
