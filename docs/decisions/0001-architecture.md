# ADR-0001 — Queue-based architecture for lead processing

## Status
Accepted

---

## Context

O sistema precisa processar scraping e IA de forma escalável e desacoplada.

Essas operações:
- são lentas
- dependem de rede
- podem falhar
- precisam de retry

---

## Decision

Foi adotado um sistema baseado em fila usando Redis + BullMQ.

---

## Consequences

### 👍 Positive
- escalabilidade horizontal
- retry automático
- isolamento de falhas
- melhor controle de carga

### 👎 Negative
- maior complexidade inicial
- necessidade de monitoramento da fila

---

## Alternatives considered

### 1. Processamento síncrono
❌ descartado por performance e escalabilidade

### 2. Event-driven Kafka
❌ overkill para MVP

---

## Notes

Essa decisão impacta toda a arquitetura do sistema.