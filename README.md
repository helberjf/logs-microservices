# Logs Microservice

Microservico para ingestao, processamento assincrono, armazenamento, busca e
agregacao de logs estruturados.

O projeto simula uma plataforma pequena de observabilidade: varias aplicacoes
enviam logs por HTTP, a API valida e enfileira os eventos, um Worker persiste os
dados em PostgreSQL e a API oferece endpoints para busca, detalhe, status de
ingestao e estatisticas.

## Visao Geral

```text
Client
  |
  v
Express REST API
  |
  | cria ingest_jobs + publica job
  v
BullMQ / Redis
  |
  | Worker consome com retry/backoff
  v
PostgreSQL
```

Por que essa arquitetura?

- A API responde rapido com `202 Accepted` depois de validar e enfileirar.
- A escrita no banco fica desacoplada da latencia do cliente.
- Redis/BullMQ entrega fila, retry, backoff e concorrencia do Worker.
- PostgreSQL guarda logs estruturados, JSONB, busca textual simples e agregacoes.
- Health checks, migrations, Docker e CI deixam o projeto mais proximo de um
  servico real.

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

## Recursos

- API REST com validacao de contratos.
- Ingestao individual ou em lote, com limite de 500 logs por request.
- Idempotencia opcional com `dedupeKey`.
- Processamento assincrono via fila.
- Status de ingestao: `queued`, `processing`, `processed`, `failed`.
- Busca por `service`, `env`, `level`, `traceId`, `spanId`, atributos JSON,
  texto, intervalo de tempo e cursor.
- Paginacao keyset com `cursorTs` e `cursorId`.
- Estatisticas por level e timeline por bucket de tempo.
- Health checks de liveness e readiness.
- Metricas Prometheus em `GET /metrics`.
- Dead-letter tracking em PostgreSQL para falhas definitivas do Worker.
- Script de retencao por tempo com `npm run retention`.
- Smoke test E2E para o stack Docker com `npm run test:e2e`.
- OpenAPI/Swagger em `docs/openapi.yaml`.
- Documentacao tecnica para entrevista em `ENTREVISTA_TECNICA.md`.

## Documentacao da API

A especificacao OpenAPI esta em:

```text
docs/openapi.yaml
```

Voce pode abrir esse arquivo no Swagger Editor, Insomnia, Postman ou qualquer
ferramenta compativel com OpenAPI 3.0.

Endpoints documentados:

- `GET /health/liveness`
- `GET /health/readiness`
- `GET /metrics`
- `POST /v1/logs`
- `GET /v1/logs`
- `GET /v1/logs/ingest/{jobId}`
- `GET /v1/logs/{id}`
- `GET /v1/stats`

## Configuracao

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Variaveis:

| Variavel | Exemplo | Descricao |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP da API |
| `NODE_ENV` | `development` | Ambiente da aplicacao |
| `API_KEY` | vazio | Opcional; quando preenchida exige header `x-api-key` |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/logs?sslmode=disable` | Conexao PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379` | Conexao Redis |
| `QUEUE_NAME` | `logs-ingest` | Nome da fila BullMQ; evite `:` no nome |
| `RETENTION_DAYS` | `30` | Janela de retencao usada por `npm run retention` |
| `RETENTION_BATCH_SIZE` | `1000` | Tamanho de lote para limpeza de logs antigos |

## Rodando com Docker Compose

Para subir Postgres, Redis, migrations, API e Worker:

```bash
docker compose up --build
```

O Compose executa o servico `migrate` antes de iniciar API e Worker.

Teste a API:

```bash
curl http://localhost:3000/health/liveness
curl http://localhost:3000/health/readiness
```

## Rodando em Desenvolvimento

Instale as dependencias:

```bash
npm install
```

Suba Postgres e Redis:

```bash
docker compose up -d postgres redis
```

Rode as migrations:

```bash
npm run migrate
```

Inicie API e Worker em terminais separados:

```bash
npm run dev:api
npm run dev:worker
```

## Exemplos de Uso

### Ingerir Um Log

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

Resposta:

```json
{
  "accepted": 1,
  "jobIds": ["4df7e9c5-d52f-41f8-bdd2-61c9163f8d55"]
}
```

Se o mesmo `dedupeKey` for enviado novamente, a API retorna o `jobId`
existente e nao publica um segundo job na fila:

```json
{
  "accepted": 1,
  "jobIds": ["4df7e9c5-d52f-41f8-bdd2-61c9163f8d55"],
  "duplicates": 1
}
```

