.PHONY: up down install dev build test lint logs reset-db seed dev-api dev-worker bull-board

up:
	docker compose up -d

down:
	docker compose down

install:
	npm install

dev: up install
	npm run dev

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

logs:
	docker compose logs -f

reset-db:
	@echo "Not implemented yet"

seed:
	@echo "Not implemented yet"

dev-api:
	npm run dev -w @lead-hunter/api

dev-worker:
	npm run dev -w @lead-hunter/worker

bull-board:
	@echo "Bull Board: http://localhost:3000/queues"
