# 🧩 FASE 00 — Pivot: De Lead Hunter (B2B) para Job Hunter (pessoal)

## 📌 Status
Completed — modelos, scraper do 99Freelas, IA de match/proposta, workers e endpoints
implementados. Ver `specs/current/fase_09_unittest.md` para o próximo passo (cobertura de testes
sobre o que foi construído aqui).

---

## 🎯 Objetivo

Reorientar o sistema, que hoje faz prospecção B2B (scraping de sites de empresas para
qualificar leads de venda), para um **buscador pessoal de vagas/projetos freelance**.

O sistema deve descobrir oportunidades públicas em plataformas de freelance, comparar cada
oportunidade com o currículo/perfil do usuário e destacar as que valem a pena — gerando um
rascunho de proposta para as mais compatíveis.

---

## 🧠 Contexto

O sistema atual (`specs/completed/fase_01_pipeline.md`, `specs/completed/fase_02_enrichment.md`)
foi construído para: escanear o site de uma empresa, extrair stack técnica/performance/contatos,
e pontuar a empresa como oportunidade de venda (`dor_técnica`, `maturidade_digital`, `urgência`,
`potencial_financeiro`).

Essa direção não serve ao objetivo atual do usuário. O que se quer agora é o inverso: em vez de
avaliar empresas como alvo de venda, avaliar **vagas/projetos** como alvo de candidatura, usando
o próprio currículo como critério de comparação.

Decisões já tomadas para este pivot:
- **Ação do sistema**: descobrir vaga → pontuar compatibilidade → gerar rascunho de proposta.
  Não há envio automático de candidatura (auto-apply fica fora de escopo).
- **Plataforma desta fase**: apenas **99Freelas** (listagens públicas, sem necessidade de bypass
  de login). LinkedIn fica fora de escopo até existir uma abordagem compatível com os termos de
  uso da plataforma (ver `specs/backlog/fase_07_discovery.md`).
- **Currículo**: representado como arquivo estruturado (JSON/YAML) versionado no repositório,
  como fonte da verdade para o match.
- **Multi-tenant**: fora de escopo. O sistema é single-tenant, para uso pessoal
  (`specs/backlog/fase_06_multitenant.md`).

---

## 🏗️ Escopo da fase

```text
API → Queue → Worker → [Job Scraper: 99Freelas] → [Match AI] → [Proposal Draft AI] → DB
```

Dentro do escopo:
- Modelo de dados de vaga (`JobPosting`) e de perfil (`ResumeProfile`)
- Scraper de listagens + detalhe de vagas do 99Freelas
- Deduplicação por `platform + externalId`
- Cálculo de compatibilidade (match score) entre vaga e currículo
- Geração de rascunho de proposta para vagas com tier alto

Fora do escopo (ficam em backlog, tratados em fases próprias):
- Auto-apply / envio automático de proposta
- Scraping do LinkedIn
- CRM/kanban de candidaturas com UI (`fase_04`)
- Multi-tenant (`fase_06`)
- Outras plataformas além do 99Freelas (`fase_07`)

---

## 📐 Data model changes

### Novo: `ResumeProfile` (`packages/shared/models/resume-profile.ts`)

```ts
interface ResumeProfile {
  id?: number;
  name: string;
  headline: string;
  seniority: "junior" | "pleno" | "senior" | "especialista";
  skills: string[];
  roles: string[];              // ex: "Backend Developer", "Automação de scraping"
  stack: string[];               // tecnologias que domina
  minRate: number | null;
  maxRate: number | null;
  currency: string;              // "BRL", "USD"
  availability: "full-time" | "part-time" | "project-based";
  remotePreference: "remote-only" | "hybrid" | "onsite-ok";
  languages: string[];
  bio: string;
  updated_at?: Date;
}
```

Fonte da verdade: arquivo versionado no repo (ex: `config/resume-profile.json`), carregado pela
API/worker. Sem UI de edição nesta fase — edição é manual, via commit.

### Novo: `JobPosting` (`packages/shared/models/job-posting.ts`)

