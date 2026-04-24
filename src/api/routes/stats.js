import { Router } from "express";
import { statsQuerySchema } from "../../shared/schemas.js";
import { pool } from "../../lib/db.js";

export const statsRouter = Router();

statsRouter.get("/", async (req, res, next) => {
  const parsed = statsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.flatten() });
  }
  const q = parsed.data;

  const from =
    q.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = q.to ?? new Date().toISOString();
  const bucketSeconds = q.bucketMinutes * 60;

  const where = ["ts >= $1", "ts <= $2"];
  const params = [from, to];

  if (q.service) {
    params.push(q.service);
    where.push(`service = $${params.length}`);
  }
  if (q.env) {
    params.push(q.env);
    where.push(`env = $${params.length}`);
  }

  try {
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
      WHERE ${where.join(" AND ")}
      GROUP BY bucket_start, level
      ORDER BY bucket_start ASC, level ASC;
      `,
      params,
    );

    return res.json({
      range: { from, to, bucketMinutes: q.bucketMinutes },
      byLevel: byLevel.rows,
      timeline: timeline.rows,
    });
  } catch (err) {
    return next(err);
  }
});
