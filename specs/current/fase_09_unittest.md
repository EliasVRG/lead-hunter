# 🧩 FASE 09 — Cobertura de testes unitários

## 📌 Status
Current

---

## 🎯 Objetivo

Adicionar testes unitários da aplicação para fácil detecção de problemas na modificação de
código.

---

## 🧠 Contexto

`specs/completed/fase_00_pivot_job_hunter.md` implementou o pivot completo para job-hunter
pessoal: modelos (`ResumeProfile`, `JobPosting`, `MatchResult`), scraper do 99Freelas, schemas/
prompts de IA (match + proposta), três workers novos (`job-discovery`, `match`, `proposal`) e
endpoints novos na API. A cobertura de testes hoje (`tests/unit/`) já existe para as partes
"puras" (schemas Zod, prompt builders, `parseBudget`/`extractExternalId`, carregamento do
`ResumeProfile`), mas os workers e as queries de banco (`packages/database`) ainda não têm
nenhum teste — são a parte com mais lógica de orquestração e a mais fácil de quebrar
silenciosamente numa mudança futura.

---

## 🏗️ Escopo

Dentro do escopo:
* Testes para `packages/database` (`upsertJobPosting`, dedupe por `platform + external_id`,
  `listJobPostings` com filtros, `updateJobPostingStatus`) — via banco de teste ou mock do client
  `postgres`
* Testes para os workers (`job-discovery.worker.ts`, `match.worker.ts`, `proposal.worker.ts`)
  mockando `@lead-hunter/scraper`, `@lead-hunter/database` e `@lead-hunter/ai` — validar que cada
  worker enfileira o próximo job type correto (`scrape` → `ai-score` só quando `score` é nulo;
  `ai-score` → `proposal-draft` só quando `tier === "APPLY"`) e trata erros (job posting/resume
  ausente) lançando exceção para o BullMQ fazer retry
* Teste de regressão para o robots.txt parser (`packages/scraper/robots.ts`)

Fora do escopo:
* Testes end-to-end contra o 99Freelas real (validação dos seletores CSS reais é manual, feita
  ao rodar o scraper contra o site — ver nota em `packages/scraper/platforms/99freelas.ts`)
* Observability/SRE (`specs/backlog/fase_08_sre.md`) — fase separada

---

## 🧪 Critérios de aceite

* [ ] `packages/database` tem testes cobrindo upsert com dedupe e os filtros de `listJobPostings`
* [ ] Os três workers novos têm testes com dependências mockadas
* [ ] `packages/scraper/robots.ts` tem testes para `Disallow`/`Allow` e ausência de `robots.txt`
* [ ] `npm test` continua verde após a adição

---

## 📌 Notas para o Agent

* Mockar chamadas de IA e scraping nos testes de worker — não fazer chamadas reais a
  APIs/sites externos em teste unitário
* Ao concluir, mover esta spec para `specs/completed/` conforme o ciclo de vida definido em
  `AGENT.md` §8.2
