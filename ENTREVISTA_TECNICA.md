# Entrevista Tecnica - Logs Microservice

Este documento explica o projeto como eu apresentaria para um entrevistador tecnico senior.

## Resumo executivo

O projeto e um microservico de logs para ambientes com multiplas aplicacoes. Ele recebe logs por HTTP, valida o contrato de entrada, desacopla a ingestao via fila, persiste os dados em PostgreSQL e oferece APIs de busca e estatisticas.

A arquitetura principal e:

```text
Cliente -> API REST Express -> BullMQ/Redis -> Worker -> PostgreSQL
```

Eu optei por separar API e Worker para evitar que o tempo de escrita no banco e eventuais picos de carga afetem diretamente a latencia do cliente. A API responde `202 Accepted` quando o log foi aceito para processamento, e o status pode ser acompanhado por `GET /v1/logs/ingest/:jobId`.

## Problema resolvido

Em sistemas distribuidos, logs ficam espalhados em varios servicos. Este projeto centraliza a coleta e entrega tres capacidades principais:

- Ingestao estruturada de logs.
- Busca por filtros e texto.
- Agregacoes para analise operacional.

O desenho favorece simplicidade operacional sem abrir mao de pontos importantes de producao: validacao de contrato, fila, migrations, health checks, CI, Docker e indices no banco.

## Componentes principais

### API REST com Express

Arquivo: `src/api/server.js`

A API registra:

- `helmet` para headers de seguranca.
- `cors` para permitir clientes externos.
- `express-rate-limit` para reduzir abuso.
- middleware opcional de API key via header `x-api-key`.
- rotas de health, logs e stats.
- shutdown gracioso para fechar HTTP, fila, pool PostgreSQL e Redis.

Express foi escolhido por ser simples, amplamente conhecido e facil de defender em entrevista como uma API REST tradicional. A complexidade principal do projeto fica no fluxo de ingestao assíncrona, nao no framework HTTP.

### Validacao com Zod

Arquivo: `src/shared/schemas.js`

Os schemas Zod definem o contrato de entrada de ponta a ponta. A API valida payloads HTTP e o Worker valida novamente o payload recebido da fila. Essa dupla validacao e intencional: a fila e uma fronteira assíncrona e deve ser tratada como entrada externa.

Campos relevantes do log:

- `ts`: timestamp ISO com offset.
- `service`: nome do servico emissor.
- `env`: ambiente, com default logico `prod`.
- `level`: `trace`, `debug`, `info`, `warn`, `error` ou `fatal`.
- `message`: mensagem textual.
- `traceId` e `spanId`: correlacao distribuida.
- `attrs`, `context` e `raw`: dados JSONB para flexibilidade.

Tambem foi adicionada validacao para cursor keyset: `cursorTs` e `cursorId` precisam ser enviados juntos.

### Fila BullMQ + Redis

Arquivo: `src/lib/queue.js`

A fila foi configurada com:

- ate 5 tentativas por job.
- backoff exponencial.
- retencao limitada de jobs completos e falhos.
- criacao lazy da fila para evitar conexoes Redis em testes que nao fazem ingestao real.

Um detalhe importante: `QUEUE_NAME` nao pode conter `:` no BullMQ. O projeto agora usa `logs-ingest`.

### Worker

Arquivo: `src/worker/worker.js`

O Worker consome jobs da fila, valida o payload, insere o log no PostgreSQL e atualiza `ingest_jobs`.

Ciclo de status:

- `queued`: API registrou e enfileirou.
- `processing`: Worker iniciou o processamento.
- `processed`: log persistido com sucesso.
- `failed`: erro definitivo apos tentativas ou payload invalido.

O Worker tambem trata `SIGINT` e `SIGTERM`, o que e importante em Docker/Kubernetes porque o encerramento normal costuma vir por `SIGTERM`.

## Modelo de dados

Arquivos: `migrations/001_init.sql` e `migrations/002_indexes.sql`

Tabelas:

- `logs`: armazena eventos.
- `ingest_jobs`: rastreia o processamento assíncrono.
- `schema_migrations`: registra migrations aplicadas.

Indices:

- `idx_logs_service_ts_desc`: otimiza buscas por servico ordenadas por tempo.
- `idx_logs_level_ts_desc`: otimiza filtros por severidade.
- `idx_logs_ts_desc`: otimiza listagem recente e paginacao keyset.
- `idx_logs_message_fts`: habilita full-text search na mensagem.
- `idx_logs_attrs_gin`: prepara consultas futuras em JSONB.
- `idx_logs_trace_id`: acelera correlacao por trace.

## Busca e paginacao

Arquivo: `src/api/routes/logs.js`

A busca usa SQL parametrizado, evitando interpolacao de valores do usuario. Os filtros sao adicionados dinamicamente, mas os valores sempre entram por placeholders `$1`, `$2`, etc.

A ordenacao e:

```sql
ORDER BY ts DESC, id DESC
```

A paginacao usa keyset:

```sql
(ts, id) < ($cursorTs::timestamptz, $cursorId::bigint)
```

