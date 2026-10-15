# 🧩 FASE 12 — Filtro de vaga morta (pré-triagem)

## 📌 Status
Backlog (par natural da `fase_11`; juntas entregam o ganho completo de velocidade)

---

## 🎯 Objetivo

Descartar vagas sem chance real **antes** de gastar uma chamada de IA, e corrigir a dimensão
`urgency`, que hoje mede a coisa errada.

---

## 🧠 Contexto

Dois defeitos observados na primeira rodada real:

**1. `expires_at` é coletado e nunca usado.** O scraper lê "Tempo restante" do 99Freelas, grava
no banco e nenhuma decisão consulta o campo. Vaga com prazo vencido é triada normalmente e pode
gerar rascunho.

**2. `urgency` apenas desconta pontos, quando deveria eliminar.** A vaga "Sistema web para gerar
mapas numerológicos" tinha **230 propostas e 5 dias** — tirou `urgency: 4` de 20 e mesmo assim
virou `APPLY`, porque a renormalização introduzida na fase 10 removeu `rate_fit` do divisor e
empurrou o score para cima:

```
(35 + 18 + 4) / (40 + 20 + 20) = 71  →  APPLY
```

A renormalização está correta em princípio, mas deixou o sistema **mais permissivo justamente no
caso em que deveria ser mais duro**. Concorrência alta não é uma penalidade gradual: passado certo
ponto é um não.

---

## 🏗️ Impacto na arquitetura

Um filtro determinístico em `discovery.worker`, **antes** de enfileirar a triagem. Sem IA
envolvida — são fatos observáveis da vaga, e descartar aqui também economiza cota gratuita.

Regras propostas (todas configuráveis, todas desligáveis):

| regra | padrão | razão |
|-------|--------|-------|
| `expires_at` no passado | descarta | a vaga fechou |
| propostas > N | N = 40 | ser a proposta nº 41 não converte |
| idade > N horas | desligado | redundante com `maxAgeHours` da descoberta |

A vaga descartada **é gravada** com `status = 'dismissed'` e um motivo, em vez de sumir: sem isso
não há como auditar se o filtro está cortando demais, e ela seria redescoberta e descartada de
novo a cada rodada.

Decisão em aberto: o corte por número de propostas deveria ser absoluto (40) ou relativo à
mediana da plataforma? A mediana se adapta a categorias com volumes diferentes, mas exige uma
janela de dados históricos que o banco já tem condições de calcular.

---

## 🗄️ Mudanças no modelo de dados

- `dismissed_reason TEXT` — por que o filtro cortou, para auditoria
- índice em `expires_at` se o volume crescer

---

## 🧪 Critérios de aceite

- [ ] Vaga com `expires_at` vencido nunca chega à fila de triagem
- [ ] Vaga acima do teto de propostas é gravada como `dismissed` com motivo, sem chamar IA
- [ ] Contagem de chamadas de IA economizadas aparece no log da descoberta
- [ ] Filtros desligados reproduzem exatamente o comportamento atual
- [ ] A tela de revisão não lista vaga descartada, mas `GET /jobs?status=dismissed` lista

---

## 📌 Notas para o Agent

Rever se `urgency` ainda faz sentido como dimensão depois do filtro. Se a concorrência alta vira
corte seco, o que sobra em `urgency` é só "publicada há pouco" — talvez mereça peso menor, e o
peso liberado vá para `skill_match`.
