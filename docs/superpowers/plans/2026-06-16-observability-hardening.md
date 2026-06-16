# Observability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the remaining production-oriented improvements to the logs microservice.

**Architecture:** Keep Express, BullMQ, Redis, PostgreSQL, Zod, and Vitest. Add small focused modules for metrics and retention, extend existing routes/schemas, and document the new contracts in OpenAPI and Markdown.

**Tech Stack:** Node.js 20, Express 5, BullMQ, Redis, PostgreSQL, Zod, Vitest, Supertest, Docker Compose, GitHub Actions.

---

## File Map

- Modify `src/shared/schemas.js`: add `dedupeKey`, `traceId`, `spanId`, `attrKey`, `attrValue`.
- Modify `src/api/routes/logs.js`: implement idempotency and search filters.
- Modify `src/api/server.js`: add request metrics middleware and `/metrics`.
- Create `src/lib/metrics.js`: in-memory counters and Prometheus rendering.
- Modify `src/worker/worker.js`: track worker metrics and dead-letter rows.
- Create `scripts/retention.js`: delete old logs in batches.
- Create `migrations/003_hardening.sql`: dedupe key and dead-letter schema.
- Modify `.github/workflows/ci.yml`: add lint gate.
- Add/modify tests in `test/`: cover filters, idempotency, metrics, and retention.
- Modify `README.md`, `ENTREVISTA_TECNICA.md`, and `docs/openapi.yaml`.

## Tasks

### Task 1: Tests for contracts and API behavior

- [ ] Add tests for new search filters in `test/api.search.filters.test.js`.
- [ ] Add tests for idempotent `dedupeKey` behavior in `test/api.ingest.test.js`.
- [ ] Add tests for `GET /metrics` in `test/api.metrics.test.js`.
- [ ] Add tests for retention SQL in `test/retention.test.js`.
- [ ] Run targeted tests and verify they fail for missing implementation.

### Task 2: Schema and database

- [ ] Add `dedupe_key` to `ingest_jobs`.
- [ ] Add partial unique index on `ingest_jobs(dedupe_key)`.
- [ ] Add `ingest_dead_letters`.
- [ ] Extend Zod schemas.

### Task 3: API and metrics

- [ ] Implement idempotent ingestion.
- [ ] Implement `traceId`, `spanId`, `attrKey`, and `attrValue` search filters.
- [ ] Add metrics module and `/metrics`.
- [ ] Run targeted API tests.

### Task 4: Worker dead-letter tracking

- [ ] Insert final failures into `ingest_dead_letters`.
- [ ] Increment Worker counters.
- [ ] Keep existing job status updates.

### Task 5: Retention and CI

- [ ] Add `scripts/retention.js`.
- [ ] Add `npm run retention`.
- [ ] Add lint step to CI.
- [ ] Run retention tests.

### Task 6: Documentation and final verification

- [ ] Update OpenAPI.
- [ ] Update README.
- [ ] Update interview guide.
- [ ] Run `npm test`, `npm run lint`, `docker compose config`, OpenAPI parse, and `git diff --check`.
- [ ] Commit and push only project files.

## Self-review

- Covers all requested improvements.
- No new runtime dependencies are required.
- Database changes are additive.
- Retention is explicit and opt-in.
- Metrics endpoint degrades if Redis is unavailable.
