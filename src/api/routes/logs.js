import { randomUUID } from "node:crypto";
import { Router } from "express";
import { ingestBodySchema, searchQuerySchema } from "../../shared/schemas.js";
import { getIngestQueue } from "../../lib/queue.js";
import { pool } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

export const logsRouter = Router();

logsRouter.post("/", async (req, res) => {
  const parsed = ingestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

  try {
    const ops = items.map(async (l) => {
      const jobId = randomUUID();
      const ts = new Date(l.ts).toISOString();
      const payload = {
        ts,
        service: l.service,
        env: l.env ?? "prod",
        level: l.level,
        message: l.message,
        traceId: l.traceId,
        spanId: l.spanId,
        attrs: l.attrs ?? {},
        context: l.context ?? {},
        raw: l.raw ?? l,
      };

      await pool.query(
        "INSERT INTO ingest_jobs (job_id, status) VALUES ($1, 'queued') ON CONFLICT (job_id) DO NOTHING",
        [jobId],
      );

      try {
        await getIngestQueue().add("ingest", payload, { jobId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await pool.query(
          "UPDATE ingest_jobs SET status = 'failed', processed_at = now(), error = $2 WHERE job_id = $1",
          [jobId, message],
        );
        throw err;
      }

      return jobId;
    });

    const jobIds = await Promise.all(ops);
    return res.status(202).json({ accepted: jobIds.length, jobIds });
  } catch (err) {
    logger.error({ err }, "failed to enqueue ingest job(s)");
    return res.status(500).json({ error: "internal_error" });
  }
});

logsRouter.get("/ingest/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const r = await pool.query(
      "SELECT job_id, received_at, processed_at, status, error FROM ingest_jobs WHERE job_id = $1",
      [jobId],
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.json(r.rows[0]);
  } catch (err) {
    return next(err);
  }
});

logsRouter.get("/", async (req, res, next) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const q = parsed.data;

  const where = [];
  const params = [];

  if (q.service) {
    params.push(q.service);
    where.push(`service = $${params.length}`);
  }
  if (q.env) {
    params.push(q.env);
    where.push(`env = $${params.length}`);
  }
  if (q.level) {
    params.push(q.level);
    where.push(`level = $${params.length}`);
  }
  if (q.from) {
    params.push(q.from);
    where.push(`ts >= $${params.length}`);
  }
  if (q.to) {
    params.push(q.to);
    where.push(`ts <= $${params.length}`);
  }
  if (q.q) {
    params.push(q.q);
    where.push(
      `to_tsvector('simple', message) @@ plainto_tsquery('simple', $${params.length})`,
    );
  }

  if (q.cursorTs && q.cursorId) {
    params.push(q.cursorTs);
    const tsIdx = params.length;
    params.push(q.cursorId);
    const idIdx = params.length;
    where.push(`(ts, id) < ($${tsIdx}::timestamptz, $${idIdx}::bigint)`);
  }

  params.push(q.limit);
  const limitIdx = params.length;

  const sql = `
      SELECT id, ts, service, env, level, message, trace_id, span_id, attrs, context
      FROM logs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ts DESC, id DESC
      LIMIT $${limitIdx};
    `;

  try {
    const r = await pool.query(sql, params);
    const nextCursor =
      r.rows.length > 0
        ? {
            cursorTs: r.rows[r.rows.length - 1].ts,
            cursorId: r.rows[r.rows.length - 1].id,
          }
        : null;

    return res.json({ items: r.rows, nextCursor });
  } catch (err) {
    return next(err);
  }
});

logsRouter.get("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id))
    return res.status(400).json({ error: "Invalid id" });

  try {
    const r = await pool.query(
      "SELECT id, ts, service, env, level, message, trace_id, span_id, attrs, context, raw FROM logs WHERE id = $1",
      [id],
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
    return res.json(r.rows[0]);
  } catch (err) {
    return next(err);
  }
});
