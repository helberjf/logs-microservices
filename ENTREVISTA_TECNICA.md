# Entrevista Tecnica - Logs Microservice

Este documento e um roteiro para explicar o projeto em uma entrevista tecnica.
Ele cobre o problema, a arquitetura, o fluxo de dados, as decisoes de design,
os trade-offs e perguntas que um entrevistador pode fazer.

## 1. Resumo Curto

O projeto e um microservico de logs estruturados. Ele recebe logs por uma API
REST, valida o payload, registra um job de ingestao, publica esse job em uma
fila Redis/BullMQ e usa um Worker para persistir os dados em PostgreSQL.

A API tambem oferece busca, detalhe por ID, status do job de ingestao,
estatisticas por severidade, metricas Prometheus e health checks. O repositorio
inclui Docker Compose, migrations, testes automatizados, CI e contrato OpenAPI.

Arquitetura:

```text
Client -> Express REST API -> BullMQ/Redis -> Worker -> PostgreSQL
```

## 2. Pitch de 30 Segundos

"Eu construi um pipeline de logs com API REST, fila e Worker. A API valida os
logs com Zod, registra cada ingestao em uma tabela de jobs e publica no BullMQ.
O Worker consome da fila com concorrencia, retry e backoff, grava no PostgreSQL
e atualiza o status do job. Para consulta, a API tem filtros por servico, trace,
span, atributos JSON, full-text search simples, paginacao keyset e estatisticas
por bucket de tempo. Tambem inclui idempotencia por `dedupeKey`, dead-letter
tracking, retencao por tempo, metricas, Docker, CI, testes e documentacao
OpenAPI."

## 3. Problema Resolvido

Em sistemas distribuidos, cada servico gera seus proprios logs. Sem um ponto
central, investigar problemas exige acessar varios lugares diferentes. Este
projeto centraliza os logs e entrega tres capacidades:

- Ingestao estruturada.
- Processamento assincrono e rastreavel.
- Busca e agregacao para analise operacional.

Exemplo de uso: uma aplicacao `billing-api` envia um log de pagamento aprovado.
A API aceita o evento, devolve um `jobId`, o Worker grava o log no banco e o
time pode buscar depois por `service`, `level`, mensagem ou intervalo de tempo.

## 4. Principais Requisitos Atendidos

- Receber logs via HTTP.
- Validar contrato de entrada.
- Aceitar log unico ou lote.
- Evitar que a escrita no banco bloqueie a resposta do cliente.
- Persistir logs estruturados em banco relacional.
- Consultar logs por filtros.
- Paginar sem `OFFSET`.
- Agregar contagens por severidade e tempo.
- Expor health checks para operacao.
- Expor metricas Prometheus.
- Evitar duplicidade com `dedupeKey`.
- Registrar falhas definitivas em dead-letter table.
- Limpar logs antigos por politica de retencao.
- Rodar localmente com Docker Compose.
- Rodar testes em CI.
- Documentar contrato via OpenAPI.

## 5. Arquitetura em Detalhes

### 5.1 API REST

Arquivo principal: `src/api/server.js`

A API usa Express e registra:

- `helmet` para headers basicos de seguranca.
- `cors` para permitir chamadas de clientes externos.
- `express-rate-limit` para limitar abuso simples.
- `express.json({ limit: "1mb" })` para controlar tamanho do body.
- API key opcional via header `x-api-key`.
- Rotas de health, logs e stats.
- Handler central de erro.
- Shutdown gracioso.

O ponto importante para entrevista: Express aqui nao e o foco da arquitetura.
Ele e uma escolha simples e conhecida para expor HTTP. A decisao mais importante
e separar a API do processamento pesado usando fila e Worker.

### 5.2 Validacao com Zod

Arquivo: `src/shared/schemas.js`

O projeto usa Zod para validar:

- Payload de ingestao.
- Query string de busca.
- Query string de estatisticas.
- Payload consumido pelo Worker.

Por que validar tambem no Worker?

A fila e uma fronteira assincrona. Mesmo que hoje a unica produtora seja a API,
em um sistema real outras fontes poderiam publicar jobs. O Worker nao deve
confiar cegamente no conteudo da fila.

