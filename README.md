# Logs Microservice (Ingest · Search · Stats)

Lightweight microservice for collecting, storing and querying application logs.

Features
- Ingest logs via HTTP API
- Asynchronous processing with BullMQ (Redis)
- Persistent storage in PostgreSQL with full-text search (FTS)
- Search API with filters and text queries
- Stats endpoints for aggregated counts and timelines
- Docker Compose for local development
- Tests and CI workflow

Architecture

```
Client -> API (Fastify) -> BullMQ (Redis) -> Worker -> PostgreSQL
```

Quickstart (local)

1. Install dependencies and copy example env:

```bash
npm install
cp .env.example .env
```

2. Start DB and Redis, run migrations:

```bash
docker compose up -d postgres redis
npm run migrate
```

3. Run services for development:

```bash
npm run dev:api    # API on http://localhost:3000
npm run dev:worker # background worker
```

API Examples

- Ingest a log entry:

```bash
curl -X POST http://localhost:3000/v1/logs \
  -H "Content-Type: application/json" \
  -d '{
    "ts": "2026-03-02T10:00:00.000Z",
    "service": "billing-api",
    "env": "prod",
    "level": "info",
    "message": "payment approved",
    "attrs": {"orderId":"A1","userId":"U9"}
  }'
```

- Search logs (query + filters):

```bash
curl "http://localhost:3000/v1/logs?service=billing-api&level=info&q=payment&limit=50"
```

- Stats endpoint (bucketed counts):

```bash
curl "http://localhost:3000/v1/stats?bucketMinutes=60"
```

Environment

- Copy and edit `.env.example` to `.env` for local settings.
- Key variables: `POSTGRES_URL`, `REDIS_URL`, `PORT` and BullMQ settings.

Testing

```bash
npm test
```

Contributing

- Open issues and PRs at https://github.com/helberjf/logs-microservices
- Run linters and tests before submitting changes.

License

MIT

Português (pt-BR)

Microserviço leve para coletar, armazenar e consultar logs de aplicações.

Recursos
- Recebe logs via API HTTP
- Processamento assíncrono com BullMQ (Redis)
- Armazenamento em PostgreSQL com busca full-text (FTS)
- API de busca com filtros e consultas de texto
- Endpoints de estatísticas (contagens e agregações por intervalo)
- `docker compose` para desenvolvimento local
- Testes e CI

Guia rápido (resumo)

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run migrate
npm run dev:api
npm run dev:worker
```

Mais detalhes e exemplos de rota estão em `src/api/routes/`.

---
