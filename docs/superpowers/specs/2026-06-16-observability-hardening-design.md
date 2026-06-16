# Observability Hardening Design

## Goal

Implement the remaining production-oriented improvements for the logs
microservice: richer search filters, Prometheus metrics, CI linting, explicit
dead-letter tracking, integration coverage, ingestion idempotency, and
time-based retention support.

## Scope

This pass keeps the existing architecture: Express API, BullMQ/Redis Worker,
PostgreSQL storage, Zod validation, Vitest/Supertest tests, Docker Compose, and
static OpenAPI documentation.

## Design

### Search

`GET /v1/logs` will support:

- `traceId`: exact match on `trace_id`.
- `spanId`: exact match on `span_id`.
- `attrKey` and `attrValue`: optional JSONB attribute filter.

`attrKey` can be used alone to check key existence. When `attrValue` is also
provided, the query uses JSONB containment so typed JSON values can be matched
without string interpolation.

### Ingestion idempotency

`POST /v1/logs` will accept optional `dedupeKey` per log. When present, it is
stored in `ingest_jobs` and reused on duplicate submissions. Duplicate requests
return the existing job ID instead of enqueueing a second job.

The database enforces this with a partial unique index on `dedupe_key` when it
is not null.

### Dead-letter tracking

Worker failures after the final BullMQ attempt will be copied into an
`ingest_dead_letters` table. The table keeps the job ID, queue name, payload,
error, attempts, and timestamps.

This is intentionally a PostgreSQL-backed dead-letter log, not a second queue.
It is easy to inspect in this project and can later power reprocessing.

### Metrics

Add `GET /metrics` with Prometheus text format. Metrics will include:

- process uptime.
- API request count by method, route, and status.
- ingest accepted and failed enqueue counters.
- Worker completed and failed counters.
- Queue waiting/delayed/active/completed/failed counts when Redis is reachable.

The endpoint should degrade gracefully if Redis is unavailable.

### Retention

Add a simple retention script:

```bash
npm run retention
```

It deletes old rows from `logs` using `RETENTION_DAYS` and `RETENTION_BATCH_SIZE`.
This is not full table partitioning yet, but it is the smallest useful
time-based retention mechanism for the current schema.

### CI

CI will run lint before migrations/tests.

### Documentation

Update README, `ENTREVISTA_TECNICA.md`, and `docs/openapi.yaml` to cover the new
contracts and operational features.

## Testing

Use TDD with focused tests:

- schema/query validation for new filters and `dedupeKey`.
- SQL generation for search filters.
- idempotent enqueue behavior.
- metrics endpoint output.
- retention script SQL behavior.
- migration/schema files are covered by integration-capable CI path.

## Non-goals

- No Swagger UI runtime dependency.
- No external metrics package.
- No Kafka/OpenSearch migration.
- No destructive retention execution during normal tests.
