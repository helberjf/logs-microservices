import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { healthRoutes } from "./routes/health.js";
import { logsRoutes } from "./routes/logs.js";
import { statsRoutes } from "./routes/stats.js";

export function buildServer() {
  const app = Fastify({ logger });

  app.register(helmet);
  app.register(cors, { origin: true });
  app.register(rateLimit, { max: 600, timeWindow: "1 minute" });

  // Optional API key gate
  app.addHook("onRequest", async (req, reply) => {
    if (!config.apiKey) return;
    const key = req.headers["x-api-key"];
    if (key !== config.apiKey) reply.code(401).send({ error: "Unauthorized" });
  });

  app.register(healthRoutes, { prefix: "/health" });
  app.register(logsRoutes, { prefix: "/v1/logs" });
  app.register(statsRoutes, { prefix: "/v1/stats" });

  return app;
}

async function main() {
  const app = buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info({ port: config.port }, "API started");
}

if (process.env.VITEST !== "true") {
  main().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
