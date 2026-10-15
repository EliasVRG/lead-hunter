# 🧩 FASE 12 — Filtro de vaga morta (pré-triagem)

## 📌 Status
Current — implementada e verificada

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

**Decisão: teto absoluto, não mediana.** Num uso pessoal o volume é baixo demais para uma
mediana por categoria ser estável, e um número fixo é previsível — dá para olhar
`GET /jobs?status=dismissed` e entender exatamente por que cada vaga caiu. A mediana fica para
quando houver histórico que a sustente.

**Dado ausente nunca descarta.** O scraper pode falhar em ler um campo; tratar "não sei" como
"está morta" descartaria vaga boa em silêncio. O filtro só corta com evidência.

---

## 🗄️ Mudanças no modelo de dados

- `dismissed_reason TEXT` — por que o filtro cortou, para auditoria
- índice em `expires_at` se o volume crescer

---

## 🧪 Critérios de aceite

- [x] Vaga com `expires_at` vencido nunca chega à fila de triagem
- [x] Vaga acima do teto de propostas é gravada como `dismissed` com motivo, sem chamar IA
- [x] Contagem de chamadas de IA economizadas aparece no log da descoberta (`aiCallsSaved`)
- [x] Filtros desligados reproduzem exatamente o comportamento atual
- [x] A tela de revisão não lista vaga descartada, mas `GET /jobs?status=dismissed` lista

---

## ✅ Verificação

**Contra 60 vagas reais do 99Freelas**, sem gastar IA:

```
CORTE [791466] 160 propostas   CORTE [791683]  49 propostas
CORTE [790670] 206 propostas   CORTE [791647]  57 propostas
CORTE [790517] 235 propostas   CORTE [791631]  41 propostas
RESUMO: 54 mantidas, 6 cortadas (10% de chamadas de IA economizadas)
```

`790517` é exatamente a vaga que motivou a fase: 235 propostas e mesmo assim `APPLY` com score
76. Agora não chega à triagem.

**Pelo worker real, com escrita no banco:**

```
scraped: 60   enqueuedForTriage: 39   alreadyTriaged: 18   screenedOut: 3   aiCallsSaved: 3
```

```
791647 | 57 | dismissed | too_many_proposals: 57 propostas concorrentes (teto 40)
791683 | 50 | dismissed | too_many_proposals: 50 propostas concorrentes (teto 40)
791631 | 43 | dismissed | too_many_proposals: 43 propostas concorrentes (teto 40)
```

`score` nulo nas três — nenhuma IA foi chamada.

**Guarda de reprocessamento:** rodando a mesma descoberta de novo, `screenedOut: 0`. As
descartadas foram puladas em vez de reavaliadas. Sem essa guarda, uma vaga descartada voltaria
na listagem a cada 10 minutos e seria reavaliada para sempre — e um descarte manual feito na
tela de revisão seria desfeito na rodada seguinte.

---

## 🔭 Observação sobre `urgency`

A nota do backlog sugeria rever o peso de `urgency` depois do filtro. **Não mexi, de propósito.**

O que puxava `urgency` para 4-5 de 20 eram justamente as vagas com 130-235 propostas — que agora
nem chegam à triagem. Entre as que sobrevivem ao filtro (até 40 concorrentes), a dimensão deve
pontuar naturalmente mais alto, sem mudar peso nenhum. Mexer nos pesos agora, antes de observar
o efeito, seria corrigir duas vezes o mesmo problema e arriscar inflacionar os scores.

Vale reavaliar depois de algumas dezenas de triagens sob o filtro.

---

## 📌 Notas para o Agent

Rever se `urgency` ainda faz sentido como dimensão depois do filtro. Se a concorrência alta vira
corte seco, o que sobra em `urgency` é só "publicada há pouco" — talvez mereça peso menor, e o
peso liberado vá para `skill_match`.
