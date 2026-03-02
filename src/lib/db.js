import { Pool } from "pg";
import { must } from "./config.js";

export const pool = new Pool({
  connectionString: must("databaseUrl"),
  max: 10,
});

export async function dbHealthcheck() {
  const r = await pool.query("SELECT 1 as ok");
  return r.rows[0]?.ok === 1;
}
