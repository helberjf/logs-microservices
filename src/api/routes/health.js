import { dbHealthcheck } from "../../lib/db.js";
import { redis } from "../../lib/redis.js";

export async function healthRoutes(app) {
  app.get("/liveness", async () => ({ ok: true }));

  app.get("/readiness", async () => {
    const dbOk = await dbHealthcheck().catch(() => false);
    const redisOk = await redis.ping().then((r) => r === "PONG").catch(() => false);
    return { ok: dbOk && redisOk, dbOk, redisOk };
  });
}
