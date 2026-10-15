import { DIMENSION_WEIGHTS, TIER_THRESHOLDS } from "../contracts/triage.contract.js";
import type { ResumeProfile } from "@lead-hunter/shared/models/resume-profile.js";

export interface TriageJobInput {
  title?: string | null;
  description?: string | null;
  skills?: string[] | null;
  budget_type?: string | null;
  budget_min?: number | string | null;
  budget_max?: number | string | null;
  currency?: string | null;
  client_rating?: number | string | null;
  client_reviews_count?: number | null;
  proposals_count?: number | null;
  interested_count?: number | null;
  category?: string | null;
  subcategory?: string | null;
  experience_level?: string | null;
  is_urgent?: boolean | null;
  posted_at?: Date | string | null;
  expires_at?: Date | string | null;
}

export const TRIAGE_SYSTEM_PROMPT = `Você é o assistente de triagem de um único profissional freelancer.
Sua função é comparar uma vaga publicada com o currículo dele e decidir, de forma explicável, se vale a pena se candidatar.

Você avalia em nome do profissional, não do cliente. Seja cético: o tier APPLY custa tempo real de escrita de proposta.
Pontue com base apenas nos dados fornecidos — nunca invente experiência que não está no currículo nem requisito que não está na vaga.
Escreva "reason" e "recommended_action" em português do Brasil.`;

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "não informado";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "não informado";
  if (typeof value === "boolean") return value ? "sim" : "não";
  return String(value);
}

/**
 * A faixa de valor sai como texto porque o currículo pode declarar valor/hora,
 * valor por projeto, ambos ou nenhum — e a dimensão rate_fit precisa saber qual
 * base está comparando, não só dois números soltos.
 */
export function formatRateRange(resume: ResumeProfile): string {
  const currency = resume.currency || "BRL";
  const ranges: string[] = [];

  if (resume.minRateHr !== null && resume.minRateHr !== undefined) {
    const max = resume.maxRateHr ?? resume.minRateHr;
    ranges.push(`${resume.minRateHr} a ${max} ${currency} por hora`);
  }
  if (resume.minRate !== null && resume.minRate !== undefined) {
    const max = resume.maxRate ?? resume.minRate;
    ranges.push(`${resume.minRate} a ${max} ${currency} por projeto`);
  }

  return ranges.length > 0 ? ranges.join("; ") : "não informado";
}

function relativeAge(postedAt: Date | string | null | undefined): string {
  if (!postedAt) return "não informado";
  const posted = new Date(postedAt).getTime();
  if (!Number.isFinite(posted)) return "não informado";

  const hours = (Date.now() - posted) / 3_600_000;
  if (hours < 1) return "menos de 1 hora";
  if (hours < 48) return `${Math.round(hours)} horas`;
  return `${Math.round(hours / 24)} dias`;
}

/**
 * Monta o conteúdo do usuário para a triagem.
 *
 * A rubrica vai aqui e não no system prompt porque os pesos vêm de
 * `DIMENSION_WEIGHTS` — manter a rubrica junto dos dados garante que, se os
 * pesos mudarem, o prompt muda com eles em vez de descrever uma escala antiga.
 */
export function buildTriagePrompt(job: TriageJobInput, resume: ResumeProfile): string {
  const budget =
    job.budget_type === "open"
      ? "aberto (o cliente não definiu faixa)"
      : `${formatValue(job.budget_min)} a ${formatValue(job.budget_max)} ${formatValue(job.currency)} (${formatValue(job.budget_type)})`;

  return `## Vaga
- Título: ${formatValue(job.title)}
- Categoria: ${formatValue(job.category)} / ${formatValue(job.subcategory)}
- Nível de experiência pedido: ${formatValue(job.experience_level)}
- Skills exigidas: ${formatValue(job.skills)}
- Orçamento: ${budget}
- Marcada como urgente: ${formatValue(job.is_urgent)}
- Publicada há: ${relativeAge(job.posted_at)}
- Propostas concorrentes: ${formatValue(job.proposals_count)}
- Interessados: ${formatValue(job.interested_count)}
- Nota do cliente: ${formatValue(job.client_rating)} (${formatValue(job.client_reviews_count)} avaliações)
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
- Funções de interesse: ${formatValue(resume.roles)}
- Faixa de valor aceita: ${formatRateRange(resume)}
- Disponibilidade: ${formatValue(resume.availability)}
- Preferência remoto: ${formatValue(resume.remotePreference)}
- Idiomas: ${formatValue(resume.languages)}
- Bio: ${formatValue(resume.bio)}

## Rubrica
Pontue cada dimensão dentro do seu máximo:

1. skill_match (0-${DIMENSION_WEIGHTS.skill_match}) — sobreposição entre as skills/tecnologias exigidas e o que o
   profissional domina. Máximo só quando o núcleo técnico da vaga está coberto pelo stack dele.
   Perto de zero quando a vaga é de outra área (ex: design ou jurídico para um perfil de backend).
2. rate_fit (0-${DIMENSION_WEIGHTS.rate_fit}) — orçamento da vaga contra a faixa aceita. Alto quando o orçamento
   alcança ou supera o mínimo aceito. Baixo quando fica claramente abaixo. Se o orçamento estiver
   marcado como aberto ou não informado, pontue 0 e registre "rate_fit" em "unassessed": a dimensão
   sai do cálculo em vez de contar como incompatibilidade.
3. seniority_fit (0-${DIMENSION_WEIGHTS.seniority_fit}) — complexidade do escopo contra a senioridade dele.
   Penalize tanto vaga que exige mais do que ele tem quanto vaga que o subaproveita.
4. urgency (0-${DIMENSION_WEIGHTS.urgency}) — vale agir agora? Poucas propostas concorrentes, publicação recente e
   flag de urgente sobem a nota. Muitas propostas concorrentes derrubam: a chance de ser lido é menor.

Em "red_flags", registre sinais de golpe ou vaga de baixa qualidade: orçamento muito abaixo do mercado para
o escopo, pedido para o prestador pagar algo, descrição genérica demais para dimensionar o trabalho, pedido
de trabalho de graça como "teste", contato fora da plataforma, cliente sem nenhuma avaliação.
As red flags devem estar refletidas nas notas das dimensões — não basta listá-las.

Em "unassessed", liste as dimensões que a vaga não dá informação para avaliar — elas saem do
cálculo do score em vez de contar como nota baixa. Lista vazia quando tudo é avaliável.

Defina "score" como a soma exata das dimensões avaliáveis, reescalada para 0-100, e "tier" por
esses limiares: score >= ${TIER_THRESHOLDS.APPLY} é APPLY, de ${TIER_THRESHOLDS.MAYBE} a ${TIER_THRESHOLDS.APPLY - 1} é MAYBE, abaixo de ${TIER_THRESHOLDS.MAYBE} é SKIP.`;
}
