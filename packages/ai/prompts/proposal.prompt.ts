import type { ResumeProfile } from "@lead-hunter/shared/models/resume-profile.js";
import type { TriageResult } from "../contracts/triage.contract.js";
import { formatRateRange, type TriageJobInput } from "./triage.prompt.js";

export const PROPOSAL_SYSTEM_PROMPT = `Você escreve rascunhos de proposta para um único profissional freelancer.
O rascunho é sempre revisado e enviado manualmente por ele — você nunca envia nada.

Regras invioláveis:
- Use apenas experiência que consta no currículo fornecido. Não invente projetos, clientes, números ou certificações.
- Referencie elementos concretos desta vaga. Um texto que serviria para qualquer vaga é uma resposta inútil.
- Português do Brasil, primeira pessoa, tom profissional e direto. Sem superlativos nem promessas de resultado.
- Sem saudação ("Olá", "Prezado") e sem despedida ("Atenciosamente") — apenas o corpo da proposta.`;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "não informado";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "não informado";
  return String(value);
}

/**
 * Monta o conteúdo do usuário para o rascunho de proposta.
 *
 * O resultado da triagem é incluído de propósito: `matched_skills` diz quais
 * pontos de contato enfatizar, `missing_skills` o que não prometer, e
 * `red_flags` o que transformar em pergunta ao cliente em vez de ignorar.
 */
export function buildProposalPrompt(
  job: TriageJobInput,
  resume: ResumeProfile,
  triage: TriageResult | null,
): string {
  const budget =
    job.budget_type === "open"
      ? "aberto (o cliente não definiu faixa)"
      : `${formatValue(job.budget_min)} a ${formatValue(job.budget_max)} ${formatValue(job.currency)}`;

  const triageBlock = triage
    ? `## Resultado da triagem
- Score: ${triage.score} (${triage.tier})
- Skills em comum (enfatize estas): ${formatValue(triage.matched_skills)}
- Skills que faltam (não prometa domínio nelas): ${formatValue(triage.missing_skills)}
- Pontos de atenção: ${formatValue(triage.red_flags)}
- Leitura da triagem: ${triage.reason}
`
    : "";

  return `## Vaga
- Título: ${formatValue(job.title)}
- Categoria: ${formatValue(job.category)} / ${formatValue(job.subcategory)}
- Nível pedido: ${formatValue(job.experience_level)}
- Skills exigidas: ${formatValue(job.skills)}
- Orçamento: ${budget}
- Propostas concorrentes: ${formatValue(job.proposals_count)}
- Descrição:
"""
${formatValue(job.description)}
"""

## Currículo do profissional
- Nome: ${formatValue(resume.name)}
- Headline: ${formatValue(resume.headline)}
- Senioridade: ${formatValue(resume.seniority)}
- Skills: ${formatValue(resume.skills)}
- Stack: ${formatValue(resume.stack)}
- Faixa de valor aceita: ${formatRateRange(resume)}
- Disponibilidade: ${formatValue(resume.availability)}
- Bio: ${formatValue(resume.bio)}
- Realizações concretas (use estas, não invente outras):
${(resume.highlights ?? []).map((item) => `  - ${item}`).join("\n") || "  - não informado"}
- Projetos open source: ${formatValue((resume.openSource ?? []).map((p) => `${p.name} (${p.url}) — ${p.description}`))}

${triageBlock}
## O que produzir
- "body": o corpo da proposta, 3 a 5 parágrafos curtos. Abra com o entendimento do problema do cliente,
  não com autoapresentação. Depois conecte a experiência concreta do currículo ao escopo descrito e
  encerre propondo o próximo passo.
- "key_points": os argumentos que sustentam a candidatura, em forma de tópicos curtos.
- "questions": o que precisa ser esclarecido antes de fechar escopo ou preço. Se houver pontos de atenção
  na triagem, vire-os em pergunta aqui. Lista vazia se a vaga estiver bem especificada.
- "estimated_days" e "suggested_price": só preencha se a descrição der base para estimar. Caso contrário, null.
  Se preencher o preço, respeite a faixa de valor aceita pelo profissional.`;
}
