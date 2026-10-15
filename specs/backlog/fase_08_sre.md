# 🧩 FASE 08 — Hardening: segurança local, observabilidade e código órfão

## 📌 Status
Backlog

---

## 🎯 Objetivo

Fechar três lacunas em que o repositório hoje promete mais do que entrega.

---

## 🔒 1. A API está exposta na rede sem autenticação

```js
app.listen({ port, host: "0.0.0.0" })
```

`0.0.0.0` aceita conexão de qualquer interface. Numa rede compartilhada — café, coworking,
escritório — qualquer pessoa no mesmo Wi-Fi alcança:

| rota | o que vaza |
|------|-----------|
| `GET /resume-profile` | currículo completo, faixa de valor aceita, links pessoais |
| `GET /review` | rascunhos de proposta ainda não enviados |
| `GET /jobs` | histórico inteiro de candidaturas |
| `/queues` (Bull Board) | **escrita**: apagar, repetir e drenar filas |

O Bull Board é o mais grave: é uma UI administrativa sem login, com poder de destruir estado.

**Correção:** `host: 127.0.0.1` por padrão, com `API_HOST` para quem quiser expor
conscientemente. Sendo a ferramenta single-tenant e local (AGENT.md §14), não há caso de uso que
justifique o padrão aberto. Se a exposição virar necessária, aí sim entra autenticação — mas o
padrão não deve ser o inseguro.

---

## 📊 2. `packages/observability/` são três arquivos vazios

```
0 packages/observability/logger.ts
0 packages/observability/metrics.ts
0 packages/observability/tracing.ts
```

O pacote é declarado como dependência de `apps/worker` e não contém uma linha. Enquanto isso o
AGENT.md §11 exige que todo worker registre início, sucesso, falha, retry e tempo de execução — o
que hoje é feito com `logger` direto, e razoavelmente bem.

São duas decisões possíveis, e qualquer uma é melhor que a atual:

- **Deletar o pacote** e assumir que log estruturado via `pino` é a observabilidade do projeto.
  Coerente com uma ferramenta pessoal de instância única.
- **Implementar métricas de verdade** — contadores de vagas descobertas, chamadas de IA por
  modelo, tokens consumidos, custo de cota. Isso só se justifica junto da `fase_13`, que precisa
  de números.

O estado atual é o pior dos dois: a promessa no índice e nada atrás dela.

---

## 🧹 3. Código órfão do pivot B2B

A tabela `leads` e as funções `upsertLead` / `findLeadByWebsite` não são referenciadas por
ninguém desde o pivot (`fase_00`) — grep confirma que as únicas ocorrências são as próprias
definições. O mesmo vale para o DTO `create-lead` e o modelo `lead`.

Os utilitários genéricos de scraping (`scanSite`, `contacts`, `technologies`, `lighthouse`,
`metadata`) também ficaram sem consumidor, e são a única razão de o `playwright` continuar nas
dependências do `packages/scraper` — o scraper do 99Freelas passou a usar `fetch` + `cheerio` na
`fase_10`.

AGENT.md §4.2 proíbe código órfão. Remover derruba uma dependência pesada e encolhe a superfície
que precisa compilar e ser mantida.

**Atenção:** `tests/unit/scraper.test.ts` cobre parte desses utilitários e sairia junto.

---

## 🧪 Critérios de aceite

- [ ] A API escuta em `127.0.0.1` por padrão; `API_HOST` permite sobrepor
- [ ] `README` registra que expor na rede exige autenticação, que não existe
- [ ] `packages/observability` foi removido ou implementado — não fica vazio
- [ ] `tsc --noEmit` e a suíte passam depois da remoção do código órfão
- [ ] `playwright` sai de `packages/scraper` se nada mais o usar

---

## 📌 Notas para o Agent

Fazer o item 3 em commit separado dos outros dois: é uma remoção grande e mecânica, e misturá-la
com a mudança de segurança dificultaria revisar qualquer um dos dois.