Isso e melhor que `OFFSET` para datasets grandes, porque o banco nao precisa pular N linhas a cada pagina.

## Estatisticas

Arquivo: `src/api/routes/stats.js`

O endpoint `GET /v1/stats` retorna:

- contagem por `level`.
- timeline por bucket de tempo e `level`.

Foi corrigido um bug sutil: a query de timeline removia o ultimo filtro da clausula `WHERE`. Em cenarios com `service` e `env`, isso poderia misturar dados de ambientes ou servicos diferentes. A query agora aplica todos os filtros tanto em `byLevel` quanto em `timeline`.

## DevOps e execucao

### Docker

O `docker-compose.yml` agora sobe:

- PostgreSQL com healthcheck.
- Redis com healthcheck.
- `migrate` como servico one-shot.
- API, dependente de Postgres, Redis e migration concluida.
- Worker, com as mesmas dependencias.

Isso permite rodar o stack completo com:

```bash
docker compose up --build
```

### Dockerfile

O Dockerfile passou a usar:

```dockerfile
COPY package*.json ./
RUN npm ci --omit=dev
```

`npm ci` deixa a instalacao mais reprodutivel em CI e em build de imagem, porque respeita exatamente o `package-lock.json`.

### CI

O GitHub Actions tambem usa `npm ci`, roda migrations, depois executa a suite de testes com Postgres e Redis de servico.

## Testes

Ferramenta: Vitest.

Cobertura atual:

- liveness da API.
- validacao de payload invalido na ingestao.
- validacao de `limit` na busca.
- rejeicao de cursor incompleto.
- garantia de que stats aplica `service` e `env` tambem na timeline.

Os testes unitarios usam Vitest com Supertest para validar o contrato HTTP sem abrir um servidor real. Eles tambem evitam conexao Redis desnecessaria porque a fila e criada sob demanda. O teste de ingestao real fica protegido por `RUN_INTEGRATION=1`, pois depende de Redis/PostgreSQL.

## Melhorias realizadas

- Corrigi `QUEUE_NAME` invalido para BullMQ.
- Ajustei `.env.example` para nao ativar API key por acidente.
- Troquei `uuid` externo por `crypto.randomUUID()` nativo do Node.
- Padronizei a camada HTTP em Express REST sem alterar o contrato publico.
- Tornei a fila lazy para nao abrir Redis em testes sem ingestao real.
- Corrigi bug de filtros no endpoint de stats.
- Adicionei validacao para cursor keyset incompleto.
- Melhorei readiness para retornar HTTP 503 quando dependencias falham.
- Adicionei shutdown gracioso na API e no Worker.
- Atualizei Docker Compose para rodar migrations antes de API/Worker.
- Atualizei Dockerfile e CI para `npm ci`.
- Reescrevi README e GUIDE para refletirem o projeto real.
- Adicionei testes para os bugs corrigidos.

## Trade-offs

### PostgreSQL em vez de Elasticsearch

Para um projeto pequeno ou medio, PostgreSQL com FTS e JSONB entrega bom custo-beneficio e menos complexidade operacional. Elasticsearch seria considerado se a escala de busca textual, retencao ou analytics exigisse um motor especializado.

### Resposta 202 na ingestao

A API nao garante que o log ja foi persistido quando responde. Ela garante que o log foi validado e aceito para processamento. Esse trade-off melhora resiliencia e latencia, mas exige status de job para rastreabilidade.

### Contagens como bigint

O PostgreSQL retorna `COUNT(*)::bigint`. O driver `pg` representa bigint como string para evitar perda de precisao em JavaScript. Eu manteria isso em APIs de observabilidade, onde contagens podem crescer bastante.

### Runner de migrations simples

O runner atual e suficiente para o escopo do projeto. Em producao maior, eu avaliaria ferramentas com rollback, locks distribuidos, dry-run e melhor observabilidade.

## O que eu faria depois

- Filtros por `traceId`, `spanId` e campos especificos de `attrs`.
- Retencao/particionamento por tempo em PostgreSQL.
- Endpoint de metricas Prometheus.
- Autenticacao mais completa, com scopes por servico.
- Dead-letter queue explicita para jobs falhos.
- Observabilidade do Worker: throughput, latencia de processamento e numero de retries.
- Testes end-to-end com Compose ou Testcontainers.
- OpenAPI/Swagger para documentar contratos HTTP.

## Pitch para entrevista

"Eu construiria esse projeto como um pipeline de logs simples, mas com preocupacoes reais de producao. A API REST com Express cuida de validacao, autenticacao opcional e resposta rapida. A fila BullMQ desacopla o caminho critico, permitindo retry e backoff. O Worker e responsavel pela persistencia e pelo ciclo de status do job. No banco, usei PostgreSQL com JSONB, FTS e indices alinhados aos filtros principais. Para busca, preferi keyset pagination em vez de OFFSET para manter performance em volume. Tambem cuidei de health checks, migrations, Docker, CI e shutdown gracioso. O resultado e pequeno o suficiente para ser entendido rapido, mas ja tem varias decisoes que eu esperaria em um servico real."