### Consultar Status do Job

```bash
curl http://localhost:3000/v1/logs/ingest/4df7e9c5-d52f-41f8-bdd2-61c9163f8d55
```

Resposta esperada depois do Worker processar:

```json
{
  "job_id": "4df7e9c5-d52f-41f8-bdd2-61c9163f8d55",
  "received_at": "2026-03-02T10:00:00.000Z",
  "processed_at": "2026-03-02T10:00:01.000Z",
  "status": "processed",
  "error": null
}
```

### Buscar Logs

```bash
curl "http://localhost:3000/v1/logs?service=billing-api&level=info&q=payment&limit=50"
```

Filtros adicionais de observabilidade:

```bash
curl "http://localhost:3000/v1/logs?traceId=trace-123&spanId=span-456"
curl "http://localhost:3000/v1/logs?attrKey=orderId&attrValue=A1"
curl "http://localhost:3000/v1/logs?attrKey=orderId"
```

A resposta inclui `nextCursor` quando existe uma proxima pagina. Para continuar,
envie `cursorTs` e `cursorId` juntos:

```bash
curl "http://localhost:3000/v1/logs?service=billing-api&limit=50&cursorTs=2026-03-02T10:00:00.000Z&cursorId=123"
```

### Estatisticas

```bash
curl "http://localhost:3000/v1/stats?bucketMinutes=60&service=billing-api&env=prod"
```

Retorna:

- `byLevel`: contagem por severidade.
- `timeline`: contagem por bucket de tempo e severidade.

### Metricas

```bash
curl http://localhost:3000/metrics
```

O endpoint usa formato de texto Prometheus e inclui:

- uptime do processo;
- requests HTTP por metodo, rota e status;
- logs aceitos/falhas de enqueue;
- contagem de jobs BullMQ por estado quando Redis esta disponivel, incluindo
  `completed` e `failed`.

### Retencao

Para limpar logs antigos de acordo com `RETENTION_DAYS`:

```bash
npm run retention
```

O script remove em lotes (`RETENTION_BATCH_SIZE`) para evitar deletar uma tabela
grande em uma unica operacao.

## Modelo de Dados

As migrations ficam em `migrations/`.

Tabelas:

- `logs`: eventos persistidos, com campos estruturados e colunas JSONB.
- `ingest_jobs`: rastreia o ciclo de vida dos jobs assincronos.
- `ingest_dead_letters`: guarda jobs que falharam definitivamente no Worker.
- `schema_migrations`: registra migrations aplicadas.

Indices principais:

- `(service, ts desc, id desc)` para busca por servico.
- `(level, ts desc, id desc)` para busca por severidade.
- `(ts desc, id desc)` para listagem recente e paginacao keyset.
- GIN em `to_tsvector('simple', message)` para busca textual.
- GIN em `attrs` para evolucao futura de filtros por JSONB.
- Indice parcial em `trace_id` para correlacao distribuida.
- Indice parcial em `span_id` para correlacao por span.
- Indice unico parcial em `ingest_jobs.dedupe_key` para idempotencia.

## Testes e Qualidade

```bash
npm test
npm run lint
npm run test:e2e
```

Os testes HTTP usam Vitest e Supertest. Eles validam contratos sem abrir um
servidor real. O teste de integracao completa fica protegido por
`RUN_INTEGRATION=1`, pois depende de PostgreSQL e Redis.

O smoke E2E (`npm run test:e2e`) espera o stack completo rodando em
`http://localhost:3000`, por exemplo via `docker compose up --build`. No CI, o
GitHub Actions roda lint, sobe PostgreSQL e Redis, roda as migrations e executa
a suite de testes.

## Estrutura

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

## Como Explicar em Entrevista

Um bom resumo:

> "Eu construi um pipeline de logs com API REST, fila e Worker. A API valida o
> payload com Zod, registra um job no PostgreSQL e publica no BullMQ. O Worker
> consome da fila com retry/backoff, persiste o log e atualiza o status. A API
> tem idempotencia por dedupeKey, dead-letter tracking, metricas Prometheus,
> retencao por tempo e busca com filtros SQL parametrizados, full-text search
> simples e paginacao keyset. Tambem inclui migrations, Docker Compose, CI,
> testes e contrato OpenAPI."

Para uma explicacao detalhada, leia:

- `ENTREVISTA_TECNICA.md`
