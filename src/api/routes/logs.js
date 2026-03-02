import { v4 as uuidv4 } from "uuid";
import { ingestBodySchema, searchQuerySchema } from "../../shared/schemas.js";
import { ingestQueue } from "../../lib/queue.js";
import { pool } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

export async function logsRoutes(app) {
  // Ingest logs (single or batch) -> queue
  app.post("/", async (req, reply) => {
    const parsed = ingestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

    try {
      const ops = items.map(async (l) => {
        const jobId = uuidv4();
        const ts = isNaN(new Date(l.ts).getTime()) ? new Date().toISOString() : new Date(l.ts).toISOString();
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

        // record a queued job and enqueue concurrently
        await pool.query(
          "INSERT INTO ingest_jobs (job_id, status) VALUES ($1, 'queued') ON CONFLICT (job_id) DO NOTHING",
          [jobId],
        );

        await ingestQueue.add("ingest", payload, { jobId });
        return jobId;
      });

      const jobIds = await Promise.all(ops);
      return reply.code(202).send({ accepted: jobIds.length, jobIds });
    } catch (err) {
      logger.error({ err }, "failed to enqueue ingest job(s)");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.get("/ingest/:jobId", async (req, reply) => {
    const { jobId } = req.params;
    const r = await pool.query(
      "SELECT job_id, received_at, processed_at, status, error FROM ingest_jobs WHERE job_id = $1",
      [jobId],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: "Not found" });
    return r.rows[0];
  });

  // Search (filters + keyset pagination)
  app.get("/", async (req, reply) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query", details: parsed.error.flatten() });
    }
    const q = parsed.data;

    const where = [];
    const params = [];

    if (q.service) { params.push(q.service); where.push(`service = $${params.length}`); }
    if (q.env) { params.push(q.env); where.push(`env = $${params.length}`); }
    if (q.level) { params.push(q.level); where.push(`level = $${params.length}`); }
    if (q.from) { params.push(q.from); where.push(`ts >= $${params.length}`); }
    if (q.to) { params.push(q.to); where.push(`ts <= $${params.length}`); }
    if (q.q) {
      params.push(q.q);
      where.push(`to_tsvector('simple', message) @@ plainto_tsquery('simple', $${params.length})`);
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

    const r = await pool.query(sql, params);
    const nextCursor =
      r.rows.length > 0
        ? { cursorTs: r.rows[r.rows.length - 1].ts, cursorId: r.rows[r.rows.length - 1].id }
        : null;

    return { items: r.rows, nextCursor };
  });

  app.get("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "Invalid id" });

    const r = await pool.query(
      "SELECT id, ts, service, env, level, message, trace_id, span_id, attrs, context, raw FROM logs WHERE id = $1",
      [id],
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: "Not found" });
    return r.rows[0];
  });
}
