import IORedis from "ioredis";
import { config } from "./config.js";

// lazyConnect avoids opening sockets during unit tests unless actually used.
export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});
