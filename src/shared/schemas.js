import { z } from "zod";

export const logLevelEnum = z.enum([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

export const ingestLogSchema = z.object({
  ts: z.string().datetime({ offset: true }),
  service: z.string().min(1).max(120),
  env: z.string().min(1).max(40).optional(),
  level: logLevelEnum,
  message: z.string().min(1).max(20000),
  traceId: z.string().max(128).optional(),
  spanId: z.string().max(128).optional(),
  attrs: z.record(z.string(), z.any()).optional(),
  context: z.record(z.string(), z.any()).optional(),
  raw: z.any().optional(),
});

export const ingestBodySchema = z.union([
  ingestLogSchema,
  z.array(ingestLogSchema).min(1).max(500),
]);

export const searchQuerySchema = z
  .object({
    service: z.string().min(1).max(120).optional(),
    env: z.string().min(1).max(40).optional(),
    level: logLevelEnum.optional(),
    q: z.string().min(1).max(200).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursorTs: z.string().datetime({ offset: true }).optional(),
    cursorId: z.coerce.number().int().positive().optional(),
  })
  .refine((q) => Boolean(q.cursorTs) === Boolean(q.cursorId), {
    message: "cursorTs and cursorId must be provided together",
    path: ["cursor"],
  });

export const statsQuerySchema = z.object({
  service: z.string().min(1).max(120).optional(),
  env: z.string().min(1).max(40).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  bucketMinutes: z.coerce.number().int().min(1).max(1440).default(60),
});
