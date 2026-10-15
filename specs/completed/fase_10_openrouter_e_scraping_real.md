# Fase 10 — OpenRouter gratuito + scraping real do 99Freelas

## Objective

Tornar o pipeline executável de ponta a ponta com custo zero de IA:

1. OpenRouter como **único** provedor, rodando em modelos gratuitos (`:free`).
2. Um **padrão de output** imposto pelo sistema, não confiado ao modelo.
3. Scraping do 99Freelas que realmente funciona contra o site ao vivo.
4. Filas separadas por estágio, para enxergar onde o trabalho está parado.

## Architecture impact

### Provedor de IA

Gemini e Ollama foram removidos. O OpenRouter já é um roteador para dezenas de
modelos — manter provedores irmãos duplicava a abstração que ele oferece.
Trocar de modelo passou a ser editar `OPENROUTER_MODELS` no `.env`.

O cliente (`packages/ai/providers/openrouter/client.ts`) percorre uma **cadeia de
modelos gratuitos** e, dentro de cada modelo, três **modos de output** em ordem
decrescente de garantia:

| Modo | Garantia | Quando é usado |
|------|----------|----------------|
| `json_schema` | Provider valida a forma antes de devolver | Modelos que anunciam `structured_outputs` |
| `json_object` | JSON sintaticamente válido, forma não garantida | Modelos que só aceitam `response_format` |
| `prompt` | Nenhuma; schema vai inline na mensagem de sistema | Modelos que rejeitam `response_format` |

Cair de modo não perde garantia real, porque o contrato é imposto localmente.
O tier gratuito tem cota **por modelo**, então esgotar um e passar ao próximo é
o comportamento que mantém o pipeline vivo.

### Padrão de output

`packages/ai/contracts/` separa duas coisas que antes eram uma:

- **schema de aceitação** (`rawTriageSchema`) — frouxo de propósito: aceita
  número fracionário, string numérica, campo fora de faixa. Modelos gratuitos
  erram esses detalhes o tempo todo e gastar uma chamada extra para corrigir
  algo que sabemos consertar deterministicamente é desperdício de cota.
- **contrato final** (`triageResultSchema`) — o que workers e banco consomem.

`normalizeTriage` é a fronteira entre os dois. Duas coisas o modelo **não**
decide, por mais que as escreva:

- `score` é recalculado como a soma das dimensões. Um score que não corresponde
  às dimensões torna a explicação inútil.
- `tier` é derivado do score pelos limiares. Senão o mesmo score produziria
  tiers diferentes entre modelos da cadeia — e é o tier que dispara a fila de
  proposta.

Red flags entram no score **pelas dimensões** (o prompt instrui isso) e não
rebaixam o tier automaticamente: um rebaixamento silencioso deixaria o score
exibido inconsistente com a decisão tomada.

A proposta deixou de ser uma string e virou objeto (`summary`, `body`,
`key_points`, `questions`, `estimated_days`, `suggested_price`). Dá para bater o
olho nos tópicos e nas perguntas e decidir se vale abrir o rascunho inteiro.

### Scraping

A URL estava errada: `/projetos` devolve **404**, a real é `/projects`. Como
nada no pipeline chegava a rodar, o erro nunca apareceu.

As páginas são renderizadas no servidor, então Playwright saiu e entrou
`fetch` + `cheerio`. A listagem já traz **tudo menos o orçamento** — inclusive a
descrição integral, no atributo `data-content`. Subir um Chromium para ler
markup estático custaria segundos e megabytes por run.

Filtros que funcionam como query string: `page`, `q`, `categoria`. Ordenação,
data de publicação e ranking do cliente são aplicados via XHR na UI e não têm
equivalente em GET — idade de publicação é filtrada localmente (`maxAgeHours`).

### Filas

Uma fila `leads` com `type` no payload virou três filas nomeadas:
`discovery`, `triage`, `proposal`. Os estágios têm naturezas diferentes —
descoberta é I/O de rede serial, triagem e proposta batem em rate limit de IA —
e com uma fila só, "10 jobs pendentes" não dizia se faltava scrapear ou triar.

## Data model changes

`0003_triage_and_proposal_contract.sql`:

- campos que o scraper extrai e não tinham coluna: `client_reviews_count`,
  `interested_count`, `category`, `subcategory`, `experience_level`,
  `is_urgent`, `is_featured`, `expires_at`
- contrato de triagem: `matched_skills`, `missing_skills`,
  `recommended_action`, `confidence`, `triage_model`
- contrato de proposta: `proposal_summary`, `proposal_key_points`,
  `proposal_questions`, `proposal_estimated_days`,
  `proposal_suggested_price`, `proposal_currency`, `proposal_model`
- status `reviewing` → `triaged` (o nome antigo sugeria ação humana pendente,
  quando é o estado "a IA pontuou, aguardando decisão")
- `budget_type` ganhou `'open'`: o cliente publicou sem definir faixa, o que é
  diferente de `'unknown'` (não conseguimos ler o campo)

## Bugs encontrados rodando o pipeline de verdade

Três defeitos que só apareceram no primeiro run end-to-end:

1. **`Custom Id cannot contain :`** — o BullMQ reserva `:` para suas chaves no
   Redis. O separador do `jobId` virou `__`.
2. **`jobId` determinístico + `removeOnFail: false` travava a vaga para
   sempre** — o BullMQ ignora em silêncio um `add` cujo id já existe, inclusive
   quando o job existente está `failed`. Uma vaga que falhasse na triagem nunca
   mais seria reprocessada. `releaseFinishedJobId` descarta o job finalizado
   antes de enfileirar; um job ainda `waiting`/`active` é preservado, porque aí
   descartar o duplicado é justamente a intenção.