Campos principais do log:

- `ts`: timestamp ISO com timezone.
- `service`: servico emissor.
- `env`: ambiente, com default logico `prod`.
- `level`: `trace`, `debug`, `info`, `warn`, `error` ou `fatal`.
- `message`: texto pesquisavel.
- `traceId` e `spanId`: correlacao distribuida.
- `dedupeKey`: chave opcional de idempotencia.
- `attrs`, `context` e `raw`: dados flexiveis em JSON.

### 5.3 Fila com BullMQ e Redis

Arquivo: `src/lib/queue.js`

BullMQ fornece:

- Publicacao de jobs.
- Retry automatico.
- Backoff exponencial.
- Concorrencia no Worker.
- Retencao limitada de jobs completos e falhos.

Configuracao atual:

- `attempts: 5`
- `backoff: exponential, delay 500ms`
- `removeOnComplete: count 1000`
- `removeOnFail: count 2000`

Por que Redis/BullMQ?

Para este escopo, BullMQ e simples de configurar, tem boa ergonomia em Node.js e
resolve bem o caso de filas de background. Em uma escala maior, poderia ser
substituido por Kafka, RabbitMQ, SQS ou outro broker, dependendo de requisitos
de throughput, ordenacao, retencao e operacao.

### 5.4 Worker

Arquivo: `src/worker/worker.js`

O Worker consome jobs da fila e executa o fluxo:

1. Atualiza o job para `processing`.
2. Valida o payload com Zod.
3. Insere o log em `logs`.
4. Atualiza o job para `processed`.
5. Em erro definitivo, marca `failed` e salva a mensagem de erro.

O Worker usa concorrencia 10. Isso significa que ate 10 jobs podem ser
processados em paralelo dentro do mesmo processo.

O Worker tambem trata `SIGINT` e `SIGTERM`. Isso e importante em Docker e
Kubernetes, porque o orquestrador envia sinal de encerramento antes de matar o
processo. O shutdown gracioso reduz risco de interromper jobs no meio.

### 5.5 PostgreSQL

Arquivos:

- `migrations/001_init.sql`
- `migrations/002_indexes.sql`

PostgreSQL foi escolhido por simplicidade operacional e flexibilidade:

- Dados estruturados em colunas.
- Campos flexiveis com JSONB.
- Indices B-tree para filtros comuns.
- Full-text search simples com GIN.
- Agregacoes SQL para estatisticas.

Para um projeto pequeno ou medio, PostgreSQL evita a complexidade de operar um
Elasticsearch/OpenSearch sem necessidade imediata.

## 6. Fluxo de Ingestao

Endpoint:

```text
POST /v1/logs
```

Fluxo detalhado:

1. Cliente envia um log ou um array de logs.
2. API valida o body com `ingestBodySchema`.
3. API normaliza alguns campos, como `env` e `raw`.
4. API gera um `jobId` com `crypto.randomUUID()`.
5. API insere uma linha em `ingest_jobs` com status `queued`.
   Se `dedupeKey` ja existir, ela reutiliza o job anterior.
6. API publica o payload na fila BullMQ usando o mesmo `jobId`.
7. API responde `202 Accepted`.
8. Worker consome o job.
9. Worker atualiza o status para `processing`.
10. Worker valida o payload.
11. Worker insere em `logs`.
12. Worker atualiza o status para `processed`.

Por que responder `202` e nao `201`?

Porque a API ainda nao criou o recurso final `logs`. Ela aceitou o trabalho para
processamento assincrono. O resultado final acontece depois, no Worker.

Por que gravar `ingest_jobs` antes de publicar na fila?

Isso permite rastrear a ingestao imediatamente. Se a publicacao na fila falhar,
a API marca o job como `failed`, preservando uma pista operacional.

Por que `dedupeKey`?

Clientes podem reenviar eventos por timeout, retry de rede ou falha de
confirmacao. Com `dedupeKey`, o banco garante uma unica ingestao logica via
indice unico parcial. A API retorna o `jobId` existente e evita publicar um job
duplicado.

