ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS dedupe_key text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingest_jobs_dedupe_key
  ON ingest_jobs (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logs_span_id
  ON logs (span_id)
  WHERE span_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ingest_dead_letters (
  job_id text PRIMARY KEY,
  queue_name text NOT NULL,
  job_name text NOT NULL,
  payload jsonb NOT NULL,
  error text NOT NULL,
  attempts integer NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