3. **Upsert parcial sempre estourava** — o Postgres valida `NOT NULL` ao formar
   a tupla do `INSERT`, antes de resolver o `ON CONFLICT`. Um upsert só com
   `{score, tier}` violava `url NOT NULL` mesmo com a linha já existindo.
   Triagem e proposta passaram a usar `updateJobPostingByRef` (UPDATE puro).

Um quarto, de persistência: pré-serializar `dimensions` com `JSON.stringify`
somava com a serialização do `postgres.js` e gravava a string JSON como escalar
de texto dentro do `jsonb`. Objetos vão crus; `dimensions->>'skill_match'`
agora responde.

## Success criteria

- [x] `POST /discovery/runs` → projetos reais do 99Freelas no banco, com
      orçamento, skills, cliente, contadores e timestamps
- [x] Bull Board mostra as três filas separadamente
- [x] Vagas descobertas chegam à fila de triagem
- [x] Tier `APPLY` chega à fila de proposta; `MAYBE`/`SKIP` param no banco
- [x] Contrato imposto localmente: score recalculado, tier derivado, dimensões
      limitadas, JSON recuperado de fences e prosa
- [x] `tsc --noEmit` limpo e suíte verde (108 testes)
- [x] Validado contra a API real do OpenRouter, com o primeiro modelo da cadeia
      (`nvidia/nemotron-3-super-120b-a12b:free`) em modo `json_schema`:
      ~2k tokens de prompt, 20-24s por triagem, `aiAttempts: 1`

## Calibragem: dimensões não avaliáveis

O primeiro run com modelo real expôs um problema que o stub não mostrava: as
cinco vagas triadas pontuaram 46-66, todas `MAYBE`, nenhuma chegando a `APPLY`.

| | skill_match | rate_fit | seniority | urgency | score |
|---|---|---|---|---|---|
| peso | 40 | 20 | 20 | 20 | 100 |
| observado | 20-38 | **10 sempre** | 12-18 | **4-5** | 46-66 |

`rate_fit` estava travado em 10 porque **14 de 14** projetos tinham orçamento
"Aberto" e a rubrica original mandava pontuar metade da faixa nesse caso — a
dimensão virou constante. Com `urgency` estruturalmente baixa (todo projeto no
99Freelas tem dezenas de propostas), o teto efetivo do score era 75, o que
exigia skill_match e seniority_fit quase perfeitos para alcançar `APPLY`.

A correção: dimensão sem dado **sai do cálculo** e o score é renormalizado sobre
os pesos restantes (`scoreFromDimensions`). Com orçamento aberto:

```
score = (skill_match + seniority_fit + urgency) / 80 × 100
```

O score passa a significar "% de aderência no que deu para avaliar", fica na
mesma escala de uma vaga com orçamento definido, e os limiares de tier seguem
valendo sem ajuste. A exclusão vem do `budget_type` do scraper — fato observável
— e é persistida em `unassessed_dimensions` (migration 0004) para a explicação
não mentir: 71 sobre três dimensões não é a mesma coisa que 71 sobre quatro.

Verificado com modelo real: `790517` ("Sistema web para gerar mapas
numerológicos", orçamento aberto) pontuou 35+18+4 = 57 de 80 disponíveis → **71,
`APPLY`**, e seguiu sozinha para a fila de proposta. A mesma vaga daria 57 e
`MAYBE` na regra anterior.

## Tela de revisão

O pipeline parava no banco: para ler um rascunho era preciso `curl` ou `psql`.
Como a etapa final é humana por design (nada é enviado automaticamente), faltava
o lugar onde essa etapa acontece.

`GET /review` serve HTML renderizado no servidor — sem build de frontend, sem
dependência nova. A raiz redireciona para lá, porque é o que se quer ver ao
abrir `localhost:3000`.

Decisões:

- **Fila de trabalho, não histórico.** `listProposalsForReview` exclui
  `applied`/`won`/`lost`/`dismissed`; marcar como enviada tira o item da tela.
- **Escape de HTML obrigatório.** Título e descrição vêm de páginas públicas de
  terceiros e o corpo da proposta vem de um LLM — qualquer um dos dois pode
  carregar `<script>`.
- **Dimensão excluída aparece riscada**, com o aviso "score sobre N de 4
  dimensões". Mostrar o `rate_fit: 0` como se fosse nota mentiria sobre o score.
- **`<textarea>` em vez de `<pre>`**: o rascunho precisa de correção antes de ir
  para o 99Freelas, e o modelo gratuito erra concordância com frequência.
- O `navigator.clipboard` exige contexto seguro; em `http://` o botão seleciona
  o texto e avisa "use Ctrl+C" em vez de falhar em silêncio.

## Próximos passos

1. Reconferir a cadeia de modelos periodicamente: o tier gratuito do OpenRouter
   muda de composição com frequência.
2. Separar o banco do n8n — hoje as duas aplicações dividem o database `leads`
   (115 tabelas do n8n convivem com `job_postings`).
3. `urgency` ainda é estruturalmente baixa (4-5 de 20) porque todo projeto tem
   muitas propostas. Vale avaliar se a rubrica deveria comparar o número de
   propostas com a *mediana da plataforma* em vez de com zero.
4. O modelo deixou `proposal_summary` vazio e `estimated_days`/`suggested_price`
   nulos em todas as propostas reais. São opcionais por contrato, mas vale
   reforçar o prompt se esses campos forem usados na revisão.
