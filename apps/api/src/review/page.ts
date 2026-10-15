import type { JobPostingRow } from "@lead-hunter/database";

/**
 * Escapa texto para interpolação em HTML.
 *
 * Obrigatório, não cosmético: títulos e descrições vêm de páginas públicas do
 * 99Freelas e o corpo da proposta vem de um LLM. Qualquer um dos dois pode
 * conter `<script>` — o primeiro porque é conteúdo de terceiro, o segundo
 * porque pode repetir o que leu na vaga.
 */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DIMENSION_LABELS: Record<string, string> = {
  skill_match: "skills",
  rate_fit: "valor",
  seniority_fit: "senioridade",
  urgency: "urgência",
};

function money(value: number | null, currency: string | null): string {
  if (value === null) return "";
  return `${currency ?? "BRL"} ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function relativeAge(postedAt: Date | null): string {
  if (!postedAt) return "";
  const hours = (Date.now() - new Date(postedAt).getTime()) / 3_600_000;
  if (hours < 1) return "agora";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function renderDimensions(job: JobPostingRow): string {
  const dimensions = job.dimensions ?? {};
  const unassessed = new Set(job.unassessed_dimensions ?? []);

  const cells = Object.entries(DIMENSION_LABELS).map(([key, label]) => {
    const value = dimensions[key];
    if (value === undefined) return "";

    // Dimensão fora do cálculo: mostrar o zero como se fosse nota seria
    // mentir sobre o score — ela aparece riscada e marcada.
    if (unassessed.has(key)) {
      return `<span class="dim dim-out" title="fora do cálculo: a vaga não informa este dado">${esc(label)} —</span>`;
    }
    return `<span class="dim">${esc(label)} <b>${esc(value)}</b></span>`;
  });

  return cells.filter(Boolean).join("");
}

function renderList(title: string, items: string[] | null, className = ""): string {
  if (!items || items.length === 0) return "";
  return `
    <div class="block ${className}">
      <h4>${esc(title)}</h4>
      <ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    </div>`;
}

function renderCard(job: JobPostingRow): string {
  const unassessedNote =
    job.unassessed_dimensions && job.unassessed_dimensions.length > 0
      ? `<span class="note" title="score renormalizado sobre as dimensões restantes">score sobre ${4 - job.unassessed_dimensions.length} de 4 dimensões</span>`
      : "";

  const budget =
    job.budget_type === "open"
      ? `orçamento aberto${job.budget_min ? ` (mín. ${money(job.budget_min, job.currency)})` : ""}`
      : money(job.budget_min, job.currency) || "orçamento não informado";

  const estimate = [
    job.proposal_estimated_days ? `${job.proposal_estimated_days} dias` : "",
    money(job.proposal_suggested_price, job.proposal_currency),
  ]
    .filter(Boolean)
    .join(" · ");

  return `
<article class="card" id="job-${job.id}">
  <header>
    <div class="tier tier-${esc(job.tier)}">${esc(job.tier ?? "—")}<b>${esc(job.score ?? "—")}</b></div>
    <div class="head-text">
      <h2><a href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">${esc(job.title)}</a></h2>
      <div class="meta">
        <span>${esc(job.subcategory ?? job.category ?? "")}</span>
        <span>${esc(budget)}</span>
        <span>${esc(job.proposals_count ?? 0)} propostas</span>
        ${job.client_rating !== null ? `<span>cliente ${esc(job.client_rating)}★</span>` : `<span class="warn">cliente sem avaliações</span>`}
        ${job.posted_at ? `<span>há ${esc(relativeAge(job.posted_at))}</span>` : ""}
        ${job.is_urgent ? `<span class="warn">urgente</span>` : ""}
      </div>
      <div class="dims">${renderDimensions(job)} ${unassessedNote}</div>
    </div>
  </header>

  ${job.dismissed_reason ? `<p class="dismissed">Descartada automaticamente — ${esc(job.dismissed_reason)}</p>` : ""}
  ${job.reason ? `<p class="reason">${esc(job.reason)}</p>` : ""}
  ${renderList("Pontos de atenção", job.red_flags, "flags")}

  <div class="cols">
    ${renderList("Skills em comum", job.matched_skills)}
    ${renderList("Skills que faltam", job.missing_skills, "missing")}
  </div>

  <div class="block">
    <h4>
      Rascunho da proposta
      <button class="copy" data-target="draft-${job.id}">copiar</button>
      ${estimate ? `<span class="estimate">${esc(estimate)}</span>` : ""}
    </h4>
    <textarea id="draft-${job.id}" rows="12" spellcheck="true">${esc(job.proposal_draft)}</textarea>
    <p class="hint">
      Revise antes de enviar — modelos gratuitos erram concordância e podem
      inventar detalhe. Gerado por <code>${esc(job.proposal_model ?? "?")}</code>.
    </p>
  </div>

  ${renderList("Perguntas para o cliente", job.proposal_questions)}
  ${renderList("Argumentos", job.proposal_key_points)}

  <footer>
    <a class="btn btn-primary" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">Abrir no 99Freelas</a>
    <button class="btn" data-status="applied" data-id="${job.id}">Marquei como enviada</button>
    <button class="btn btn-quiet" data-status="dismissed" data-id="${job.id}">Descartar</button>
    <span class="row-msg" id="msg-${job.id}"></span>
  </footer>
</article>`;
}

const STYLES = `
*, *::before, *::after { box-sizing: border-box; }
:root {
  --bg: #f6f7f9; --card: #fff; --fg: #14171a; --muted: #5b6672;
  --line: #e2e6ea; --accent: #1b6ef3; --warn: #a8530a; --warn-bg: #fff4e5;
  --apply: #0f7b3f; --maybe: #8a6d00; --skip: #6b7280;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14171a; --card: #1c2024; --fg: #e8eaed; --muted: #9aa4ae;
    --line: #2d3338; --accent: #5b9dff; --warn: #e0a558; --warn-bg: #2e2416;
    --apply: #4ac97e; --maybe: #d4b43c; --skip: #8b949e;
  }
}
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
.wrap { max-width: 820px; margin: 0 auto; padding: 28px 18px 80px; }
.top { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
h1 { font-size: 21px; margin: 0; }
.sub { color: var(--muted); font-size: 13px; margin: 0 0 22px; }
.sub a { color: var(--accent); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 18px; margin-bottom: 18px; }
.card.done { opacity: .45; }
header { display: flex; gap: 14px; align-items: flex-start; }
.head-text { min-width: 0; flex: 1; }
h2 { font-size: 16px; margin: 0 0 6px; line-height: 1.35; }
h2 a { color: inherit; text-decoration: none; }
h2 a:hover { color: var(--accent); text-decoration: underline; }
.tier { flex: 0 0 62px; text-align: center; border-radius: 8px; padding: 7px 4px;
  font-size: 10px; font-weight: 700; letter-spacing: .06em; border: 1px solid var(--line); }
.tier b { display: block; font-size: 19px; letter-spacing: 0; margin-top: 1px; }
.tier-APPLY { color: var(--apply); } .tier-MAYBE { color: var(--maybe); } .tier-SKIP { color: var(--skip); }
.meta, .dims { display: flex; flex-wrap: wrap; gap: 6px 10px; font-size: 12px; color: var(--muted); }
.dims { margin-top: 6px; }
.dim b { color: var(--fg); }
.dim-out { text-decoration: line-through; opacity: .65; cursor: help; }
.note { font-style: italic; cursor: help; }
.warn { color: var(--warn); }
.reason { font-size: 14px; color: var(--muted); margin: 14px 0 0; }
.dismissed { font-size: 13px; color: var(--warn); background: var(--warn-bg);
  border-radius: 7px; padding: 9px 12px; margin: 14px 0 0; }
.block { margin-top: 16px; }
h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
  margin: 0 0 7px; display: flex; align-items: center; gap: 9px; }
