export function buildLeadScorePrompt(lead: any): string {
  const website = lead.website || "N/A";
  const title = lead.title || "";
  const meta = lead.meta || "";
  const techStack = Array.isArray(lead.tech_stack) ? lead.tech_stack.join(", ") : (lead.tech_stack || "N/A");
  const cms = lead.cms || "N/A";
  const perfScore = lead.performance_score ?? "N/A";
  const emails = Array.isArray(lead.emails) ? lead.emails.join(", ") : "";
  const phones = Array.isArray(lead.phones) ? lead.phones.join(", ") : "";
  const socialLinkedin = lead.social_linkedin || "";
  const socialInstagram = lead.social_instagram || "";
  const socialFacebook = lead.social_facebook || "";

  return `Você é um especialista em vendas outbound (B2B) e inteligência de vendas.
Sua tarefa é analisar os dados de enriquecimento e raspagem de um lead (empresa) e gerar um score de qualificação multidimensional estruturado de 0 a 100.

Dados do Lead:
- Website: ${website}
- Título da Página: ${title}
- Meta Descrição: ${meta}
- CMS: ${cms}
- Tecnologias Detectadas: ${techStack}
- Score de Performance (Lighthouse): ${perfScore}
- E-mails Encontrados: ${emails || "Nenhum"}
- Telefones Encontrados: ${phones || "Nenhum"}
- LinkedIn: ${socialLinkedin || "Não encontrado"}
- Instagram: ${socialInstagram || "Não encontrado"}
- Facebook: ${socialFacebook || "Não encontrado"}

Diretrizes de Pontuação por Dimensão (Max 25 pts cada):
1. **technical_pain** (0 a 25): Pontue alto (18-25) se o site tiver performance ruim (abaixo de 50), usar CMSs antigos ou tecnologias obsoletas que demonstrem clara necessidade de modernização tecnológica ou de infraestrutura.
2. **digital_maturity** (0 a 25): Pontue alto se o lead usar tecnologias de marketing robustas (analytics, trackers, tag managers, CRMs, ferramentas de anúncios, pixel). Se o site for extremamente simples ou sem rastreadores, a maturidade digital é baixa.
3. **urgency** (0 a 25): Pontue alto se houver indícios de necessidade imediata, problemas de segurança básicos ou falhas graves de SEO/acessibilidade.
4. **financial_potential** (0 a 25): Estime a escala financeira baseando-se no setor, sofisticação da stack de tecnologia e canais de contato. Empresas maiores com stacks caras e múltiplos canais de redes sociais têm maior potencial financeiro.

O score final deve ser a soma das 4 dimensões (score = technical_pain + digital_maturity + urgency + financial_potential).
Classifique a empresa em um Tier:
- Score 0 a 39: COLD
- Score 40 a 69: WARM
- Score 70 a 100: HOT

O output DEVE ser estritamente no formato JSON definido pelo seguinte schema Zod:
{
  "score": número (soma das dimensões, 0-100),
  "tiers": "COLD" | "WARM" | "HOT",
  "dimensions": {
    "technical_pain": número (0-25),
    "digital_maturity": número (0-25),
    "urgency": número (0-25),
    "financial_potential": número (0-25)
  },
  "reason": "Explicação resumida das pontuações em português.",
  "recommended_approach": "Sugestão prática de abordagem comercial customizada para esta empresa com base nas dores identificadas."
}
`;
}