## 7. Fluxo de Busca

Endpoint:

```text
GET /v1/logs
```

Filtros:

- `service`
- `env`
- `level`
- `traceId`
- `spanId`
- `attrKey`
- `attrValue`
- `q`
- `from`
- `to`
- `limit`
- `cursorTs`
- `cursorId`

A query e montada dinamicamente, mas todos os valores entram como parametros
SQL (`$1`, `$2`, etc.). Isso reduz risco de SQL injection.

Ordenacao:

```sql
ORDER BY ts DESC, id DESC
```

Paginacao:

```sql
(ts, id) < ($cursorTs::timestamptz, $cursorId::bigint)
```

Por que keyset pagination?

`OFFSET` fica mais caro conforme a pagina aumenta, porque o banco precisa pular
linhas. Com keyset, a API usa o ultimo item da pagina anterior como ponto de
continuidade. Isso e mais estavel para listas grandes e combina bem com indice
em `(ts desc, id desc)`.

Por que usar `id` junto com `ts`?

Varios logs podem ter o mesmo timestamp. O `id` funciona como desempate
deterministico e evita duplicar ou pular itens entre paginas.

Como funcionam filtros por atributos?

Quando so `attrKey` e enviado, a query usa o operador JSONB `?` para verificar
existencia da chave. Quando `attrKey` e `attrValue` sao enviados juntos, a query
usa `attrs @> $N::jsonb`, mantendo o valor parametrizado e evitando interpolar
JSON vindo do usuario.

## 8. Busca Textual

O filtro `q` usa:

```sql
to_tsvector('simple', message) @@ plainto_tsquery('simple', $N)
```

E existe um indice:

```sql
CREATE INDEX idx_logs_message_fts
ON logs USING GIN (to_tsvector('simple', message));
```

Por que `simple`?

O dicionario `simple` evita stemming especifico de idioma. E uma escolha neutra
para logs, que muitas vezes tem termos tecnicos, codigos, nomes de servico e
mensagens misturadas em ingles/portugues.

Limite da decisao:

PostgreSQL FTS e suficiente para esse escopo. Para ranking avancado, analise
linguistica sofisticada, alto volume de busca ou retencao massiva, eu avaliaria
OpenSearch/Elasticsearch.

## 9. Estatisticas

Endpoint:

```text
GET /v1/stats
```

Retorna:

- `range`: intervalo considerado.
- `byLevel`: contagem por severidade.
- `timeline`: contagem por bucket de tempo e severidade.

O bucket e calculado por:

```sql
to_timestamp(floor(extract(epoch from ts) / bucketSeconds) * bucketSeconds)
```

Isso agrupa eventos em janelas fixas. Com `bucketMinutes=60`, por exemplo, os
logs sao agregados por hora.

Observacao importante:

`COUNT(*)::bigint` chega no Node.js como string pelo driver `pg`, para evitar
perda de precisao em numeros grandes. Por isso o OpenAPI documenta `count` como
string.

## 10. Modelo de Dados

### 10.1 Tabela `logs`

Responsavel por armazenar o evento final.

Campos principais:

- `id`: identificador sequencial.
- `ts`: timestamp do evento original.
- `service`: servico emissor.
- `env`: ambiente.
- `level`: severidade.
- `message`: mensagem principal.
- `trace_id`: correlacao distribuida.
- `span_id`: correlacao distribuida em nivel de span.
- `attrs`: JSONB para atributos.
- `context`: JSONB para contexto extra.
- `raw`: JSONB com payload original ou equivalente.
- `inserted_at`: momento em que o banco gravou o evento.

### 10.2 Tabela `ingest_jobs`

Responsavel por rastrear o processamento assincrono.

Campos:

- `job_id`
- `received_at`
- `processed_at`
- `status`
- `error`
- `dedupe_key`: chave opcional para evitar ingestao duplicada.

Estados:

- `queued`: API aceitou e enfileirou.
- `processing`: Worker iniciou.
- `processed`: log persistido.
- `failed`: processamento falhou definitivamente.

### 10.3 Tabela `schema_migrations`

