# Lead Hunter

Sistema automatizado de prospecção inteligente de leads baseado em scraping, enriquecimento de dados e análise por IA.

## Fluxo

```
HTTP Request → API → Redis Queue (BullMQ) → Worker → Scraper → AI → PostgreSQL
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

# Criar lead (enfileira job de scraping)
curl -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -d '{"website": "https://exemplo.com.br", "name": "Exemplo", "city": "São Paulo"}'
```

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

Este sistema utiliza apenas dados públicos e técnicas de análise não intrusivas.
