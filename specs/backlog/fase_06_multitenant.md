# 🧩 FASE 06 — Multi-tenant (SaaS)

## 📌 Status
Fora de escopo (por decisão do usuário — reavaliar apenas se o projeto mudar de "ferramenta
pessoal" para "produto para terceiros")

---

## 🎯 Contexto

O sistema foi repivotado em `specs/current/fase_00_pivot_job_hunter.md` para ser um Job Hunter de
uso **pessoal e single-tenant**: um único usuário, um único `ResumeProfile`, um único funil de
candidaturas. Não há, hoje, necessidade de isolar dados entre múltiplos usuários.

Esta fase fica registrada apenas como direção possível caso o projeto um dia vire um produto para
outras pessoas usarem.

---

## 💡 Ideia original (mantida para referência futura)

* cada usuário define: nicho, cidade/plataforma, filtros de vaga, seu próprio `ResumeProfile`
* isolação de dados por usuário
* provavelmente exigiria: autenticação, billing, limites de uso por tenant

---

## 📌 Notas para o Agent

* Não implementar nada desta fase sem decisão explícita do usuário revertendo o escopo
  single-tenant
* Não adicionar isolamento multi-usuário "preventivo" no modelo de dados atual — é complexidade
  desnecessária para o caso de uso de hoje
