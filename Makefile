.PHONY: up up-n8n down install dev build test lint logs migrate reset-db seed dev-api dev-worker bull-board check-compose

# Compose v2 (plugin `docker compose`). O `docker-compose` v1 em Python é
# incompatível com Docker >= 28: ele lê `ContainerConfig` do inspect de imagem,
# campo que foi removido da API, e estoura com KeyError ao recriar container.
# Por isso aqui exigimos o v2 em vez de aceitar os dois.
COMPOSE := docker compose

check-compose:
	@$(COMPOSE) version >/dev/null 2>&1 || { \
		echo "ERRO: plugin 'docker compose' (v2) não encontrado."; \
		echo "      Instale com: sudo apt install docker-compose-v2"; \
		echo "      O 'docker-compose' v1 não funciona com Docker >= 28."; \
		exit 1; \
	}

# Só Postgres e Redis. O n8n é opcional e hoje divide o database 'leads' com a
# aplicação — ver specs/current/fase_10_openrouter_e_scraping_real.md.
up: check-compose
	$(COMPOSE) up -d postgres redis

up-n8n: check-compose
	$(COMPOSE) up -d

down: check-compose
	$(COMPOSE) down

install:
	npm install

# Espera o Postgres aceitar conexão antes de migrar: o `up -d` retorna assim que
# o container sobe, não quando o banco está pronto.
dev: up install
	@echo "aguardando postgres..."
	@until $(COMPOSE) exec -T postgres pg_isready -U lead -d leads >/dev/null 2>&1; do sleep 1; done
	@$(MAKE) migrate
	npm run dev

migrate:
	./scripts/migrate.sh

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

logs: check-compose
	$(COMPOSE) logs -f

reset-db: check-compose
	@echo "Isso apaga TODAS as vagas descobertas, scores e rascunhos de proposta."
	@read -p "Confirma? [y/N] " ok && [ "$$ok" = "y" ]
	$(COMPOSE) exec -T postgres psql -U lead -d leads -c "DROP TABLE IF EXISTS job_postings;"
	@$(MAKE) migrate

seed:
	@echo "Sem seed: os dados vêm do 99Freelas."
	@echo "Rode 'make dev' e depois:"
	@echo "  curl -X POST localhost:3000/discovery/runs -H 'Content-Type: application/json' -d '{}'"

dev-api:
	npm run dev -w @lead-hunter/api

dev-worker:
	npm run dev -w @lead-hunter/worker

bull-board:
	@echo "Bull Board: http://localhost:3000/queues"
