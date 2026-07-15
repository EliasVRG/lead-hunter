# 🧩 FASE 03 — Job Match Scoring (IA de Compatibilidade)

## 📌 Status
Completed — implementado junto com `specs/completed/fase_00_pivot_job_hunter.md`
(`packages/ai/schemas/job-match.schema.ts`, `packages/ai/prompts/job-match.prompt.ts`,
`apps/worker/src/workers/match.worker.ts`)

---

## 🎯 Objetivo

Avaliar, para cada vaga descoberta, o quão compatível ela é com o currículo/perfil do usuário,
gerando um score explicável e uma recomendação de ação (candidatar-se ou não).

---

## 🧠 Contexto

A versão anterior desta fase pontuava **empresas** como oportunidade de venda B2B
(`dor_técnica`, `maturidade_digital`, `urgência`, `potencial_financeiro`). Essa direção não se
aplica mais: agora o sistema pontua **vagas**, comparando-as ao perfil do próprio usuário
(`ResumeProfile`, definido em `specs/current/fase_00_pivot_job_hunter.md`).

---

## 🏗️ Escopo da fase

```text
Job Discovery → Match AI → Storage
```

---

## 🧮 Modelo de scoring

```text
score_final =
  skill_match (0–40)
  + rate_fit (0–20)
  + seniority_fit (0–20)
  + urgency (0–20)
```

### RF-01 — Skill Match (0–40)

Compara as skills exigidas na vaga com `skills`/`stack` do `ResumeProfile`. Pontua alto quando
há sobreposição forte com as tecnologias que o usuário domina; pontua baixo quando a vaga exige
stack fora do perfil.

### RF-02 — Rate Fit (0–20)

Compara `budgetMin`/`budgetMax` da vaga com `minRate`/`maxRate` do currículo. Pontua alto quando
o orçamento da vaga está dentro (ou acima) da faixa aceitável; pontua baixo ou zera quando o
orçamento é incompatível com o valor mínimo aceito.

### RF-03 — Seniority Fit (0–20)

Avalia se o nível de complexidade/responsabilidade da vaga é compatível com a `seniority` do
usuário (não subaproveitar nem exigir experiência que o usuário não tem).

### RF-04 — Urgency (0–20)

Sinais de que vale a pena agir rápido: poucas propostas concorrentes (`proposalsCount` baixo),
vaga recém-postada, prazo de candidatura próximo.

---

## 🚩 Red flags (detecção de risco)

Além do score, a IA deve sinalizar `redFlags: string[]` quando identificar indícios de golpe ou
vaga de baixa qualidade, por exemplo:

* orçamento muito abaixo do mercado para o escopo descrito
* pedido de pagamento adiantado do prestador ao cliente
* descrição vaga/genérica demais para avaliar escopo real
* cliente sem avaliações ou com avaliações muito ruins

Red flags não zeram o score automaticamente, mas devem aparecer na `reason` e reduzir o tier.

---

## 📤 Output esperado

```json
{
  "score": 82,
  "tier": "APPLY",
  "dimensions": {
    "skill_match": 35,
    "rate_fit": 18,
    "seniority_fit": 17,
    "urgency": 12
  },
  "reason": "Stack pedida (Node.js, Playwright, filas) bate com o perfil; orçamento dentro da faixa aceita; poucas propostas concorrentes.",
  "red_flags": [],
  "recommended_action": "Candidatar-se com proposta focada em experiência prévia com scraping e filas assíncronas."
}
```

---

## 🏷️ Classificação de tiers

* 0–39 → **SKIP**
* 40–69 → **MAYBE**
* 70–100 → **APPLY**

---

## ⚙️ Requisitos não-funcionais

* RNF-01: output deve ser sempre estruturado (JSON válido, schema Zod)
* RNF-02: IA não pode retornar texto livre sem schema
* RNF-03: resultados devem ser determinísticos quando possível
* RNF-04: scoring deve ser reproduzível com os mesmos inputs (vaga + currículo)

---

## 🧱 Impacto na arquitetura

### AI Layer

* substituir `packages/ai/schemas/lead-score.schema.ts` por `job-match.schema.ts`
* substituir `packages/ai/prompts/lead-score.prompt.ts` por `job-match.prompt.ts`, recebendo
  `JobPosting` + `ResumeProfile` como input

### Worker Layer

* `match.worker.ts` (ver `specs/current/fase_00_pivot_job_hunter.md`)

### Database

* colunas em `job_postings`: `score`, `tier`, `dimensions` (JSON), `reason`, `red_flags` (JSON)

---

## 🧪 Critérios de aceite

* [ ] 100% das vagas novas recebem score estruturado
* [ ] todas as dimensões são calculadas corretamente
* [ ] tiers são atribuídos corretamente
* [ ] red flags são detectadas quando presentes na descrição/dados da vaga
* [ ] saída sempre válida em JSON

---

## 📊 Métricas de sucesso

* consistência de score: alta estabilidade entre execuções para a mesma vaga
* correlação entre tier `APPLY` e vagas em que o usuário de fato decide se candidatar
* baixa taxa de falso positivo em vagas com red flags não detectadas

---

## 📌 Notas para o Agent

* nunca alterar a fórmula sem atualizar esta spec
* sempre manter explicabilidade do score (`reason` legível, não apenas números)
* evitar heurísticas ocultas sem documentação
* red flags são um sinal de segurança para o usuário — nunca omitir quando detectadas
