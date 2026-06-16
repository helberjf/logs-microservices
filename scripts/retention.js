import "dotenv/config";
import { pool as defaultPool } from "../src/lib/db.js";

export function readRetentionConfig(env = process.env) {
  const days = Number(env.RETENTION_DAYS ?? 30);
  const batchSize = Number(env.RETENTION_BATCH_SIZE ?? 1000);

  if (!Number.isInteger(days) || days <= 0) {
    throw new Error("RETENTION_DAYS must be a positive integer");
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("RETENTION_BATCH_SIZE must be a positive integer");
  }

  return { days, batchSize };
}

export async function runRetention({
  pool = defaultPool,
  env = process.env,
  logger = console,
} = {}) {
  const { days, batchSize } = readRetentionConfig(env);
  let deleted = 0;
  let batches = 0;

  while (true) {
    const result = await pool.query(
      `
      WITH deleted AS (
        DELETE FROM logs
        WHERE id IN (
          SELECT id
          FROM logs
          WHERE ts < now() - ($1::int * interval '1 day')
          ORDER BY ts ASC
          LIMIT $2
        )
        RETURNING 1
      )
      SELECT COUNT(*)::int AS deleted_count FROM deleted;
      `,
      [days, batchSize],
    );

    const deletedCount = Number(result.rows[0]?.deleted_count ?? 0);
    deleted += deletedCount;
    batches += 1;

    if (deletedCount < batchSize) break;
  }

  logger.info?.({ deleted, batches, days }, "retention complete");
  return { deleted, batches };
}

if (process.env.VITEST !== "true") {
  runRetention()
    .then(() => defaultPool.end())
    .catch(async (err) => {
      console.error(err);
      await defaultPool.end().catch(() => {});
      process.exit(1);
    });
}
