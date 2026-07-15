# 🧩 FASE 05 — Gerador de rascunho de proposta

## 📌 Status
Completed — implementado junto com `specs/completed/fase_00_pivot_job_hunter.md`
(`packages/ai/schemas/proposal-draft.schema.ts`, `packages/ai/prompts/proposal-draft.prompt.ts`,
`apps/worker/src/workers/proposal.worker.ts`). RF-02 (sem envio automático) respeitado — o worker
apenas persiste `proposalDraft` e move o status para `proposal_ready`.

---

## 🎯 Objetivo

Gerar, via IA, um rascunho de proposta personalizado para cada vaga com `tier: "APPLY"`, usando o
currículo do usuário e a descrição da vaga como input.

Substitui a automação de outbound B2B original (e-mails comerciais para empresas). Aqui o
destinatário é o cliente da vaga, e o objetivo é ajudar o usuário a se candidatar mais rápido —
não substituir a decisão dele.

---

## 🏗️ Escopo

```text
Match AI (tier: APPLY) → Proposal Draft AI → Storage (status: proposal_ready)
```

Worker: `proposal.worker.ts`, consumindo jobs `type: "proposal-draft"`.

---

## ⚙️ Requisitos funcionais

### RF-01 — Geração do rascunho

A partir de `JobPosting` (título, descrição, skills) + `ResumeProfile` (bio, skills, roles), a IA
gera um texto de proposta em primeira pessoa, mencionando experiência relevante do usuário para
aquele escopo específico.

### RF-02 — Sem envio automático

**Decisão explícita**: o sistema gera o rascunho e para. Não há integração com a API de
mensagens do 99Freelas (ou qualquer plataforma) para enviar a proposta automaticamente. O envio é
sempre manual, feito pelo usuário após revisar o texto.

### RF-03 — Revisão obrigatória

O rascunho fica com `status: "proposal_ready"` até o usuário marcar como `applied` — sinalizando
que revisou e enviou manualmente.

---

## 📤 Output esperado

```json
{
  "proposalDraft": "Olá! Tenho experiência direta com [skill X] e já entreguei projetos similares a [descrição do escopo]. ...",
  "generatedAt": "2026-07-15T12:00:00Z"
}
```

---

## ⚙️ Requisitos não-funcionais

* RNF-01: geração isolada por vaga — falha em uma não trava as demais
* RNF-02: nunca enviar a proposta automaticamente para a plataforma de origem
* RNF-03: rascunho deve referenciar elementos concretos da vaga (não genérico/copiável para
  qualquer vaga)

---

## 🧱 Impacto na arquitetura

### AI Layer

* novo prompt `packages/ai/prompts/proposal-draft.prompt.ts`
* novo schema `packages/ai/schemas/proposal-draft.schema.ts`

### Worker Layer

* novo `proposal.worker.ts`

### Queue Layer

* novo job type: `proposal-draft` (já registrado em `AGENT.md` §5)

---

## 🧪 Critérios de aceite

* [ ] Toda vaga com `tier: "APPLY"` recebe um rascunho de proposta
* [ ] Nenhum envio automático ocorre em nenhuma circunstância
* [ ] Rascunho referencia elementos específicos da vaga (skill, escopo) e não é template genérico

---

## 📌 Notas para o Agent

* Auto-apply (envio automático) é uma decisão explícita do usuário para o futuro, não implementar
  sem essa autorização direta
* Priorizar qualidade e especificidade do rascunho sobre volume
