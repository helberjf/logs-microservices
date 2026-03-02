import "dotenv/config";

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  apiKey: process.env.API_KEY ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  queueName: process.env.QUEUE_NAME ?? "logs:ingest",
};

export function must(key) {
  const v = config[key];
  if (typeof v === "string" && v.trim() === "") {
    throw new Error(`Missing configuration: ${key}`);
  }
  return v;
}
