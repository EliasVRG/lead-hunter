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

Antes da IA há um **filtro determinístico**: vaga com prazo vencido ou concorrência acima do teto
é descartada sem gastar chamada. Em dados reais do 99Freelas isso corta ~10% das vagas, incluindo
casos de 235 propostas que antes chegavam a `APPLY`.

```env
SCREENING_MAX_PROPOSALS=40     # 0 desliga
SCREENING_DROP_EXPIRED=true
SCREENING_MAX_AGE_HOURS=0      # 0 desliga (a descoberta já filtra por idade)
```

A vaga cortada é **gravada** como `dismissed` com o motivo, não ignorada: sem registro não há como
auditar se o filtro está cortando demais, e ela seria redescoberta e reavaliada a cada rodada.
Dado ausente nunca descarta — o scraper pode falhar em ler um campo, e tratar "não sei" como
"está morta" perderia vaga boa em silêncio.

```bash
curl "localhost:3000/jobs?status=dismissed"   # o que o filtro cortou, e por quê
```

O pipeline termina no rascunho. A última etapa é sua, em **<http://localhost:3000/review>**:
ler, corrigir, copiar, colar no 99Freelas e marcar como enviada.

## Descoberta automática

Com `DISCOVERY_SCHEDULE_ENABLED=true`, a descoberta roda sozinha no intervalo configurado (padrão
10 min) e você recebe um alerta quando uma vaga de tier `APPLY` aparece.

Isso não é conveniência — é o ponto. Nas vagas que o sistema triou manualmente, a concorrência
estava em **130 a 230 propostas**, porque foram encontradas dias depois de publicadas. Ser a
proposta nº 231 não converte. O valor de automatizar não é escrever o texto, é **saber da vaga na
primeira hora**, quando existem 3 propostas.

```env
DISCOVERY_SCHEDULE_ENABLED=true
DISCOVERY_SCHEDULE_EVERY_MS=600000       # 10 min
DISCOVERY_SCHEDULE_MAX_AGE_HOURS=3       # rodando sempre, vaga velha já foi vista
NOTIFIER=desktop                         # desktop | webhook | none
```

`GET /discovery/schedule` mostra o estado real lido do Redis e a próxima execução. O agendador é
idempotente: reiniciar a API não duplica, e mudar o intervalo substitui o anterior.

A rodada manual continua existindo, para busca dirigida por termo ou categoria.

### Notificação

| driver | como funciona |
|--------|---------------|
| `desktop` | `notify-send` — exige `sudo apt install libnotify-bin` e um terminal da sessão gráfica (precisa de `DBUS_SESSION_BUS_ADDRESS`) |
| `webhook` | `POST` JSON em `NOTIFIER_WEBHOOK_URL` — serve Slack, Discord, Telegram |
| `none` | desligado (padrão) |

O alerta dispara na **triagem**, não quando o rascunho fica pronto: a proposta leva mais ~20s e
pode estar atrás de fila. O que importa é você já abrir o link enquanto o texto é escrito.

Falha de notificação nunca derruba o job — o resultado já está no banco, e um retry gastaria cota
de IA de novo só por causa de um aviso perdido.

## Tela de revisão

<http://localhost:3000/review> (a raiz redireciona para lá) lista o que está esperando você,
ordenado por score:

- o rascunho em campo editável, com botão de copiar
- score, tier e as dimensões — com a dimensão **riscada** quando saiu do cálculo
  (ver "Dimensões não avaliáveis" abaixo)
- a justificativa da triagem, pontos de atenção, skills em comum e as que faltam
- perguntas sugeridas para o cliente
- link para a vaga e botões para marcar como **enviada** ou **descartada**

Marcar como enviada tira o item da fila — a tela é fila de trabalho, não histórico.
Para o histórico, `GET /jobs?status=applied`.

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
│   │   └── src/review/page.ts     # tela de revisão (HTML server-rendered)
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
│   ├── notifier/                 # alerta de vaga compatível (desktop/webhook)
│   ├── queue/                    # 3 filas BullMQ, agendador, payloads tipados
│   ├── screening/                # filtro de vaga morta, antes da IA
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
| `score` | **o sistema** — calculado das dimensões, não o número que o modelo escreveu |
| `tier` | **o sistema** — derivado do score pelos limiares |
| `unassessed` | **o sistema** — derivado do `budget_type` do scraper |
| `confidence` | o modelo, reescalado para 0-1 |
| `reason`, `red_flags`, `matched_skills`, `missing_skills` | o modelo, deduplicado |

Score recalculado porque um score que não corresponde às dimensões torna a explicação inútil;
tier derivado porque é ele que dispara a fila de proposta e o mesmo score tem que dar o mesmo
tier em qualquer modelo da cadeia.

### Dimensões não avaliáveis

No 99Freelas quase todo projeto é publicado com orçamento **"Aberto"** — na primeira rodada real
foram 14 de 14. Pontuar `rate_fit` pela metade nesse caso virava uma constante de 10 pontos: não
media nada e ainda consumia 20 do teto, derrubando o score máximo para 75 e tornando `APPLY`
(≥ 70) quase inalcançável.

Então a dimensão sai do cálculo e o score é renormalizado sobre os pesos restantes:

```
orçamento "Aberto"  →  score = (skill_match + seniority_fit + urgency) / 80 × 100
```

O score volta a significar **"% de aderência no que deu para avaliar"**, na mesma escala de uma
vaga com orçamento definido, e os limiares de tier seguem valendo sem ajuste. A exclusão é
decidida pelo `budget_type` que o scraper extraiu — fato observável da vaga, não opinião do
modelo — e fica registrada em `unassessed_dimensions` para a explicação não mentir: 71 sobre três
dimensões não é a mesma coisa que 71 sobre quatro.

| Campo | Peso | Nota |
|-------|------|------|
| `skill_match` | 40 | |
| `rate_fit` | 20 | sai do cálculo quando o orçamento é "Aberto" ou ilegível |
| `seniority_fit` | 20 | |
| `urgency` | 20 | fica estruturalmente baixa: todo projeto tem dezenas de propostas |

A proposta sai estruturada, não como um blob de texto: `summary`, `body` (o que vai colado no
formulário), `key_points`, `questions`, `estimated_days`, `suggested_price`.

## API

A tela de revisão cobre o uso normal. A API é para automação e inspeção.

```bash
# Status geral
curl localhost:3000/health
curl localhost:3000/queues/status
curl localhost:3000/discovery/schedule

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

# Rascunho sob demanda: você leu uma MAYBE, gostou, e quer a proposta
# sem esperar o score subir (a triagem só enfileira APPLY automaticamente)
curl -X POST localhost:3000/jobs/62/proposal

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
