# Logs Microservice

Microservico para ingestao, processamento assincrono, armazenamento, busca e agregacao de logs estruturados de aplicacoes.

## Arquitetura

```text
Client -> Express REST API -> BullMQ/Redis -> Worker -> PostgreSQL
```

O projeto separa a escrita em duas etapas:

- A API valida o payload, registra um job em `ingest_jobs` e publica uma mensagem na fila.
- O Worker consome a fila, persiste o log em `logs` e atualiza o status do job.

Essa decisao evita que a latencia de escrita no banco seja acoplada ao tempo de resposta do endpoint de ingestao.

## Recursos

- API REST com Express.
- Validacao de entrada com Zod.
- Fila de ingestao com BullMQ e Redis.
- Persistencia em PostgreSQL.
- Busca por filtros, intervalo de tempo, level, texto e paginacao keyset.
- Estatisticas por level e timeline por bucket de tempo.
- Health checks de liveness e readiness.
- Docker Compose com Postgres, Redis, migracao, API e Worker.
- Testes automatizados com Vitest e CI no GitHub Actions.

## Requisitos

- Node.js 20+
- npm
- Docker e Docker Compose para ambiente local completo

## Configuracao

Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

Variaveis principais:

- `PORT`: porta da API.
- `API_KEY`: opcional. Quando preenchida, exige header `x-api-key`.
- `DATABASE_URL`: conexao PostgreSQL.
- `REDIS_URL`: conexao Redis.
- `QUEUE_NAME`: nome da fila BullMQ. Use nomes sem `:`, por exemplo `logs-ingest`.

## Rodando localmente

Instale dependencias:

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

Tambem e possivel subir o stack completo com Compose:

```bash
docker compose up --build
```

Nesse modo, o servico `migrate` roda antes da API e do Worker.

## Endpoints

### Liveness

```bash
curl http://localhost:3000/health/liveness
```

### Readiness

```bash
curl http://localhost:3000/health/readiness
```

Retorna HTTP 503 quando PostgreSQL ou Redis nao estao prontos.

### Ingestao de log

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
    "attrs": {"orderId":"A1","userId":"U9"}
  }'
```

Resposta:

```json
{
  "accepted": 1,
  "jobIds": ["..."]
}
```

### Status do job de ingestao

```bash
curl http://localhost:3000/v1/logs/ingest/JOB_ID
```

Status esperados: `queued`, `processing`, `processed` e `failed`.

### Busca de logs

```bash
curl "http://localhost:3000/v1/logs?service=billing-api&level=info&q=payment&limit=50"
```

Filtros suportados:

- `service`
- `env`
- `level`
- `q`
- `from`
- `to`
- `limit`
- `cursorTs` e `cursorId` para proxima pagina

### Estatisticas

```bash
curl "http://localhost:3000/v1/stats?bucketMinutes=60&service=billing-api&env=prod"
```

Retorna:

- `byLevel`: contagem por level.
- `timeline`: contagem por bucket de tempo e level.

## Banco de dados

As migrations ficam em `migrations/`.

Tabelas principais:

- `logs`: entradas persistidas com campos estruturados e JSONB.
- `ingest_jobs`: rastreia o ciclo de vida dos jobs de ingestao.
- `schema_migrations`: controle simples de migrations aplicadas.

Indices principais:

- `(service, ts desc, id desc)` para buscas por servico.
- `(level, ts desc, id desc)` para buscas por severidade.
- `(ts desc, id desc)` para listagem recente e keyset pagination.
- GIN em `to_tsvector('simple', message)` para full-text search.
- GIN em `attrs` para evolucao futura de filtros em JSONB.

## Testes e qualidade

```bash
npm test
npm run lint
```

Os testes unitarios nao dependem de Redis/PostgreSQL quando estao validando apenas contrato HTTP. O teste de ingestao real fica protegido por `RUN_INTEGRATION=1`.

## Documento tecnico

Para uma explicacao em formato de entrevista tecnica, leia:

- `ENTREVISTA_TECNICA.md`
