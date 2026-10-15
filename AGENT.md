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

Uma fila BullMQ **por estágio**, não uma fila genérica com `type` no payload.
Os estágios têm naturezas diferentes (descoberta é I/O de rede serial; triagem e
proposta batem em rate limit de IA), então concorrência, retry e profundidade são
configurados por estágio — e o Bull Board passa a mostrar onde o trabalho parou.

| Fila | Payload | Enfileirada por |
|------|---------|-----------------|
| `discovery` | `DiscoveryJobData` (query, category, maxPages, maxListings, maxAgeHours) | `POST /discovery/runs` |
| `triage` | `{ platform, externalId }` | `discovery.worker` — só vagas sem score |
| `proposal` | `{ platform, externalId, score? }` | `triage.worker` — só tier `APPLY` |

Contratos em `packages/queue/index.ts`. Enfileirar é sempre via
`enqueueDiscovery` / `enqueueTriage` / `enqueueProposal`, nunca `queue.add` direto.

`triage` e `proposal` usam `jobId` determinístico (`jobIdFor`) para que a mesma
vaga não seja pontuada duas vezes. Duas armadilhas do BullMQ aí:

* o separador **não pode ser `:`** — é reservado para as chaves do Redis
* um `add` cujo `jobId` já existe é ignorado **em silêncio**, inclusive quando o
  job existente está `failed`. Como as falhas são retidas de propósito, isso
  travaria a vaga para sempre — `releaseFinishedJobId` descarta o job já
  finalizado antes de enfileirar

---

## Retry policy

* maxAttempts: 3 (`QUEUE_ATTEMPTS`)
* exponential backoff, delay base 5s (`QUEUE_BACKOFF_DELAY_MS`)
* `removeOnFail: false` — falhas ficam retidas para inspeção e reprocessamento
  pelo Bull Board

---

# 🧠 6. AI SYSTEM RULES

## 6.1 Output must be structured

Todo output de IA tem um contrato em `packages/ai/contracts/`, e cada contrato
tem **duas** camadas:

* **schema de aceitação** (`rawTriageSchema`) — frouxo de propósito: aceita
  número fracionário, string numérica, valor fora de faixa. Modelos gratuitos
  erram esses detalhes com frequência, e gastar uma chamada extra para corrigir
  algo que sabemos consertar deterministicamente desperdiça cota.
* **contrato final** (`triageResultSchema`) — o que workers e banco consomem.

O normalizador (`normalizeTriage`, `normalizeProposal`) é a fronteira entre os
dois. Campos que o sistema impõe, por mais que o modelo os tenha escrito:

| Campo | Regra |
|-------|-------|
| `score` | Recalculado como a soma das dimensões |
| `tier` | Derivado do score pelos limiares de `TIER_THRESHOLDS` |
| `dimensions.*` | Arredondadas e limitadas a `DIMENSION_WEIGHTS` |
| `confidence` | Reescalada de 0-100 para 0-1 quando vem em porcentagem |

Mudar os pesos em `DIMENSION_WEIGHTS` muda a rubrica do prompt e o schema
enviado ao provider — os três leem a mesma constante.

---

## 6.2 AI provider

**Só OpenRouter.** Ele já é um roteador para dezenas de modelos, inclusive os
gratuitos; manter provedores irmãos duplicaria a abstração que ele oferece.
Trocar de modelo é editar o `.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODELS=modelo-a:free,modelo-b:free
```

`OPENROUTER_MODELS` é uma **cadeia de fallback**. Dentro de cada modelo o cliente
tenta três modos de output em ordem decrescente de garantia —
`json_schema` → `json_object` → schema inline no prompt — porque nem todo modelo
gratuito aceita `response_format`. Cair de modo não perde garantia real: o
contrato é imposto localmente pelo normalizador.

O tier gratuito tem cota **por modelo**, então esgotar um e passar ao próximo é o
que mantém o pipeline vivo. Para revalidar a lista de modelos gratuitos:

```bash
curl -s https://openrouter.ai/api/v1/models | jq '.data[] | select(.id | endswith(":free")) | {id, supported_parameters}'
```

---

## 6.3 No free-form AI usage

Nenhuma chamada de IA pode ser feita sem contrato definido. Em termos práticos:
nenhuma chamada fora de `OpenRouterProvider`, cuja API exige um
`responseFormat` e um `normalize`.

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

Scraping outputs seguem `ScrapedJobPosting`
(`packages/scraper/platforms/99freelas/types.ts`) — o tipo é a fonte da verdade,
não este bloco.

Notas de implementação do 99Freelas, que não são óbvias pelo tipo:

* A URL de listagem é **`/projects`**. `/projetos` devolve 404.
* As páginas são **renderizadas no servidor** — é `fetch` + `cheerio`, não
  Playwright. Subir um Chromium para ler markup estático custaria segundos e
  megabytes por run.
* A listagem já traz **tudo menos o orçamento**, inclusive a descrição integral
  no atributo `data-content` (o texto visível é truncado). Só o orçamento exige
  a página de detalhe.
* Filtros que funcionam como query string: `page`, `q`, `categoria`. Ordenação,
  data de publicação e ranking do cliente são aplicados via XHR na UI e não têm
  equivalente em GET — idade de publicação é filtrada localmente
  (`maxAgeHours`).
* `budgetType` tem **`'open'`**: o cliente publicou sem definir faixa. É
  diferente de `'unknown'`, que é "não conseguimos ler o campo".
* `clientRating` é `null`, não `0`, para cliente sem histórico. O site manda
  `data-score="0.0"` nesse caso, e manter o zero faria a IA tratar cliente novo
  como cliente mal avaliado.

Os parsers são funções puras testadas contra **fixtures de HTML real**
(`tests/fixtures/99freelas/`). Ao mexer em seletor, capture uma fixture nova
primeiro — testes verdes contra fixture antiga não dizem nada sobre o site de
hoje.

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
