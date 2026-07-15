# 🧩 FASE 07 — Expansão multi-plataforma de descoberta de vagas

## 📌 Status
Backlog (depende de `specs/current/fase_00_pivot_job_hunter.md` estar concluída e estável com
99Freelas)

---

## 🎯 Objetivo

Expandir a descoberta de vagas para além do 99Freelas, aumentando a cobertura de oportunidades
sem violar termos de uso das plataformas.

---

## 🧠 Contexto

`specs/current/fase_00_pivot_job_hunter.md` cobre apenas 99Freelas (listagens públicas, sem
necessidade de login). Esta fase trata da expansão para outras fontes, cada uma com suas próprias
restrições de acesso.

---

## 🔍 Plataformas candidatas

### LinkedIn — via método compatível com os termos de uso

LinkedIn proíbe scraping automatizado de suas páginas, mesmo com sessão logada do próprio
usuário. Scraping direto (Playwright com sessão autenticada) **não deve ser implementado** — risco
de restrição/banimento da conta pessoal do usuário.

Alternativas compatíveis a avaliar:

* **Job alerts por e-mail**: LinkedIn permite configurar alertas de vaga por e-mail; o sistema
  poderia consumir esses e-mails (IMAP/forward) e extrair as vagas de lá, sem tocar o site
  diretamente
* **RSS/exports oficiais**, se disponíveis para a busca configurada
* Reavaliar scraping direto apenas se LinkedIn disponibilizar uma API oficial de vagas acessível
  para o caso de uso

### Outras plataformas de freelance (BR/global)

Candidatas a avaliar quando esta fase for priorizada: Workana, Freelancer.com, Upwork. Cada uma
precisa da própria avaliação de ToS antes de qualquer scraping (ver `AGENT.md` §7).

---

## ⚙️ Requisitos não-funcionais

* RNF-01: nenhuma plataforma nova entra em produção sem uma avaliação explícita de ToS documentada
  nesta spec (atualizar antes de implementar)
* RNF-02: cada plataforma tem seu próprio módulo de scraping (`packages/scraper/platforms/<nome>.ts`),
  isolado — falha em uma plataforma não pode afetar as demais
* RNF-03: `JobPosting.platform` deve continuar identificando a origem de cada vaga

---

## 🧪 Critérios de aceite

* [ ] Para cada nova plataforma adicionada, existe uma seção nesta spec documentando a avaliação
  de ToS antes da implementação
* [ ] LinkedIn não é acessado via scraping direto em nenhuma circunstância, apenas pelos métodos
  compatíveis descritos acima
* [ ] Adicionar/remover uma plataforma não exige mudanças nos workers de match/proposal

---

## 📌 Notas para o Agent

* Não implementar scraping direto do LinkedIn sob nenhuma circunstância sem decisão explícita do
  usuário revertendo esta restrição
* Priorizar qualidade/estabilidade do 99Freelas antes de expandir
