CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logs (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL,
  service text NOT NULL,
  env text NOT NULL DEFAULT 'prod',
  level text NOT NULL,
  message text NOT NULL,
  trace_id text NULL,
  span_id text NULL,
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  job_id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  status text NOT NULL DEFAULT 'queued',
  error text NULL
);
