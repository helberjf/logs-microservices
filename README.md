# Logs Microservice

[![CI](https://github.com/helberjf/logs-microservices/actions/workflows/ci.yml/badge.svg)](https://github.com/helberjf/logs-microservices/actions/workflows/ci.yml)

A backend microservice for **ingesting, asynchronously processing, storing, searching and aggregating structured logs**.

The project models a small observability platform: multiple applications ship logs over HTTP, the API validates and enqueues the events, a Worker persists them to PostgreSQL, and the API exposes endpoints for search, detail lookup, ingestion status and statistics.

## Overview

```text
Client
  |
  v
Express REST API
  |
  | creates ingest_jobs + publishes a job
  v
BullMQ / Redis
  |
  | Worker consumes with retry/backoff
  v
PostgreSQL
```

Why this architecture?

- The API responds fast with `202 Accepted` after validating and enqueuing.
- Database writes are decoupled from client latency.
- Redis/BullMQ provide the queue, retries, backoff and Worker concurrency.
- PostgreSQL stores the structured logs, JSONB, simple full-text search and aggregations.
- Health checks, migrations, Docker and CI bring the project closer to a real service.

## Reliability boundaries

The API records an ingestion job in PostgreSQL and publishes it to BullMQ in separate operations. The worker also persists the log and updates the job status separately. Ingestion deduplication and retries do not provide a zero-data-loss or exactly-once guarantee across these steps. Transactional publication and idempotent worker persistence are areas for further hardening.

## Stack

- Node.js 20+
- Express 5
- Zod
- BullMQ
- Redis
- PostgreSQL
- Pino
- Vitest + Supertest
- Docker Compose
- GitHub Actions

## Features

- REST API with contract validation.
- Single or batch ingestion, with a limit of 500 logs per request.
- Optional ingestion deduplication via `dedupeKey`.
- Asynchronous processing through a queue.
- Ingestion status: `queued`, `processing`, `processed`, `failed`.
- Search by `service`, `env`, `level`, `traceId`, `spanId`, JSON attributes, free text, time range and cursor.
- Keyset pagination with `cursorTs` and `cursorId`.
- Statistics per level and a timeline grouped by time bucket.
- Liveness and readiness health checks.
- Prometheus metrics at `GET /metrics`.
- Dead-letter tracking in PostgreSQL for the Worker's permanent failures.
- Time-based retention script via `npm run retention`.
- E2E smoke test for the Docker stack via `npm run test:e2e`.
- OpenAPI/Swagger spec in `docs/openapi.yaml`.

## API documentation

The OpenAPI specification lives in:

```text
docs/openapi.yaml
```

You can open it in Swagger Editor, Insomnia, Postman or any tool compatible with OpenAPI 3.0.

Documented endpoints:

- `GET /health/liveness`
- `GET /health/readiness`
- `GET /metrics`
- `POST /v1/logs`
- `GET /v1/logs`
- `GET /v1/logs/ingest/{jobId}`
- `GET /v1/logs/{id}`
- `GET /v1/stats`

## Configuration

Copy the example file:

```bash
cp .env.example .env
```

Variables:

| Variable | Example | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port of the API |
| `NODE_ENV` | `development` | Application environment |
| `API_KEY` | empty | Optional; when set, requires the `x-api-key` header |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/logs?sslmode=disable` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `QUEUE_NAME` | `logs-ingest` | BullMQ queue name; avoid `:` in the name |
| `RETENTION_DAYS` | `30` | Retention window used by `npm run retention` |
| `RETENTION_BATCH_SIZE` | `1000` | Batch size for cleaning up old logs |

## Running with Docker Compose

To start Postgres, Redis, migrations, the API and the Worker:

```bash
docker compose up --build
```

Compose runs the `migrate` service before starting the API and the Worker.

Test the API:

```bash
curl http://localhost:3000/health/liveness
curl http://localhost:3000/health/readiness
```

## Running in development

Install dependencies:

```bash
npm install
```

Start Postgres and Redis:

```bash
docker compose up -d postgres redis
```

Run the migrations:

```bash
npm run migrate
```

Start the API and the Worker in separate terminals:

```bash
npm run dev:api
npm run dev:worker
```

## Usage examples

### Ingest a log

```bash
curl -X POST http://localhost:3000/v1/logs \
  -H "Content-Type: application/json" \
  -d '{
    "ts": "2026-03-02T10:00:00.000Z",
    "service": "billing-api",
    "env": "prod",
    "level": "info",
    "message": "payment approved",
    "traceId": "trace-123",
    "spanId": "span-456",
    "dedupeKey": "billing-api:A1:approved",
    "attrs": {
      "orderId": "A1",
      "userId": "U9"
    }
  }'
```

Response:

```json
{
  "accepted": 1,
  "jobIds": ["4df7e9c5-d52f-41f8-bdd2-61c9163f8d55"]
}
```

If the same `dedupeKey` is sent again, the API returns the existing `jobId` and does not publish a second job to the queue:

```json
{
  "accepted": 1,
  "jobIds": ["4df7e9c5-d52f-41f8-bdd2-61c9163f8d55"],
  "duplicates": 1
}
```

### Check the job status

```bash
curl http://localhost:3000/v1/logs/ingest/4df7e9c5-d52f-41f8-bdd2-61c9163f8d55
```

Expected response after the Worker processes the job:

```json
{
  "job_id": "4df7e9c5-d52f-41f8-bdd2-61c9163f8d55",
  "received_at": "2026-03-02T10:00:00.000Z",
  "processed_at": "2026-03-02T10:00:01.000Z",
  "status": "processed",
  "error": null
}
```

### Search logs

```bash
curl "http://localhost:3000/v1/logs?service=billing-api&level=info&q=payment&limit=50"
```

Additional observability filters:

```bash
curl "http://localhost:3000/v1/logs?traceId=trace-123&spanId=span-456"
curl "http://localhost:3000/v1/logs?attrKey=orderId&attrValue=A1"
curl "http://localhost:3000/v1/logs?attrKey=orderId"
```

The response includes `nextCursor` when there is a next page. To continue, send `cursorTs` and `cursorId` together:

```bash
curl "http://localhost:3000/v1/logs?service=billing-api&limit=50&cursorTs=2026-03-02T10:00:00.000Z&cursorId=123"
```

### Statistics

```bash
curl "http://localhost:3000/v1/stats?bucketMinutes=60&service=billing-api&env=prod"
```

Returns:

- `byLevel`: count per severity.
- `timeline`: count per time bucket and severity.

### Metrics

```bash
curl http://localhost:3000/metrics
```

The endpoint uses the Prometheus text format and includes:

- process uptime;
- HTTP requests by method, route and status;
- accepted logs / enqueue failures;
- BullMQ job counts by state when Redis is available, including `completed` and `failed`.

### Retention

To purge old logs according to `RETENTION_DAYS`:

```bash
npm run retention
```

The script deletes in batches (`RETENTION_BATCH_SIZE`) to avoid wiping a large table in a single operation.

## Data model

Migrations live in `migrations/`.

Tables:

- `logs`: persisted events, with structured fields and JSONB columns.
- `ingest_jobs`: tracks the lifecycle of the asynchronous jobs.
- `ingest_dead_letters`: stores jobs that failed permanently in the Worker.
- `schema_migrations`: records the applied migrations.

Key indexes:

- `(service, ts desc, id desc)` for search by service.
- `(level, ts desc, id desc)` for search by severity.
- `(ts desc, id desc)` for recent listing and keyset pagination.
- GIN on `to_tsvector('simple', message)` for full-text search.
- GIN on `attrs` for future JSONB filtering.
- Partial index on `trace_id` for distributed correlation.
- Partial index on `span_id` for span-level correlation.
- Partial unique index on `ingest_jobs.dedupe_key` for idempotency.

## Tests and quality

```bash
npm test
npm run lint
npm run test:e2e
```

The HTTP tests use Vitest and Supertest. They validate contracts without opening a real server. The full integration test is gated behind `RUN_INTEGRATION=1`, since it depends on PostgreSQL and Redis.

The E2E smoke test (`npm run test:e2e`) expects the full stack running on `http://localhost:3000`, e.g. via `docker compose up --build`. In CI, GitHub Actions runs lint, brings up PostgreSQL and Redis, runs the migrations and executes the test suite.

## Project structure

```text
src/
  api/
    routes/
      health.js
      logs.js
      stats.js
    server.js
  lib/
    config.js
    db.js
    logger.js
    queue.js
    redis.js
  shared/
    schemas.js
  worker/
    worker.js
migrations/
docs/
  openapi.yaml
scripts/
  e2e-smoke.js
  migrate.js
  retention.js
test/
```

## How to explain it in an interview

A good summary:

> "I built a log pipeline with a REST API, a queue and a Worker. The API validates the payload with Zod, records a job in PostgreSQL and publishes it to BullMQ. The Worker consumes from the queue with retry/backoff, persists the log and updates the status. The API has ingestion deduplication via dedupeKey, dead-letter tracking, Prometheus metrics, time-based retention and search with parameterized SQL filters, simple full-text search and keyset pagination. It also includes migrations, Docker Compose, CI, tests and an OpenAPI contract."

## License

MIT