```ts
interface JobPosting {
  id?: number;
  platform: string;              // "99freelas"
  externalId: string;
  url: string;
  title: string;
  description: string;
  skills: string[];
  budgetType: "fixed" | "hourly" | "unknown";
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  clientName: string | null;
  clientRating: number | null;
  proposalsCount: number | null;
  postedAt: Date | null;
  score: number | null;
  tier: "APPLY" | "MAYBE" | "SKIP" | null;
  dimensions: MatchDimensions | null;
  reason: string | null;
  redFlags: string[];
  proposalDraft: string | null;
  status: "discovered" | "reviewing" | "proposal_ready" | "applied" | "dismissed";
  created_at?: Date;
  updated_at?: Date;
}
```

### Novo: `MatchDimensions` / `MatchResult` (`packages/shared/dto/match.dto.ts`)

Detalhado em `specs/backlog/fase_03_ai.md`.

### Depreciado (mantido apenas como histórico)

`packages/shared/models/lead.ts`, `company.ts` e o pipeline de enrichment de empresa
(`technologies.ts`, `lighthouse.ts`, extração de socials/contatos em `metadata.ts`) foram
construídos para o domínio B2B e **não se aplicam** ao domínio de vagas. Não devem ser estendidos;
novo código de scraping de vagas vive em um módulo próprio (ex: `packages/scraper/platforms/99freelas.ts`).

---

## 🔌 API changes

* `POST /resume-profile` — upsert do currículo estruturado (registro único, single-tenant)
* `POST /discovery/runs` — dispara um ciclo de scraping do 99Freelas (enfileira jobs `scrape`)
* `GET /jobs?tier=APPLY` — lista vagas descobertas, filtráveis por tier/status
* `POST /leads` — deprecado nesta fase (mantido apenas até a migração ser validada; não deve
  ganhar novas features)

---

## ⚙️ Worker changes

* Novo `job-discovery.worker.ts` — consome jobs `type: "scrape"`, roda o scraper do 99Freelas,
  persiste `JobPosting` com dedupe por `platform + externalId`
* Novo `match.worker.ts` — consome jobs `type: "ai-score"`, chama `packages/ai` com o prompt de
  compatibilidade (vaga + `ResumeProfile`), grava `score`, `tier`, `dimensions`, `reason`, `redFlags`
* Novo `proposal.worker.ts` — consome jobs `type: "proposal-draft"`, gerado apenas para vagas com
  `tier: "APPLY"`; grava `proposalDraft` e move `status` para `proposal_ready`
* `enrichment.worker.ts` (atual, orientado a empresa) — não é reaproveitado nesta fase

---

## 🔔 Notificação

Quando uma vaga atinge `tier: "APPLY"` e o rascunho de proposta é gerado, o usuário deve ser
avisado (canal exato — e-mail, Telegram, etc. — a definir na implementação; não bloqueia esta
spec). Sem notificação, o valor do sistema depende de o usuário checar o dashboard manualmente.

---

## 🧪 Critérios de aceite

* [ ] `ResumeProfile` estruturado existe, é versionado e é lido pelo pipeline de match
* [ ] Scraper do 99Freelas descobre vagas novas e persiste sem duplicar (`platform + externalId`)
* [ ] Toda vaga nova recebe um `MatchResult` estruturado e validado por schema
* [ ] Vagas com `tier: "APPLY"` recebem rascunho de proposta gerado por IA
* [ ] Nenhuma chamada de scraping ao LinkedIn ocorre nesta fase
* [ ] Sistema opera single-tenant, sem isolamento multi-usuário

---

## 📌 Notas para o Agent

* Esta fase substitui o objetivo original do sistema (prospecção B2B) — não reintroduzir
  linguagem ou lógica de "lead de venda" em código novo
* Não implementar auto-apply (envio automático de candidatura) nesta fase
* Não implementar scraping do LinkedIn nesta fase
* Reaproveitar a infraestrutura de fila, observability e abstração de provedores de IA
  (`packages/queue`, `packages/observability`, `packages/ai`) — são domain-agnostic
* Não reaproveitar a lógica de enrichment de empresa (tech stack/lighthouse/social) — não se
  aplica a vagas
* Ao concluir, mover esta spec para `specs/completed/` e criar a próxima em `specs/current/`
  conforme o ciclo de vida definido em `AGENT.md` §8.2
