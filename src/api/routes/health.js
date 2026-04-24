import { Router } from "express";
import { dbHealthcheck } from "../../lib/db.js";
import { redis } from "../../lib/redis.js";

export const healthRouter = Router();

healthRouter.get("/liveness", (_req, res) => {
  res.json({ ok: true });
});

healthRouter.get("/readiness", async (_req, res) => {
  const dbOk = await dbHealthcheck().catch(() => false);
  const redisOk = await redis
    .ping()
    .then((r) => r === "PONG")
    .catch(() => false);

  res
    .status(dbOk && redisOk ? 200 : 503)
    .json({ ok: dbOk && redisOk, dbOk, redisOk });
});
