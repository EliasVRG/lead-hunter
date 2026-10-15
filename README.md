# Job Hunter

> Repo pivotado de um sistema de prospecção B2B para uma ferramenta pessoal e single-tenant: ele
> descobre vagas/projetos freelance publicamente listados, compara cada um com o seu currículo via
> IA e gera um rascunho de proposta para os que valem a pena. Ver
> `specs/completed/fase_00_pivot_job_hunter.md` para o histórico da decisão.

Ferramenta pessoal que descobre vagas freelance (hoje: 99Freelas), pontua a compatibilidade com o
seu currículo via IA e gera rascunhos de proposta — sem envio automático, você sempre revisa e
envia manualmente.

A IA roda em **modelos gratuitos do OpenRouter**, então o custo de operação é zero.

## Fluxo

Uma fila por estágio, para dar para ver onde o trabalho está parado:

```
POST /discovery/runs
      │
      ▼
┌─────────────┐   scrape 99Freelas    ┌──────────┐  match x currículo   ┌──────────┐
│  discovery  │ ────────────────────► │  triage  │ ───────────────────► │ proposal │
└─────────────┘   vagas sem score     └──────────┘   só tier APPLY      └──────────┘
      │                                     │                                │
      └─────────────────────────────────────┴────────────────────────────────┘
                                  PostgreSQL
                                      ▲
                              Bull Board (/queues)
```

`MAYBE` e `SKIP` param no banco — gerar rascunho para tudo queimaria a cota gratuita em vagas que
você não vai responder.

## Stack

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js >= 20 + TypeScript |
| API | Fastify |
| Fila | BullMQ (Redis) |
| Scraping | `fetch` + cheerio |
| IA | OpenRouter (modelos `:free`) |
| Banco | PostgreSQL |

## Estrutura

```
lead-hunter/
├── apps/
│   ├── api/                       # HTTP — valida input, enfileira, Bull Board
│   └── worker/
│       └── src/workers/
│           ├── discovery.worker.ts  # scrape → banco → fila de triagem
│           ├── triage.worker.ts     # score x currículo → fila de proposta
│           └── proposal.worker.ts   # rascunho de proposta
├── packages/
│   ├── ai/
│   │   ├── contracts/            # padrão de output: zod + JSON Schema + normalizador
│   │   ├── prompts/              # triagem e proposta
│   │   └── providers/openrouter/ # cliente com fallback de modelos e de formato
│   ├── config/                   # env (.env), ai, db, queue, resume-profile
│   ├── database/                 # schema SQL, migrations, queries
│   ├── queue/                    # 3 filas BullMQ, payloads tipados
│   ├── scraper/platforms/99freelas/
│   │   ├── http.ts               # fetch, robots.txt, montagem de URL
│   │   ├── parse.ts              # parsers puros (listagem + detalhe)
│   │   └── index.ts              # orquestração, paginação, rate limit
│   └── shared/                   # modelos e DTOs
└── tests/
    ├── fixtures/99freelas/       # HTML real capturado do site
    └── unit/
```

## Setup

```bash
# 1. Infra (PostgreSQL na porta 5442, Redis na 6391)
docker compose up -d postgres redis

# 2. Dependências
npm install

# 3. Config
cp .env.example .env    # e preencha OPENROUTER_API_KEY

# 4. Schema
./scripts/migrate.sh

# 5. Seu currículo — a triagem compara tudo contra este arquivo
$EDITOR config/resume-profile.json

# 6. Sobe api + worker
npm run dev
```

> O Postgres é exposto na **5442**, não na 5432, para não colidir com outro Postgres local.
> Se mudar, ajuste `DATABASE_URL` no `.env`.

## Chave do OpenRouter

Gere em <https://openrouter.ai/keys>. Chaves válidas começam com `sk-or-v1-`.

`GET /health` informa se ela está configurada:

```json
{ "status": "ok", "database": "up", "openrouter": "configured", "models": [ "..." ] }
```

Sem chave a descoberta continua funcionando (é só scraping), mas triagem e proposta falham.

### Modelos

`OPENROUTER_MODELS` é uma **cadeia de fallback** separada por vírgula. O tier gratuito tem cota
por modelo, então quando o primeiro esgota o cliente passa ao próximo em vez de parar o pipeline.

Dentro de cada modelo ele tenta três modos de output, do mais garantido ao mais permissivo:
`json_schema` (o provider valida a forma) → `json_object` (só garante JSON válido) → schema inline
no prompt. Nem todo modelo gratuito aceita `response_format`, e cair de modo não perde garantia
real — o contrato é imposto localmente.

