# 🧩 FASE 04 — Tracker pessoal de candidaturas

## 📌 Status
Completed — `GET /jobs` (filtro por tier/status) e `PATCH /jobs/:id/status` implementados em
`apps/api/src/server.ts`, usando `job_postings.updated_at` para auditoria de transição

---

## 🎯 Objetivo

Dar visibilidade sobre o funil de vagas descobertas: o que já foi revisado, o que tem proposta
pronta, o que já foi aplicado e o resultado de cada candidatura.

Substitui o CRM de vendas B2B original — aqui não há equipe nem clientes, é um tracker pessoal
de um único usuário.

---

## 🏗️ Escopo

Pipeline de status por vaga (`JobPosting.status`):

* `discovered` — recém-encontrada pelo scraper
* `reviewing` — usuário está avaliando (ou aguardando match score)
* `proposal_ready` — rascunho de proposta gerado (`fase_05`), pronta para revisão do usuário
* `applied` — usuário se candidatou manualmente
* `won` / `lost` — resultado da candidatura (registrado manualmente pelo usuário)
* `dismissed` — usuário decidiu ignorar a vaga

Transições `applied → won/lost` e `→ dismissed` são manuais (o sistema não sabe o resultado de
uma candidatura sem input do usuário).

---

## ⚙️ Escopo técnico

* Sem UI de Kanban nesta fase — endpoints simples de listagem/filtro/atualização de status
  bastam para uso pessoal (`GET /jobs?status=...`, `PATCH /jobs/:id/status`)
* Integração com CRM externo (ex: Twenty CRM) **não é necessária** — overhead desnecessário para
  um único usuário gerenciando o próprio funil de candidaturas

---

## 🧪 Critérios de aceite

* [ ] Toda vaga tem um `status` rastreável e atualizável via API
* [ ] É possível listar vagas filtradas por status e por tier
* [ ] Transição de status é auditável (timestamp de mudança)

---

## 📌 Notas para o Agent

* Não construir Kanban/UI nesta fase — API é suficiente até haver necessidade real de interface
* Não integrar CRM externo — fora de escopo para uso single-tenant
