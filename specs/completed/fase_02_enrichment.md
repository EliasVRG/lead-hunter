# 🧩 FASE 02 — Enriquecimento Inteligente

## 📌 Status
Backlog

---

## 🎯 Objetivo

Adicionar uma camada de enriquecimento de dados no pipeline de leads, transformando empresas básicas (nome + site) em perfis completos e acionáveis.

O sistema deve extrair informações públicas relevantes para qualificação de leads.

---

## 🧠 Contexto

Atualmente o pipeline já possui:

- descoberta de leads
- scraping básico de sites
- análise inicial via IA
- score de oportunidade

Porém ainda não há uma camada estruturada de enriquecimento de dados, o que limita a qualidade do scoring e da abordagem comercial.

---

## 🏗️ Escopo da Fase

Esta fase adiciona um novo estágio no pipeline:

Scraper → Enrichment → AI → Storage

---

## ⚙️ Novo Componente

### enrichment.worker.ts

Responsável por processar empresas e enriquecer seus dados com informações públicas adicionais.

---

## 📥 Inputs

O worker recebe:

```json
{
  "companyId": "string",
  "name": "string",
  "website": "string"
}
```

---

## 📤 Outputs Esperados

```json
{
  "company": "string",
  "emails": ["string"],
  "phones": ["string"],
  "socials": {
    "linkedin": "string",
    "instagram": "string",
    "facebook": "string"
  },
  "tech": ["WordPress", "Cloudflare"],
  "cms": "string",
  "performance": number,
  "lighthouse": {
    "performance": number,
    "accessibility": number,
    "seo": number
  }
}
```

---

## 🔍 Coleta de Dados

### RF-01 — Emails Públicos

Extrair emails visíveis em:

* site principal
* página de contato
* rodapé

---

### RF-02 — Telefones

Extrair telefones públicos do site e páginas institucionais.

---

### RF-03 — Redes Sociais

Detectar links de:

* LinkedIn
* Instagram
* Facebook

---

### RF-04 — Tecnologias do Site

Detectar stack tecnológica:

* CMS (WordPress, etc)
* frameworks frontend
* analytics tools
* CDN (Cloudflare etc)

---

### RF-05 — Performance

Executar análise via Lighthouse ou equivalente:

* performance score
* SEO score
* accessibility score

---

### RF-06 — CMS Detection

Identificar CMS com base em:

* meta tags
* estrutura HTML
* headers
* fingerprints conhecidos

---

## ⚙️ Requisitos Não-Funcionais

* RNF-01: não pode bloquear pipeline principal
* RNF-02: scraping deve respeitar rate limits
* RNF-03: falhas devem ser isoladas por empresa
* RNF-04: worker deve ser stateless

---

## 🧱 Impacto na Arquitetura

### Worker Layer

* adicionar enrichment.worker.ts

---

### Queue Layer

* novo job type: `enrichment`

---

### Database

* adicionar tabela/colunas para:

  * emails
  * phones
  * socials
  * tech stack
  * performance metrics

---

## 🧪 Critérios de Aceite

A fase será considerada concluída quando:

* [ ] Pelo menos 80% dos sites processados retornam enrichment parcial
* [ ] Emails públicos são extraídos quando disponíveis
* [ ] Tecnologias são detectadas corretamente
* [ ] Performance Lighthouse é registrada
* [ ] Nenhum job de enrichment quebra o pipeline principal

---

## 📊 Métricas de Sucesso

* Taxa de enriquecimento: > 70%
* Tempo médio por empresa: < 15s
* Falhas isoladas: 100%
* Dados estruturados válidos: > 95%

---

## 🚀 Resultado Esperado

Após esta fase, cada lead terá um perfil enriquecido contendo:

* contatos
* presença digital
* stack tecnológico
* qualidade técnica do site
* sinais de maturidade digital

Isso permitirá um scoring de IA muito mais preciso e contextualizado.

---

## 📌 Notas para o Agent

* Não alterar pipeline base
* Não misturar enrichment com AI scoring
* Garantir isolamento de falhas por empresa
* Priorizar dados públicos e não intrusivos