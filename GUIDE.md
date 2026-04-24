# Guia do Projeto

Este guia complementa o README com uma visao pratica de operacao e manutencao.

## Componentes

- `src/api/server.js`: cria a API REST com Express, registra middlewares, rotas e shutdown gracioso.
- `src/api/routes/logs.js`: ingestao, status de job, busca e detalhe de log.
- `src/api/routes/stats.js`: agregacoes por level e timeline.
- `src/api/routes/health.js`: liveness e readiness.
- `src/worker/worker.js`: consumidor BullMQ que grava logs no PostgreSQL.
- `src/shared/schemas.js`: contratos Zod usados pela API e pelo Worker.
- `src/lib/*`: configuracao, logger, conexoes de banco, Redis e fila.
- `migrations/*`: schema e indices.
- `scripts/migrate.js`: runner simples de migrations SQL.

## Fluxo de ingestao

1. Cliente envia `POST /v1/logs`.
2. API valida o payload com Zod.
3. API grava o job em `ingest_jobs` com status `queued`.
4. API publica a mensagem no BullMQ.
5. Worker consome o job e muda status para `processing`.
6. Worker insere o registro em `logs`.
7. Worker muda status para `processed`.
8. Em erro definitivo, Worker marca `failed` e salva a mensagem de erro.

## Fluxo de busca

`GET /v1/logs` monta uma query SQL parametrizada a partir dos filtros recebidos. A ordenacao usa `ts desc, id desc`, o que permite paginacao keyset sem custo crescente de `OFFSET`.

Quando a resposta traz `nextCursor`, envie `cursorTs` e `cursorId` juntos na proxima chamada.

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
```

## Cuidados

- `QUEUE_NAME` nao deve conter `:` porque BullMQ reserva esse caractere internamente.
- Deixe `API_KEY` vazio em desenvolvimento se nao quiser exigir `x-api-key`.
- Rode migrations antes de iniciar API/Worker fora do Compose completo.
- `COUNT(*)::bigint` volta como string no driver `pg`; isso evita perda de precisao em contagens grandes.
