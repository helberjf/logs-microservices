import { Queue } from "bullmq";
import { redis } from "./redis.js";
import { config } from "./config.js";

export const ingestQueue = new Queue(config.queueName, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 500 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 2000 },
  },
});
