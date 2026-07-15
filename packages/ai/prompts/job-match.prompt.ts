export function buildJobMatchPrompt(job: any, resume: any): string {
  const title = job.title || "N/A";
  const description = job.description || "";
  const skills = Array.isArray(job.skills) ? job.skills.join(", ") : (job.skills || "N/A");
  const budgetType = job.budgetType || job.budget_type || "unknown";
  const budgetMin = job.budgetMin ?? job.budget_min ?? "N/A";
  const budgetMax = job.budgetMax ?? job.budget_max ?? "N/A";
  const currency = job.currency || "";
  const clientRating = job.clientRating ?? job.client_rating ?? "N/A";
  const proposalsCount = job.proposalsCount ?? job.proposals_count ?? "N/A";
  const postedAt = job.postedAt ?? job.posted_at ?? "N/A";

  const resumeSkills = Array.isArray(resume.skills) ? resume.skills.join(", ") : "";
  const resumeStack = Array.isArray(resume.stack) ? resume.stack.join(", ") : "";
  const resumeRoles = Array.isArray(resume.roles) ? resume.roles.join(", ") : "";

  return `Você é um assistente pessoal que avalia vagas/projetos freelance em nome de um único
profissional, comparando cada vaga com o currículo dele para decidir se vale a pena se candidatar.
Sua tarefa é gerar um score de compatibilidade multidimensional estruturado de 0 a 100.

Dados da vaga:
- Título: ${title}
- Descrição: ${description}
- Skills exigidas: ${skills}
- Tipo de orçamento: ${budgetType}
- Orçamento: ${budgetMin} a ${budgetMax} ${currency}
- Avaliação do cliente: ${clientRating}
- Quantidade de propostas concorrentes: ${proposalsCount}
- Data de publicação: ${postedAt}

Currículo/perfil do profissional:
- Nome: ${resume.name || "N/A"}
- Headline: ${resume.headline || "N/A"}
- Senioridade: ${resume.seniority || "N/A"}
- Skills: ${resumeSkills}
- Stack: ${resumeStack}
- Funções de interesse: ${resumeRoles}
- Faixa de valor aceita: ${resume.minRate ?? "N/A"} a ${resume.maxRate ?? "N/A"} ${resume.currency ?? ""}
- Disponibilidade: ${resume.availability || "N/A"}
- Preferência de trabalho remoto: ${resume.remotePreference || "N/A"}
- Bio: ${resume.bio || "N/A"}

Diretrizes de pontuação por dimensão:
1. **skill_match** (0 a 40): Compare as skills exigidas na vaga com as skills/stack do currículo.
   Pontue alto quando há forte sobreposição com o que o profissional domina; pontue baixo quando a
   vaga exige tecnologias fora do perfil.
2. **rate_fit** (0 a 20): Compare o orçamento da vaga com a faixa de valor aceita pelo profissional.
   Pontue alto quando o orçamento está dentro ou acima da faixa aceitável; pontue baixo ou zero
   quando o orçamento é incompatível com o valor mínimo aceito.
3. **seniority_fit** (0 a 20): Avalie se o nível de complexidade da vaga é compatível com a
   senioridade do profissional — nem subaproveitando, nem exigindo experiência que ele não tem.
4. **urgency** (0 a 20): Avalie sinais de que vale a pena agir rápido — poucas propostas
   concorrentes, vaga recém-publicada, prazo de candidatura próximo.

O score final deve ser a soma das 4 dimensões
(score = skill_match + rate_fit + seniority_fit + urgency).

Classifique a vaga em um tier:
- Score 0 a 39: SKIP
- Score 40 a 69: MAYBE
- Score 70 a 100: APPLY

Além do score, sinalize em "red_flags" indícios de golpe ou vaga de baixa qualidade, por exemplo:
orçamento muito abaixo do mercado para o escopo descrito, pedido de pagamento adiantado do
prestador ao cliente, descrição vaga/genérica demais para avaliar o escopo real, ou cliente sem
avaliações/com avaliações muito ruins. Red flags não zeram o score automaticamente, mas devem
aparecer em "reason" e reduzir o tier quando relevantes.

O output DEVE ser estritamente no formato JSON definido pelo seguinte schema Zod:
{
  "score": número (soma das dimensões, 0-100),
  "tier": "SKIP" | "MAYBE" | "APPLY",
  "dimensions": {
    "skill_match": número (0-40),
    "rate_fit": número (0-20),
    "seniority_fit": número (0-20),
    "urgency": número (0-20)
  },
  "reason": "Explicação resumida das pontuações em português.",
  "red_flags": ["lista de red flags detectadas, vazia se nenhuma"],
  "recommended_action": "Sugestão prática: candidatar-se ou não, e por quê."
}
`;
}
