import { statsQuerySchema } from "../../shared/schemas.js";
import { pool } from "../../lib/db.js";

export async function statsRoutes(app) {
  app.get("/", async (req, reply) => {
    const parsed = statsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid query", details: parsed.error.flatten() });
    }
    const q = parsed.data;

    const from = q.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = q.to ?? new Date().toISOString();
    const bucketSeconds = q.bucketMinutes * 60;

    const where = ["ts >= $1", "ts <= $2"];
    const params = [from, to];

    if (q.service) { params.push(q.service); where.push(`service = $${params.length}`); }
    if (q.env) { params.push(q.env); where.push(`env = $${params.length}`); }

    const byLevel = await pool.query(
      `
      SELECT level, COUNT(*)::bigint as count
      FROM logs
      WHERE ${where.join(" AND ")}
      GROUP BY level
      ORDER BY count DESC;
      `,
      params,
    );

    params.push(bucketSeconds);
    const bucketIdx = params.length;

    const timeline = await pool.query(
      `
      SELECT
        to_timestamp(floor(extract(epoch from ts) / $${bucketIdx}) * $${bucketIdx}) AT TIME ZONE 'UTC' as bucket_start,
        level,
        COUNT(*)::bigint as count
      FROM logs
      WHERE ${where.slice(0, -1).join(" AND ")}
      GROUP BY bucket_start, level
      ORDER BY bucket_start ASC, level ASC;
      `,
      params,
    );

    return { range: { from, to, bucketMinutes: q.bucketMinutes }, byLevel: byLevel.rows, timeline: timeline.rows };
  });
}