Controla migrations ja aplicadas. O script `scripts/migrate.js` le arquivos
`.sql` em ordem e registra cada migration aplicada.

### 10.4 Tabela `ingest_dead_letters`

Guarda falhas definitivas do Worker:

- `job_id`
- `queue_name`
- `job_name`
- `payload`
- `error`
- `attempts`
- `failed_at`

Ela e uma dead-letter table simples. O objetivo e permitir inspecao e futura
rotina de reprocessamento sem introduzir outro componente.

## 11. Indices

Indices atuais:

```sql
CREATE INDEX idx_logs_service_ts_desc ON logs (service, ts DESC, id DESC);
CREATE INDEX idx_logs_level_ts_desc ON logs (level, ts DESC, id DESC);
CREATE INDEX idx_logs_ts_desc ON logs (ts DESC, id DESC);
CREATE INDEX idx_logs_message_fts ON logs USING GIN (to_tsvector('simple', message));
CREATE INDEX idx_logs_attrs_gin ON logs USING GIN (attrs);
CREATE INDEX idx_logs_trace_id ON logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX idx_logs_span_id ON logs (span_id) WHERE span_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ingest_jobs_dedupe_key
  ON ingest_jobs (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
```

Como explicar:

- `service + ts + id`: busca comum por servico e pagina recente.
- `level + ts + id`: investigacao por severidade.
- `ts + id`: listagem geral recente.
- `message_fts`: busca textual.
- `attrs_gin`: prepara filtros futuros por JSONB.
- `trace_id`: acelera correlacao por trace sem indexar valores nulos.
- `span_id`: acelera correlacao por span sem indexar valores nulos.
- `dedupe_key`: garante idempotencia apenas para chaves nao nulas.

## 12. Erros e Resiliencia

### Payload invalido

A API retorna `400` com detalhes do Zod. Isso impede que dados ruins entrem na
fila.

### Falha ao publicar na fila

A API marca o job como `failed` e responde erro. Isso evita deixar um job
aparentemente `queued` quando ele nunca foi publicado.

### Falha temporaria no Worker

BullMQ tenta novamente ate 5 vezes com backoff exponencial.

### Falha definitiva no Worker

O job e marcado como `failed`, `processed_at` e preenchido e `error` guarda a
mensagem. A falha tambem e registrada em `ingest_dead_letters`, com payload,
erro e numero de tentativas.

### Dependencias indisponiveis

`GET /health/readiness` retorna `503` quando PostgreSQL ou Redis nao estao
prontos. Isso e util para load balancers e orquestradores.

## 13. Seguranca Basica

Medidas no projeto:

- API key opcional via `x-api-key`.
- `helmet` para headers HTTP.
- Rate limit basico.
- Limite de body em `1mb`.
- Validacao de schema.
- Queries parametrizadas.

O que eu melhoraria em producao:

- Autenticacao com scopes por servico.
- Rotacao de chaves.
- Auditoria de acesso.
- Rate limits por API key.
- TLS terminando em proxy ou load balancer.
- Separacao de permissoes de banco para API, Worker e migration.

## 14. Metricas e Retencao

`GET /metrics` expoe formato Prometheus com:

- uptime do processo;
- requests por metodo, rota e status;
- contadores de ingestao aceita/falha;
- estados da fila BullMQ quando Redis esta disponivel, incluindo jobs
  concluidos e falhos.

A retencao e feita por `npm run retention`. O script usa `RETENTION_DAYS` e
`RETENTION_BATCH_SIZE` para deletar logs antigos em lotes. Isso e mais simples
que particionamento, mas ja mostra preocupacao operacional com crescimento da
tabela.

## 15. Docker e Operacao Local

O `docker-compose.yml` sobe:

- PostgreSQL.
- Redis.
- `migrate` como servico one-shot.
- API.
- Worker.

A API e o Worker dependem de:

- Postgres saudavel.
- Redis saudavel.
- Migration concluida com sucesso.

Isso evita iniciar a aplicacao antes do banco estar pronto ou antes do schema
existir.

## 16. Testes

Ferramentas:

- Vitest.
- Supertest.