ul { margin: 0; padding-left: 19px; font-size: 14px; }
li { margin-bottom: 3px; }
.flags ul { color: var(--warn); }
.flags { background: var(--warn-bg); border-radius: 7px; padding: 10px 12px; }
.missing ul { color: var(--muted); }
.cols { display: flex; gap: 26px; flex-wrap: wrap; }
.cols .block { flex: 1; min-width: 190px; }
textarea { width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--line);
  border-radius: 7px; padding: 12px; font: inherit; line-height: 1.6; resize: vertical; }
.hint { font-size: 12px; color: var(--muted); margin: 7px 0 0; }
code { font-size: 11px; }
.estimate { margin-left: auto; font-weight: 600; color: var(--fg); letter-spacing: 0; text-transform: none; }
footer { display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
  margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--line); }
.btn { font: inherit; font-size: 13px; padding: 7px 13px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--line); background: var(--card); color: var(--fg); text-decoration: none; }
.btn:hover { border-color: var(--accent); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-quiet { color: var(--muted); }
.copy { font: inherit; font-size: 11px; padding: 2px 9px; border-radius: 5px; cursor: pointer;
  border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
.row-msg { font-size: 12px; color: var(--muted); }
.empty { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 30px; text-align: center; color: var(--muted); }
.empty code { display: block; margin-top: 12px; font-size: 12px; }
`;

/**
 * O script é inline porque a página é server-rendered e não há build de
 * frontend — nenhum bundler para servir um .js separado.
 */
const SCRIPT = `
document.addEventListener('click', async (event) => {
  const copy = event.target.closest('.copy');
  if (copy) {
    const field = document.getElementById(copy.dataset.target);
    field.select();
    try {
      await navigator.clipboard.writeText(field.value);
      copy.textContent = 'copiado';
    } catch {
      // clipboard exige contexto seguro; em http:// o texto fica selecionado
      // para Ctrl+C e avisamos em vez de falhar em silêncio
      copy.textContent = 'use Ctrl+C';
    }
    setTimeout(() => { copy.textContent = 'copiar'; }, 1800);
    return;
  }

  const action = event.target.closest('[data-status]');
  if (!action) return;

  const { id, status } = action.dataset;
  const msg = document.getElementById('msg-' + id);
  action.disabled = true;
  msg.textContent = 'salvando...';

  try {
    const res = await fetch('/jobs/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    msg.textContent = status === 'applied' ? 'marcada como enviada' : 'descartada';
    document.getElementById('job-' + id).classList.add('done');
  } catch (err) {
    msg.textContent = 'falhou: ' + err.message;
    action.disabled = false;
  }
});
`;

export function renderReviewPage(jobs: JobPostingRow[]): string {
  const body =
    jobs.length > 0
      ? jobs.map(renderCard).join("")
      : `<div class="empty">
           Nenhuma proposta aguardando revisão.
           <code>curl -X POST localhost:3000/discovery/runs -H 'Content-Type: application/json' -d '{}'</code>
         </div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Propostas para revisar — Job Hunter</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <h1>Propostas para revisar</h1>
    <span class="sub">${jobs.length} aguardando</span>
  </div>
  <p class="sub">
    Nada é enviado automaticamente. Revise o texto, copie, cole no 99Freelas e marque como enviada.
    · <a href="/queues">filas</a> · <a href="/jobs">json</a>
  </p>
  ${body}
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}
