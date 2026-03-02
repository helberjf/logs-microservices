import "dotenv/config";

process.env.VITEST = "true";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/logs";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.QUEUE_NAME ??= "logs:ingest";
