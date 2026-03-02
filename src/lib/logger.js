import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: config.env === "production" ? "info" : "debug",
  redact: {
    paths: ["req.headers.authorization", "req.headers['x-api-key']"],
    remove: true,
  },
});
