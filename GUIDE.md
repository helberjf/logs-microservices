# Guia do Projeto

Este guia complementa o README com uma visao pratica de operacao e manutencao.

## Componentes

- `src/api/server.js`: cria a API REST com Express, registra middlewares, rotas e shutdown gracioso.
- `src/api/routes/logs.js`: ingestao, status de job, busca e detalhe de log.
- `src/api/routes/stats.js`: agregacoes por level e timeline.
- `src/api/routes/health.js`: liveness e readiness.
- `src/lib/metrics.js`: contadores em memoria e renderizacao Prometheus.
- `src/worker/worker.js`: consumidor BullMQ que grava logs no PostgreSQL.
- `src/shared/schemas.js`: contratos Zod usados pela API e pelo Worker.
- `src/lib/*`: configuracao, logger, conexoes de banco, Redis e fila.
- `migrations/*`: schema e indices.
- `scripts/migrate.js`: runner simples de migrations SQL.
- `scripts/retention.js`: limpeza em lote de logs antigos.
- `scripts/e2e-smoke.js`: smoke test contra o stack completo.

## Fluxo de ingestao

1. Cliente envia `POST /v1/logs`.
2. API valida o payload com Zod.
3. API grava o job em `ingest_jobs` com status `queued`.
   - Se `dedupeKey` ja existir, retorna o job existente e nao enfileira de novo.
4. API publica a mensagem no BullMQ.
5. Worker consome o job e muda status para `processing`.
6. Worker insere o registro em `logs`.
7. Worker muda status para `processed`.
8. Em erro definitivo, Worker marca `failed` e salva a mensagem de erro.

## Fluxo de busca

`GET /v1/logs` monta uma query SQL parametrizada a partir dos filtros recebidos. A ordenacao usa `ts desc, id desc`, o que permite paginacao keyset sem custo crescente de `OFFSET`.

Filtros suportados incluem `service`, `env`, `level`, `traceId`, `spanId`, `q`,
`from`, `to`, `attrKey` e `attrValue`.

Quando a resposta traz `nextCursor`, envie `cursorTs` e `cursorId` juntos na proxima chamada.

## Metricas e operacao

`GET /metrics` exporta formato Prometheus com uptime, requests HTTP, contadores
de ingestao e contagem de jobs BullMQ quando Redis esta disponivel.

Jobs que falham definitivamente no Worker sao gravados em `ingest_dead_letters`.

Para limpeza por retencao:

```bash
npm run retention
```

Configure `RETENTION_DAYS` e `RETENTION_BATCH_SIZE`.

## Operacao local

Ambiente minimo:

```bash
npm install
docker compose up -d postgres redis
npm run migrate
npm run dev:api
npm run dev:worker
```

Stack completo:

```bash
docker compose up --build
```

## Comandos uteis

```bash
npm test
npm run lint
npm run migrate
npm run retention
npm run test:e2e
```

## Cuidados

- `QUEUE_NAME` nao deve conter `:` porque BullMQ reserva esse caractere internamente.
- Deixe `API_KEY` vazio em desenvolvimento se nao quiser exigir `x-api-key`.
- Rode migrations antes de iniciar API/Worker fora do Compose completo.
- `COUNT(*)::bigint` volta como string no driver `pg`; isso evita perda de precisao em contagens grandes.
- `dedupeKey` e opcional; use quando o cliente puder reenviar o mesmo evento.
- `npm run test:e2e` espera API e Worker reais rodando.
