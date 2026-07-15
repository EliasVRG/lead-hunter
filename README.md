# Job Hunter

> Repo pivotado de um sistema de prospecção B2B para uma ferramenta pessoal e single-tenant: ele
> descobre vagas/projetos freelance publicamente listados, compara cada um com o seu currículo via
> IA e gera um rascunho de proposta para os que valem a pena. Ver
> `specs/completed/fase_00_pivot_job_hunter.md` para o histórico da decisão.

Ferramenta pessoal que descobre vagas freelance (hoje: 99Freelas), pontua a compatibilidade com o
seu currículo via IA e gera rascunhos de proposta — sem envio automático, você sempre revisa e
envia manualmente.

## Fluxo

```
POST /discovery/runs → Redis Queue (BullMQ) → job-discovery.worker (99Freelas)
                                             → match.worker (compatibilidade x ResumeProfile)
                                             → proposal.worker (rascunho de proposta, tier APPLY)
                                             → PostgreSQL
                              ↕
                       Bull Board UI
                    (admin/queues)
```

## Stack

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js + TypeScript |
| API | Fastify |
| Fila | BullMQ (Redis) |
| Scraping | Playwright |
| IA | OpenRouter / Gemini / Ollama |
| Banco | PostgreSQL |
| Orquestração | n8n (opcional) |

## Estrutura

```
lead-hunter/
├── apps/
│   ├── api/          # HTTP — valida input, enfileira jobs, Bull Board UI
│   └── worker/       # Consome fila, executa scraping + IA + persistência
├── packages/
│   ├── ai/           # Abstração de provedores de IA
│   ├── config/       # Config por ambiente
│   ├── database/     # Schema SQL, queries
│   ├── logger/       # Log estruturado (pino)
│   ├── observability/# Métricas e tracing
│   ├── queue/        # BullMQ connection, workers, contratos
│   ├── scraper/      # Playwright, robots.txt
│   └── shared/       # DTOs, tipos, schemas Zod
├── Makefile          # Comandos rápidos
├── docker-compose.yml
└── .env.example
```

## Pré-requisitos

- Node.js >= 20
- Docker + Docker Compose
- npm

## Setup rápido

```bash
# 1. Sobe infra (PostgreSQL + Redis)
docker compose up -d

# 2. Instala dependências
npm install

# 3. Cria .env (copie de .env.example e configure)
cp .env.example .env

# 4. Roda apps em modo dev
npm run dev
```

Ou use o **Makefile**:

```bash
make up        # docker compose up -d
make install   # npm install
make dev       # up + install + npm run dev
```

## Comandos

| Comando | Descrição |
|---------|-----------|
| `make up` | Sobe PostgreSQL, Redis e n8n |
| `make down` | Derruba containers |
| `make install` | Instala dependências |
| `make dev` | Sobe infra + instala + roda apps |
| `make build` | Compila todos os pacotes |
| `make test` | Roda testes |
| `make lint` | Type check (tsc --noEmit) |
| `make logs` | Logs dos containers |
| `make dev-api` | Só a API |
| `make dev-worker` | Só o Worker |
| `make bull-board` | Mostra URL do Bull Board |

## Bull Board

O **Bull Board** é uma UI para monitorar filas BullMQ.

Acesse: [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues)

Funcionalidades:
- Visualizar jobs enfileirados, ativos, concluídos e com falha
- Re-tentar jobs com falha
- Remover jobs
- Ver detalhes de cada job (dados, erro, timing)

## API

```bash
# Health check
curl http://localhost:3000/health

# Cadastrar/atualizar seu currículo (fonte da verdade, versionado em config/resume-profile.json)
curl -X POST http://localhost:3000/resume-profile \
  -H "Content-Type: application/json" \
  -d '{"name": "Seu Nome", "headline": "Backend Developer", "seniority": "pleno", "skills": ["Node.js"], "bio": "..."}'

curl http://localhost:3000/resume-profile

# Disparar um ciclo de descoberta de vagas no 99Freelas
curl -X POST http://localhost:3000/discovery/runs -H "Content-Type: application/json" -d '{}'

# Listar vagas descobertas (filtráveis por tier/status)
curl "http://localhost:3000/jobs?tier=APPLY"

# Atualizar status manualmente (ex: depois de enviar a proposta)
curl -X PATCH http://localhost:3000/jobs/1/status \
  -H "Content-Type: application/json" -d '{"status": "applied"}'
```

Edite `config/resume-profile.json` (ou use `POST /resume-profile`) com os seus dados reais antes
de rodar uma descoberta — o arquivo vem com dados de exemplo.

## Ambiente

Configure via `.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6391
DATABASE_URL=postgres://lead:lead@localhost:5432/leads
OPENROUTER_API_KEY=sk-...
GEMINI_API_KEY=...
AI_PROVIDER=gemini
API_PORT=3000
```

## Disclaimer

Este sistema utiliza apenas dados públicos e técnicas de análise não intrusivas. Scraping fica
restrito a plataformas com listagens públicas (hoje: 99Freelas) — LinkedIn está fora de escopo por
proibir scraping automatizado em seus termos de uso, mesmo com login próprio (ver
`specs/backlog/fase_07_discovery.md`). Nenhuma candidatura é enviada automaticamente: o sistema
gera o rascunho e para, o envio é sempre manual.
