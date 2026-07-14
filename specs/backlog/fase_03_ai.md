# 🧩 FASE 03 — Lead Scoring Avançado (IA Evoluída)

## 📌 Status
Backlog

---

## 🎯 Objetivo

Evoluir o sistema de scoring atual baseado em IA simples para um modelo multidimensional de avaliação de leads.

O objetivo é tornar o score mais explicável, confiável e orientado a ação comercial.

---

## 🧠 Contexto

Atualmente o sistema gera um score único baseado em análise genérica da empresa.

Limitações atuais:
- baixa explicabilidade
- pouca precisão comercial
- ausência de dimensões de negócio
- decisões não estruturadas

---

## 🏗️ Escopo da Fase

Substituir o modelo atual de scoring por um sistema estruturado baseado em múltiplos fatores.

Pipeline impactado:

Enrichment → AI Scoring → Storage

---

## 🧮 Modelo de Scoring

O score final deve ser calculado com base nas seguintes dimensões:

```text
score_final =
  dor_técnica (0–30)
  + maturidade_digital (0–30)
  + urgência (0–20)
  + potencial_financeiro (0–20)
```

---

## ⚙️ Definições das Dimensões

### RF-01 — Dor Técnica (0–30)

Avalia problemas técnicos evidentes:

* site lento
* stack antigo
* ausência de CDN
* erros técnicos
* baixa performance

---

### RF-02 — Maturidade Digital (0–30)

Avalia o nível de presença digital:

* qualidade do site
* uso de ferramentas modernas
* SEO básico
* presença estruturada online

---

### RF-03 — Urgência (0–20)

Identifica sinais de necessidade imediata:

* site quebrado
* ausência de funcionalidades críticas
* inconsistências técnicas
* sinais de reforma recente

---

### RF-04 — Potencial Financeiro (0–20)

Estima capacidade de investimento:

* tamanho da empresa
* segmento
* presença de marketing ativo
* sinais de investimento digital

---

## 🧠 AI Scoring Worker

### Novo comportamento

O worker de IA deve:

1. Receber dados enriquecidos
2. Calcular cada dimensão separadamente
3. Gerar score final somado
4. Classificar tier
5. Gerar explicação estruturada

---

## 📤 Output Esperado

```json
{
  "score": 87,
  "tiers": "HOT",
  "dimensions": {
    "technical_pain": 25,
    "digital_maturity": 20,
    "urgency": 18,
    "financial_potential": 24
  },
  "reason": "Site lento, tecnologia antiga e forte presença comercial indicam alta oportunidade.",
  "recommended_approach": "Abordagem consultiva focada em performance e modernização de infraestrutura."
}
```

---

## 🏷️ Classificação de Tiers

* 0–39 → COLD
* 40–69 → WARM
* 70–100 → HOT

---

## ⚙️ Requisitos Não-Funcionais

* RNF-01: output deve ser sempre estruturado (JSON válido)
* RNF-02: IA não pode retornar texto livre sem schema
* RNF-03: resultados devem ser determinísticos quando possível
* RNF-04: scoring deve ser reproduzível com os mesmos inputs

---

## 🧱 Impacto na Arquitetura

### AI Layer

* substituir score simples por modelo estruturado
* atualizar prompt base de análise

---

### Worker Layer

* atualizar ai.worker.ts
* adicionar cálculo de dimensões

---

### Database

* adicionar colunas:

  * score
  * tiers
  * dimensions JSON

---

## 🧪 Critérios de Aceite

* [ ] 100% dos leads possuem score estruturado
* [ ] todas as dimensões são calculadas corretamente
* [ ] tiers são atribuídos corretamente
* [ ] saída sempre válida em JSON
* [ ] recomendações são geradas pela IA

---

## 📊 Métricas de Sucesso

* consistência de score: alta estabilidade entre execuções
* correlação entre tiers e qualidade real de leads
* redução de falsos positivos em leads HOT

---

## 🚀 Resultado Esperado

Após esta fase, o sistema será capaz de:

* identificar leads com alta precisão comercial
* justificar cada score com transparência
* sugerir abordagem de contato personalizada
* priorizar automaticamente oportunidades reais

---

## 📌 Notas para o Agent

* nunca alterar fórmula sem atualizar spec
* sempre manter explicabilidade do score
* evitar heurísticas ocultas sem documentação