Cobertura:

- Liveness.
- Validacao de payload invalido.
- Validacao de query `limit`.
- Rejeicao de cursor incompleto.
- Garantia de que stats aplica filtros em `byLevel` e `timeline`.
- Teste de integracao de ingestao real quando `RUN_INTEGRATION=1`.
- Filtros por trace, span e atributos.
- Idempotencia por `dedupeKey`.
- Metricas Prometheus.
- Dead-letter tracking.
- Retencao por tempo.
- Smoke E2E contra stack real quando `npm run test:e2e` e executado.

Por que alguns testes nao usam Redis/PostgreSQL real?

Testes de contrato HTTP devem ser rapidos e deterministas. Redis/PostgreSQL real
ficam para integracao, que o CI consegue rodar com services.

## 17. CI

O GitHub Actions:

1. Sobe PostgreSQL.
2. Sobe Redis.
3. Instala dependencias com `npm ci`.
4. Roda `npm run lint`.
5. Executa migrations.
6. Roda a suite de testes com `RUN_INTEGRATION=1`.

Isso valida nao so os handlers HTTP, mas tambem o caminho real de integracao
quando as dependencias estao disponiveis.

## 18. OpenAPI

Arquivo:

```text
docs/openapi.yaml
```

O OpenAPI documenta:

- Health checks.
- Ingestao individual e em lote.
- Status de job.
- Busca com filtros e cursor.
- Detalhe por ID.
- Estatisticas.
- Metricas.
- Schemas de erro.
- API key opcional.

Por que OpenAPI estatico?

Neste projeto, a prioridade e clareza e facilidade de revisao. Um YAML estatico
evita dependencias extras no runtime e nao polui as rotas com comentarios
grandes. Em um time maior, eu poderia gerar parte da documentacao a partir dos
schemas ou publicar Swagger UI em ambiente interno.

## 19. Trade-offs

### PostgreSQL vs Elasticsearch

PostgreSQL e mais simples para operar e suficiente para filtros, JSONB, FTS
basico e agregacoes. Elasticsearch faria sentido com busca textual pesada,
ranking avancado, volume muito alto ou necessidade de features especificas de
observabilidade.

### BullMQ vs Kafka

BullMQ e simples e bom para background jobs. Kafka e melhor para streaming de
alto throughput, retencao longa, multiplos consumidores independentes e replay.
Para o escopo do projeto, BullMQ entrega valor sem complexidade extra.

### 202 Accepted vs escrita sincrona

Responder `202` reduz latencia e desacopla falhas temporarias do banco. O custo
e consistencia eventual: o cliente precisa consultar o status se quiser saber se
o log foi persistido.

### JSONB vs schema totalmente rigido

Campos estruturados atendem filtros principais. JSONB permite evoluir atributos
sem migration a cada novo campo. O trade-off e que consultas JSONB precisam ser
planejadas e indexadas com cuidado.

### Migration runner simples

O runner atual e suficiente para um projeto pequeno. Em producao, eu avaliaria
locks, rollback, dry-run, observabilidade e ferramentas maduras de migration.

### Dead-letter table vs dead-letter queue

Uma tabela e facil de consultar e encaixa no escopo atual. Uma fila morta
separada faria sentido se houvesse reprocessamento automatizado, consumidores
dedicados ou alto volume de falhas.

### Retencao por delete vs particionamento

O script de delete em lotes e simples e suficiente para demonstrar politica de
retencao. Em alto volume, eu migraria para particionamento por tempo e drop de
particoes antigas.

## 20. Limitacoes Conhecidas

- Retencao existe, mas ainda nao usa particionamento.
- Dead-letter existe como tabela, nao como fila de reprocessamento.
- O endpoint de metricas usa contadores em memoria; em multiplas replicas, a
  agregacao fica a cargo do Prometheus.
- Autenticacao e propositalmente simples.
- OpenAPI e mantido manualmente.

## 21. Melhorias Futuras

Prioridade alta:

- Reprocessamento de itens em `ingest_dead_letters`.
- Testes end-to-end com Testcontainers ou Compose automatizado.
- Particionamento por tempo em `logs`.

