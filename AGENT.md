# 🤖 Job Hunter — Autonomous Agent System

Este repositório é operado por um sistema de desenvolvimento assistido por agente.

O objetivo do agente é:
- planejar
- implementar
- testar
- documentar
- evoluir o sistema

sempre seguindo arquitetura e specs definidos.

> ⚠️ Este projeto era originalmente um "Lead Hunter" B2B (scraping de sites de empresas para
> prospecção de vendas). A partir da spec `specs/current/fase_00_pivot_job_hunter.md` ele foi
> reorientado para um **Job Hunter pessoal**: descobrir vagas/projetos freelance (começando por
> 99Freelas), comparar cada vaga com o currículo/perfil do usuário e gerar rascunhos de proposta
> para as oportunidades compatíveis. É uma ferramenta **single-tenant**, para uso do próprio
> usuário — multi-tenant/SaaS está fora de escopo (ver `specs/backlog/fase_06_multitenant.md`).

---

# 🧠 1. PRINCÍPIOS FUNDAMENTAIS

## 1.1 Spec-first development
Nenhuma feature pode ser implementada sem uma spec em `/specs/current`.

---

## 1.2 Separation of concerns

- `apps/api` → entrada de dados e HTTP layer
- `apps/worker` → processamento assíncrono
- `packages/*` → lógica reutilizável
- `infra/*` → infraestrutura e serviços externos

---

## 1.3 Queue-first architecture

Todo processamento pesado deve ser:

API → Queue → Worker

Nunca síncrono.

---

## 1.4 AI is a service, not logic

Toda interação com IA deve ser feita via:

`packages/ai`

Nunca diretamente nos workers.

---

## 1.5 Observability by default

Toda ação importante deve conter:
- log estruturado
- tracing (quando disponível)
- métricas (quando aplicável)

---

# 🧩 2. SYSTEM ARCHITECTURE

```text
API → Redis Queue → Worker → Scraper → AI → Database → Dashboard
```

---

# 📦 3. CODE OWNERSHIP RULES

## apps/api

Responsável por:

* receber requests
* validar input
* criar jobs na fila
* expor endpoints

NÃO pode:

* fazer scraping
* chamar IA diretamente
* processar dados pesados

---

## apps/worker

Responsável por:

* consumir jobs
* scraping
* enriquecimento
* IA
* persistência

NÃO pode:

* expor HTTP endpoints
* receber requests externos

---

## packages/*

Responsável por:

* lógica reutilizável
* integração com APIs externas
* abstrações (AI, scraper, queue, database)

---

# 🧠 4. DEVELOPMENT WORKFLOW

## 4.1 Feature lifecycle

Toda feature segue:

```text
1. Spec creation (/specs/current)
2. Design review (/docs or ADR if needed)
3. Implementation in packages/
4. Integration in apps/
5. Tests
6. Documentation update
7. Move spec to /specs/completed
```

---

## 4.2 Rule: No orphan code

Nenhum código pode existir fora de:

* apps/
* packages/

---

# ⚙️ 5. QUEUE CONTRACT

Todos os jobs devem seguir padrão:

```ts
{
  id: string,
  type: "scrape" | "ai-score" | "enrichment" | "proposal-draft",
  payload: object,
  attempts: number,
  createdAt: Date
}
```

* `scrape` → descoberta de vagas em uma plataforma (ex: 99Freelas)
* `ai-score` → cálculo do match entre uma vaga e o perfil/currículo do usuário
* `enrichment` → enriquecimento opcional de dados da vaga/cliente (reservado; não usado no MVP do pivot)
* `proposal-draft` → geração de rascunho de proposta para vagas com tier de alta compatibilidade

---

## Retry policy

* maxAttempts: 3
* exponential backoff
* dead-letter queue for failures

---

# 🧠 6. AI SYSTEM RULES

## 6.1 Output must be structured

Toda resposta de IA deve seguir schema validado:

```json
{
  "score": number,
  "reason": string,
  "tags": string[],
  "confidence": number
}
```

---

## 6.2 AI providers

O sistema pode usar:

* Gemini
* OpenRouter
* Ollama

A seleção é feita por config:

```env
AI_PROVIDER=gemini
```

---

## 6.3 No free-form AI usage

Nenhuma chamada de IA pode ser feita sem schema definido.

---

# 🕷️ 7. SCRAPING RULES

Scraping deve respeitar:

* only public data
* no authentication bypass
* no intrusion
* rate limiting
* robots.txt awareness

Plataformas com listagens públicas (ex: 99Freelas) estão dentro de escopo. Plataformas cujas
vagas exigem login para serem visualizadas (ex: LinkedIn) estão **fora de escopo** até existir
uma abordagem compatível com os termos de uso (ex: parsing de e-mail/RSS de job alerts) — ver
`specs/backlog/fase_07_discovery.md`.

---

Scraping outputs (job postings) must be:

```json
{
  "platform": string,
  "externalId": string,
  "url": string,
  "title": string,
  "description": string,
  "skills": string[],
  "budgetType": "fixed" | "hourly" | "unknown",
  "budgetMin": number | null,
  "budgetMax": number | null,
  "currency": string | null,
  "clientName": string | null,
  "clientRating": number | null,
  "proposalsCount": number | null,
  "postedAt": string,
  "status": number
}
```

---

# 🧾 8. SPEC SYSTEM

## 8.1 Active spec

Sempre existe apenas 1:

```
/specs/current
```

---

## 8.2 Lifecycle

* current → backlog → completed

---

## 8.3 Spec format

Cada spec deve conter:

* objective
* architecture impact
* API changes
* worker changes
* data model changes
* success criteria

---

# 🧱 9. ARCHITECTURE DECISIONS (ADR)

Toda decisão estrutural deve ser registrada em:

```
/docs/decisions/
```

Formato:

* context
* decision
* alternatives
* consequences

---

# 🧪 10. TESTING RULES

* unit tests obrigatórios para packages/
* integration tests para workers
* e2e para pipeline completo

---

# 📊 11. OBSERVABILITY RULES

Todo worker deve registrar:

* job start
* job success
* job failure
* retry count
* execution time

Logs devem ser estruturados.

---

# 🚀 12. AUTONOMOUS EXECUTION MODE

Quando operando como agente, seguir ciclo:

```text
READ SPEC
↓
UNDERSTAND IMPACT
↓
PLAN CHANGES
↓
MODIFY PACKAGES FIRST
↓
INTEGRATE INTO APPS
↓
TEST
↓
UPDATE DOCS
```

---

# ❌ 13. FORBIDDEN ACTIONS

* scraping private data
* bypassing authentication
* writing business logic in API layer
* skipping queue system
* implementing features without spec

---

# 🧠 14. GOAL OF THE SYSTEM

Transform public job/freelance listings into:

* oportunidades relevantes para o perfil e currículo do usuário
* scores de compatibilidade explicáveis (skill, senioridade, remuneração, urgência)
* rascunhos de proposta prontos para revisão

via pipeline automatizado, para uso pessoal (single-tenant).
