# 🗺️ Roadmap — Job Hunter

> Repo pivotado de prospecção B2B ("Lead Hunter") para busca de vagas freelance na `fase_00`.
> As fases 01-05 foram concluídas sob o escopo B2B antigo; parte do que elas entregaram foi
> removida no pivot. Ver `specs/completed/` para o histórico.

## ✅ Concluído

| Fase | Entrega |
|------|---------|
| 00 | Pivot B2B → Job Hunter pessoal (single-tenant) |
| 01-05 | Pipeline, fila, worker, scraper e IA sob o escopo B2B original |
| 09 | Testes unitários |
| 10 | OpenRouter gratuito, contrato de output, scraping real do 99Freelas, 3 filas, tela de revisão |

## 🔄 Em andamento

**Fase 11 — Descoberta contínua** (`specs/current/`)
Agendador + alerta de `APPLY`. Hoje a descoberta é manual, e as vagas chegam com 130-230
propostas concorrentes — tarde demais para converter.

## 📋 Backlog, em ordem de impacto

| Fase | Entrega | Por quê |
|------|---------|---------|
| 12 | Filtro de vaga morta (pré-triagem) | Vaga com 230 propostas ou prazo vencido ainda vira `APPLY` e gasta cota de IA |
| 13 | Loop de feedback | `won`/`lost` existem e nada os lê — o score nunca é confrontado com a realidade |
| 08 | Hardening | API aberta em `0.0.0.0` sem auth, `packages/observability` vazio, código órfão do pivot |
| 07 | Multi-plataforma | Só 99Freelas hoje; a arquitetura já suporta mais fontes |
| 06 | Multi-tenant | Fora de escopo — ferramenta é pessoal |

As fases 11 e 12 são um par: a 11 encontra a vaga cedo, a 12 evita gastar IA com as que já
morreram. Separadas entregam metade do ganho cada.