Prioridade media:

- Politica de retencao por ambiente.
- Scopes por API key.
- Dashboard simples de jobs falhos.

Prioridade baixa:

- Swagger UI servido pela propria API.
- Geracao parcial de OpenAPI a partir dos schemas Zod.
- Exportacao para outro backend analitico.

## 22. Perguntas Provaveis de Entrevista

### Por que existe API e Worker separados?

Para desacoplar a latencia do cliente da escrita no banco. A API valida e aceita
o trabalho rapidamente; o Worker lida com persistencia, retries e falhas.

### O que acontece se o Worker cair?

Os jobs continuam na fila. Quando o Worker voltar, ele pode continuar
processando. Se uma tentativa falhar, BullMQ aplica retry conforme configurado.

### O que acontece se o Redis cair?

A API nao consegue publicar novos jobs e deve retornar erro. O readiness tambem
falha. Em producao, isso indicaria que a instancia nao deve receber trafego.

### O que acontece se o PostgreSQL cair?

A API nao consegue registrar `ingest_jobs` nem buscar logs. O Worker tambem nao
consegue persistir. O readiness retorna `503`.

### Existe risco de perder log?

O projeto reduz risco ao registrar o job e usar fila com retry. Ainda assim,
sem garantias transacionais entre PostgreSQL e Redis, existe um trade-off:
registrar job e publicar em fila sao duas operacoes diferentes. Para evoluir, eu
poderia usar outbox pattern: gravar evento em uma tabela outbox na mesma
transacao e ter um publisher separado.

### Por que nao usar uma transacao envolvendo fila e banco?

Redis/BullMQ e PostgreSQL nao participam de uma transacao distribuida simples.
Em sistemas reais, eu evitaria two-phase commit e preferiria outbox pattern ou
idempotencia forte.

### A ingestao e idempotente?

Sim, quando o cliente envia `dedupeKey`. A API usa uma constraint unica parcial
em `ingest_jobs.dedupe_key`. Se a chave ja existir, ela retorna o `jobId`
existente e nao publica outro job. Sem `dedupeKey`, cada request representa uma
nova ingestao.

### Como escalar?

- Escalar API horizontalmente.
- Escalar Workers horizontalmente.
- Ajustar concorrencia do Worker.
- Monitorar tamanho da fila e latencia de processamento.
- Particionar `logs` por tempo.
- Avaliar backend especializado para busca em alto volume.

### Como observar esse servico?

Hoje existem logs estruturados, health checks e `GET /metrics`. O endpoint
exporta:

- Tamanho da fila.
- Contagem de retries e falhas.
- Jobs concluidos/falhos por estado BullMQ.
- Requests por rota/status.
- Uptime do processo.

Eu ainda adicionaria histogramas de latencia e tempo de queries em uma proxima
iteracao.

### Como proteger multi-tenant?

Eu adicionaria tenant/service ownership, API keys com scopes, filtros obrigatorios
por tenant e talvez particionamento logico ou fisico dependendo do isolamento
necessario.

## 23. Roteiro de Explicacao de 5 Minutos

1. Comece pelo problema: centralizar logs de varios servicos.
2. Mostre a arquitetura: API, fila, Worker, PostgreSQL.
3. Explique ingestao: validacao, job, fila, `202 Accepted`, Worker.
4. Explique busca: filtros parametrizados, FTS, keyset pagination.
5. Explique stats: contagem por level e timeline.
6. Explique operacao: Docker, migrations, health checks, metricas, retencao e CI.
7. Feche com trade-offs: PostgreSQL vs Elasticsearch, BullMQ vs Kafka,
   consistencia eventual e proximas melhorias.

## 24. Frase Final

"O projeto e pequeno o bastante para ser entendido rapido, mas inclui decisoes
que aparecem em sistemas reais: contratos bem definidos, fila, processamento
assincrono, idempotencia, dead-letter tracking, metricas, retencao,
persistencia estruturada, busca paginada, health checks, migrations, CI, Docker
e documentacao OpenAPI. Eu consigo defender tanto a implementacao quanto os
trade-offs."
