# 🧩 FASE 13 — Loop de feedback: o sistema aprende se acertou

## 📌 Status
Backlog (depende de volume: só faz sentido com algumas dezenas de propostas enviadas)

---

## 🎯 Objetivo

Fechar o ciclo entre o score previsto e o resultado real, para que a triagem possa ser avaliada —
e eventualmente corrigida — com evidência em vez de intuição.

---

## 🧠 Contexto

`applied`, `won` e `lost` existem como status desde a fase 00 e **nada no código os lê**.
Confirmado por grep: as únicas ocorrências são a declaração do enum e a cláusula que os exclui da
tela de revisão.

Isso significa que o sistema não tem como saber se os scores dele têm qualquer relação com a
realidade. Se vinte propostas `APPLY` derem zero resposta, nada percebe — e o usuário continua
gastando tempo guiado por um número que pode ser ruído.

É a diferença entre uma ferramenta que gera texto e uma que melhora com o uso.

---

## 🏗️ Impacto na arquitetura

### Mínimo viável: taxa de conversão por faixa de score

Uma consulta agregada e um bloco na tela de revisão:

```
APPLY (70-100):  12 enviadas →  3 respostas (25%)
MAYBE (40-69):    8 enviadas →  2 respostas (25%)
```

Se as faixas converterem igual, o score é ruído — e **saber disso vale mais do que o score**.
Nenhuma IA envolvida; é SQL.

### Depois: realimentar o currículo

Com volume, as propostas que converteram viram insumo do prompt — não como exemplo a copiar (o
texto precisa continuar específico para cada vaga), mas para extrair quais argumentos e quais
realizações do currículo aparecem nas que ganharam.

---

## 🗄️ Mudanças no modelo de dados

- `applied_at`, `replied_at`, `closed_at TIMESTAMPTZ` — hoje só existe `updated_at`, que é
  sobrescrito e não permite medir tempo entre etapas
- `reply_received BOOLEAN` — resposta do cliente é o sinal mais cedo e mais frequente que
  "ganhou"; esperar por `won` dá amostra pequena demais

---

## 🔌 Mudanças de API

- `GET /stats` — conversão por faixa de score, por categoria e por modelo de IA
- a tela de revisão ganha um botão "cliente respondeu"

---

## 🧪 Critérios de aceite

- [ ] Marcar como enviada grava `applied_at`
- [ ] A tela mostra conversão por faixa de score
- [ ] As métricas distinguem o modelo que gerou a triagem (a cadeia de fallback pode trocar)
- [ ] Com amostra pequena, a tela diz que é pequena em vez de mostrar percentual enganoso

---

## 📌 Notas para o Agent

Cuidado com o viés óbvio: só existe resultado para vagas que o usuário escolheu enviar, e ele
escolhe pelo score. Vaga `SKIP` nunca recebe proposta, então nunca se saberá se o `SKIP` estava
errado. A métrica honesta compara `APPLY` com `MAYBE` enviadas — não "o score funciona".
