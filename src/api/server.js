import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { pool } from "../lib/db.js";
import { closeIngestQueue } from "../lib/queue.js";
import { redis } from "../lib/redis.js";
import { healthRouter } from "./routes/health.js";
import { logsRouter } from "./routes/logs.js";
import { statsRouter } from "./routes/stats.js";

export function buildServer() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true }));
  app.use(rateLimit({ limit: 600, windowMs: 60 * 1000 }));
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    if (!config.apiKey) return next();
    if (req.header("x-api-key") !== config.apiKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return next();
  });

  app.use("/health", healthRouter);
  app.use("/v1/logs", logsRouter);
  app.use("/v1/stats", statsRouter);

  app.use((err, _req, res, _next) => {
    logger.error({ err }, "unhandled API error");
    if (res.headersSent) return;
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}

export async function closeServerResources() {
  await closeIngestQueue();
}

async function main() {
  const app = buildServer();
  const server = app.listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port }, "API started");
  });

  async function shutdown(signal) {
    logger.info({ signal }, "API shutting down...");
    server.close(async () => {
      await closeServerResources();
      await pool.end();
      await redis.quit().catch(() => redis.disconnect());
      process.exit(0);
    });
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

if (process.env.VITEST !== "true") {
  main().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
