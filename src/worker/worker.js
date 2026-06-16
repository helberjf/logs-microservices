import "dotenv/config";
import { UnrecoverableError, Worker } from "bullmq";
import { ingestLogSchema } from "../shared/schemas.js";
import { redis } from "../lib/redis.js";
import { config, must } from "../lib/config.js";
import { pool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

must("databaseUrl");

export async function processIngestJob(job) {
  const jobId = job.id;
  await pool.query(
    "UPDATE ingest_jobs SET status = 'processing', error = NULL WHERE job_id = $1",
    [jobId],
  );

  const parsed = ingestLogSchema.safeParse(job.data);
  if (!parsed.success) {
    const msg = parsed.error.message;
    await pool.query(
      "UPDATE ingest_jobs SET status = 'failed', processed_at = now(), error = $2 WHERE job_id = $1",
      [jobId, msg],
    );
    throw new UnrecoverableError(msg);
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

  await pool.query(
    "UPDATE ingest_jobs SET status = 'processed', processed_at = now() WHERE job_id = $1",
    [jobId],
  );
  return { ok: true };
}

export async function recordDeadLetter(job, err) {
  const message = err instanceof Error ? err.message : String(err);
  await pool.query(
    `
    INSERT INTO ingest_dead_letters (job_id, queue_name, job_name, payload, error, attempts)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6)
    ON CONFLICT (job_id) DO UPDATE SET
      queue_name = EXCLUDED.queue_name,
      job_name = EXCLUDED.job_name,
      payload = EXCLUDED.payload,
      error = EXCLUDED.error,
      attempts = EXCLUDED.attempts,
      failed_at = now()
    `,
    [
      job.id,
      config.queueName,
      job.name ?? "ingest",
      JSON.stringify(job.data ?? {}),
      message,
      job.attemptsMade ?? 0,
    ],
  );
}

export function createIngestWorker() {
  const worker = new Worker(config.queueName, processIngestJob, {
    connection: redis,
    concurrency: 10,
  });

  worker.on("completed", (job) =>
    logger.debug({ jobId: job.id }, "job completed"),
  );
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "job failed");

    if (!job?.id) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    pool
      .query(
        "UPDATE ingest_jobs SET status = 'failed', processed_at = now(), error = $2 WHERE job_id = $1",
        [job.id, err instanceof Error ? err.message : String(err)],
      )
      .then(() => recordDeadLetter(job, err))
      .catch((updateErr) =>
        logger.error(
          { jobId: job.id, err: updateErr },
          "failed to update ingest job status",
        ),
      );
  });

  return worker;
}

const worker = process.env.VITEST === "true" ? null : createIngestWorker();

async function shutdown(signal) {
  logger.info({ signal }, "worker shutting down...");
  await worker?.close();
  await pool.end();
  await redis.quit();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
