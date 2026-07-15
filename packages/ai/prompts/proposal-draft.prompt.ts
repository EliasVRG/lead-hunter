export function buildProposalDraftPrompt(job: any, resume: any): string {
  const title = job.title || "N/A";
  const description = job.description || "";
  const skills = Array.isArray(job.skills) ? job.skills.join(", ") : (job.skills || "N/A");

  const resumeSkills = Array.isArray(resume.skills) ? resume.skills.join(", ") : "";
  const resumeStack = Array.isArray(resume.stack) ? resume.stack.join(", ") : "";

  return `Você é um assistente pessoal que escreve rascunhos de propostas para um único
profissional freelancer se candidatar a vagas/projetos. O rascunho é sempre revisado e enviado
manualmente pelo profissional — você nunca envia nada, apenas gera o texto.

Vaga:
- Título: ${title}
- Descrição: ${description}
- Skills exigidas: ${skills}

Perfil do profissional:
- Nome: ${resume.name || "N/A"}
- Headline: ${resume.headline || "N/A"}
- Senioridade: ${resume.seniority || "N/A"}
- Skills: ${resumeSkills}
- Stack: ${resumeStack}
- Bio: ${resume.bio || "N/A"}

Escreva, em primeira pessoa e em português, um rascunho de proposta curto (3 a 5 parágrafos
curtos) para esta vaga específica. Regras:
- Mencione experiência concreta do profissional relevante para o escopo descrito na vaga (use os
  dados do perfil acima, não invente experiências que não estão listadas).
- Referencie elementos específicos da vaga (skill pedida, escopo, tipo de projeto) — o texto não
  pode ser um template genérico reaproveitável para qualquer vaga.
- Tom profissional e direto, sem exagero.
- Não inclua saudação de e-mail nem despedida formal — apenas o corpo da proposta.

O output DEVE ser estritamente no formato JSON definido pelo seguinte schema Zod:
{
  "proposalDraft": "texto da proposta em português"
}
`;
}