Para revalidar quais modelos gratuitos existem hoje e quais suportam structured outputs:

```bash
curl -s https://openrouter.ai/api/v1/models \
  | jq -r '.data[] | select(.id | endswith(":free")) | "\(.id)\t\(.supported_parameters | contains(["structured_outputs"]))"'
```

## Padrão de output

O sistema **não confia no modelo** para a forma do resultado. `packages/ai/contracts/` separa o
schema de aceitação (frouxo, tolera os erros típicos de modelo pequeno) do contrato final
(o que workers e banco consomem), e o normalizador impõe:

| Campo | Quem decide |
|-------|-------------|
| `dimensions.*` | o modelo, arredondado e limitado ao peso máximo |
| `score` | **o sistema** — soma das dimensões, não o número que o modelo escreveu |
| `tier` | **o sistema** — derivado do score pelos limiares |
| `confidence` | o modelo, reescalado para 0-1 |
| `reason`, `red_flags`, `matched_skills`, `missing_skills` | o modelo, deduplicado |

Score recalculado porque um score que não corresponde às dimensões torna a explicação inútil;
tier derivado porque é ele que dispara a fila de proposta e o mesmo score tem que dar o mesmo
tier em qualquer modelo da cadeia.

A proposta sai estruturada, não como um blob de texto: `summary`, `body` (o que vai colado no
formulário), `key_points`, `questions`, `estimated_days`, `suggested_price`.

## API

```bash
# Status geral
curl localhost:3000/health
curl localhost:3000/queues/status

# Dispara descoberta
curl -X POST localhost:3000/discovery/runs \
  -H "Content-Type: application/json" -d '{}'

# Com filtros (page/q/categoria são os que o site aceita via GET)
curl -X POST localhost:3000/discovery/runs -H "Content-Type: application/json" -d '{
  "query": "node",
  "category": "web-mobile-e-software",
  "maxPages": 3,
  "maxListings": 30,
  "maxAgeHours": 48
}'

# Vagas descobertas
curl "localhost:3000/jobs?tier=APPLY"
curl "localhost:3000/jobs?status=proposal_ready"

# Marca como enviada, depois de revisar e enviar manualmente
curl -X PATCH localhost:3000/jobs/1/status \
  -H "Content-Type: application/json" -d '{"status": "applied"}'

# Currículo
curl localhost:3000/resume-profile
```

Status válidos: `discovered`, `triaged`, `proposal_ready`, `applied`, `won`, `lost`, `dismissed`.

### Opções de descoberta

| Campo | Default | Nota |
|-------|---------|------|
| `query` | — | `?q=` no site |
| `category` | — | slug, ex: `web-mobile-e-software` |
| `maxPages` | 3 | 10 projetos por página |
| `maxListings` | 30 | teto absoluto |
| `maxAgeHours` | — | filtrado localmente; o site não aceita esse filtro via GET |
| `fetchDetails` | `true` | `false` é mais rápido mas vem sem orçamento |

## Bull Board

<http://localhost:3000/queues> — as três filas aparecem separadas, com jobs pendentes, ativos,
concluídos e falhos. Falhas ficam retidas de propósito (`removeOnFail: false`) para você ver o
erro e reprocessar.

## Comandos

| Comando | Descrição |
|---------|-----------|
| `make up` / `make down` | Sobe/derruba containers |
| `make dev` | Infra + install + api e worker |
| `make dev-api` / `make dev-worker` | Só um dos dois |
| `make test` | Testes (vitest) |
| `make lint` | `tsc --noEmit` |
| `./scripts/migrate.sh` | Aplica init.sql + migrations (idempotente) |

## Scraping

Restrito a dados públicos, sem login e sem bypass de autenticação, respeitando `robots.txt` e com
pausa entre requests. Hoje só 99Freelas — LinkedIn está fora de escopo por proibir scraping
automatizado nos termos de uso, mesmo com login próprio (ver `specs/backlog/fase_07_discovery.md`).

Os parsers são funções puras testadas contra HTML real em `tests/fixtures/99freelas/`. **Ao mexer
em seletor, capture uma fixture nova primeiro** — teste verde contra fixture antiga não diz nada
sobre o site de hoje:

```bash
curl -s -A "Mozilla/5.0" https://www.99freelas.com.br/projects \
  -o tests/fixtures/99freelas/listing.html
```

## Disclaimer

Nenhuma candidatura é enviada automaticamente: o sistema gera o rascunho e para. O envio é sempre
manual, depois da sua revisão.
