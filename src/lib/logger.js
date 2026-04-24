import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level:
    process.env.VITEST === "true"
      ? "silent"
      : config.env === "production"
        ? "info"
        : "debug",
  redact: {
    paths: ["req.headers.authorization", "req.headers['x-api-key']"],
    remove: true,
  },
});
