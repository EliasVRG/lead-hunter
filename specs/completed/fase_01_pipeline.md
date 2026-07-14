# 🧩 FASE 01 — Pipeline Estável (Hardening)

## 📌 Status
Backlog

---

## 🎯 Objetivo

Garantir que o pipeline de processamento de leads seja confiável, idempotente e resiliente a falhas.

O sistema deve suportar aumento de volume sem perda de dados ou duplicações.

---

## 🧠 Contexto

Atualmente o sistema processa leads via:

API → Queue → Worker → Scraper → AI → DB

Porém não possui garantias de:
- deduplicação
- retry confiável
- consistência de estado
- observabilidade completa

---

## 🏗️ Escopo da Fase

Esta fase cobre apenas estabilidade do pipeline existente.

Não inclui:
- novos scrapers
- novos modelos de IA
- novas fontes de leads
- UI/dashboard

---

## ⚙️ Requisitos Funcionais

### RF-01 — Retry de Workers
Workers devem:
- tentar novamente jobs falhos
- usar backoff exponencial
- respeitar maxAttempts configurado

---

### RF-02 — Deduplicação de Leads
O sistema não pode processar a mesma empresa duas vezes.

Critério:
- dedupe por `website` OU `domain`

---

### RF-03 — Idempotência de Processamento
Se um job for reprocessado:
- não pode duplicar registros no banco
- deve atualizar estado existente

---

### RF-04 — Logs Estruturados
Todos os workers devem emitir logs:

```json
{
  "jobId": "...",
  "stage": "scraper | ai | db",
  "status": "start | success | error",
  "durationMs": 123,
  "retryCount": 1
}
```

---

### RF-05 — Healthcheck de Workers

Sistema deve expor status de workers:

* ativo
* fila acumulada
* jobs falhando
* tempo médio de execução

---

## ⚙️ Requisitos Não-Funcionais

* RNF-01: sistema deve suportar múltiplos workers paralelos
* RNF-02: falhas não podem interromper pipeline global
* RNF-03: latência média por job < 10s (sem scraping pesado)
* RNF-04: zero duplicação de leads em condições normais

---

## 🧱 Impacto na Arquitetura

### Workers

* adicionar retry logic
* adicionar error handling padronizado
* adicionar logs estruturados

---

### Queue

* configurar maxAttempts
* configurar backoff strategy
* definir dead-letter queue

---

### Database

* adicionar constraint de unique:

  * `website`
  * ou `domain`

---

### API

* garantir que não cria duplicados ao enfileirar jobs

---

## 🧪 Critérios de Aceite

A fase será considerada concluída quando:

* [ ] Nenhum lead duplicado é criado no banco
* [ ] Jobs falhos são automaticamente reprocessados
* [ ] Workers registram logs estruturados
* [ ] Sistema continua funcionando com 10x volume de jobs
* [ ] Nenhum crash em cascata ocorre no pipeline

---

## 📊 Métricas de Sucesso

* Taxa de duplicação: 0%
* Taxa de retry bem-sucedido: > 90%
* Tempo médio de job: estável sob carga
* Falhas não propagadas entre workers

---

## 🚀 Resultado Esperado

O sistema passa a operar como pipeline resiliente:

* tolerante a falhas
* escalável horizontalmente
* observável
* consistente

---

## 🧩 Dependências

* Redis Queue estável
* PostgreSQL com constraints
* Workers separados por responsabilidade

---

## 📌 Notas para o Agent

* Não implementar novas features fora do escopo
* Não alterar fluxo base do pipeline
* Priorizar estabilidade sobre performance
