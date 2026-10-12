/**
 * What the synthesis stage writes to the review folder: per outcome a note with the result, the studies
 * and the GRADE table, a forest plot and a funnel plot (SVG), the data as CSV and an R script (metafor)
 * that reproduces the analysis; and one summary-of-findings note over all outcomes.
 * @module domain/synthesis-notes
 */
import { writeRows } from "./csv.js";
import * as frontmatter from "./frontmatter.js";
import { CERTAINTY, GRADE_DOMAINS } from "./grade.js";
import { MEASURES, OUTCOME_TYPES, shown } from "./meta-analysis.js";
import { normalQuantile } from "./statistics.js";

export const SYNTHESIS_DIR = "14 - Synthesis";
export const SOF_FILE = "14 - Summary of findings.md";

const Z95 = normalQuantile(0.975);
const COLUMN_LABEL = { e1: "Events (1)", n1: "Total (1)", e2: "Events (2)", n2: "Total (2)", m1: "Mean (1)", sd1: "SD (1)",
  m2: "Mean (2)", sd2: "SD (2)", est: "Estimate", lo: "95% CI low", hi: "95% CI high" };
export const columnLabel = c => COLUMN_LABEL[c] ?? c;

/** File name stem for an outcome ("Mortality at 12 months"), safe on Windows. */
export const outcomeStem = outcome => (String(outcome.name || "Outcome").replace(/[\\/:*?"<>|#^[\]]/g, "-").trim() || "Outcome");

const xml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cell = s => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");

/** A number for reading: 2 decimals (3 below 0.1 in absolute value). */
export function fmt(x, digits) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(digits ?? (Math.abs(x) < 0.1 && x !== 0 ? 3 : 2));
}
/** 357347 → "357,347". */
export const fmtCount = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const fmtP = p => (!Number.isFinite(p) ? "—" : p < 0.001 ? "< 0.001" : p.toFixed(3));

/** "0.49 (0.34 to 0.70)" on the reader's scale. */
export const effectText = (measure, est, lo, hi) => `${fmt(shown(measure, est))} (${fmt(shown(measure, lo))} to ${fmt(shown(measure, hi))})`;

const modelText = o => (o.model === "fixed" ? "fixed effect (inverse variance)" : `random effects (DerSimonian–Laird${o.hk ? ", Hartung–Knapp" : ""})`);

/** Nice axis ticks between a and b (analysis scale). */
function ticks(measure, a, b) {
  if (MEASURES[measure]?.log) {
    return [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].map(Math.log).filter(t => t >= a - 1e-9 && t <= b + 1e-9);
  }
  const raw = (b - a) / 4, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out = [];
  for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) out.push(Math.abs(t) < 1e-12 ? 0 : t);
  return out;
}

/**
 * Forest plot as SVG (uses currentColor, so it reads in light and dark themes and in Obsidian).
 * @param {object} outcome @param {ReturnType<import("./meta-analysis.js").analyseOutcome>} analysis
 * @param {Map<string, string>} labels study label by record id ("Liu 2024")
 */
export function forestSvg(outcome, analysis, labels) {
  const { studies, pooled } = analysis;
  const rowH = 22, top = 34, W = 780, x0 = 250, x1 = 540;
  const n = studies.length + (pooled ? 2 : 0);
  const H = top + n * rowH + 44;
  const cis = studies.filter(s => !s.skip).map(s => [s.yi - Z95 * Math.sqrt(s.vi), s.yi + Z95 * Math.sqrt(s.vi)]);
  if (pooled) cis.push([pooled.lo, pooled.hi], ...(pooled.pi ? [pooled.pi] : []));
  let lo = Math.min(0, ...cis.map(c => c[0])), hi = Math.max(0, ...cis.map(c => c[1]));
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const X = v => x0 + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (x1 - x0);
  const maxW = Math.max(1, ...studies.filter(s => !s.skip).map(s => s.weight ?? 0));
  const parts = [`<text x="8" y="20" font-weight="600">Study</text><text x="${x1 + 16}" y="20" font-weight="600">${xml(outcome.measure === "ratio" || outcome.measure === "difference" ? MEASURES[outcome.measure].label.split(" (")[0] : outcome.measure)} (95% CI)</text><text x="${W - 8}" y="20" font-weight="600" text-anchor="end">Weight</text>`];
  studies.forEach((s, i) => {
    const y = top + i * rowH + rowH / 2;
    const label = labels.get(s.row.record_id) || s.row.record_id || `Study ${i + 1}`;
    parts.push(`<text x="8" y="${y + 4}">${xml(label.length > 34 ? label.slice(0, 33) + "…" : label)}</text>`);
    if (s.skip) { parts.push(`<text x="${x1 + 16}" y="${y + 4}" fill-opacity="0.6">not pooled: ${xml(s.skip)}</text>`); return; }
    const a = s.yi - Z95 * Math.sqrt(s.vi), b = s.yi + Z95 * Math.sqrt(s.vi), size = 4 + 8 * Math.sqrt((s.weight ?? 0) / maxW);
    parts.push(`<line x1="${X(a)}" x2="${X(b)}" y1="${y}" y2="${y}" stroke="currentColor"/>`,
      `<rect x="${X(s.yi) - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="currentColor"/>`,
      `<text x="${x1 + 16}" y="${y + 4}">${effectText(outcome.measure, s.yi, a, b)}</text>`,
      `<text x="${W - 8}" y="${y + 4}" text-anchor="end">${fmt(s.weight ?? 0, 1)}%</text>`);
  });
  const axisY = top + n * rowH;
  if (pooled) {
    const y = top + (studies.length + 1) * rowH;
    parts.push(`<text x="8" y="${y + 4}" font-weight="600">${pooled.model === "fixed" ? "Fixed effect" : "Random effects"} (k = ${pooled.k})</text>`,
      `<polygon points="${X(pooled.lo)},${y} ${X(pooled.est)},${y - 7} ${X(pooled.hi)},${y} ${X(pooled.est)},${y + 7}" fill="currentColor"/>`,
      `<text x="${x1 + 16}" y="${y + 4}" font-weight="600">${effectText(outcome.measure, pooled.est, pooled.lo, pooled.hi)}</text>`,
      `<text x="${W - 8}" y="${y + 4}" text-anchor="end" font-weight="600">100%</text>`);
    if (pooled.pi) parts.push(`<line x1="${X(pooled.pi[0])}" x2="${X(pooled.pi[1])}" y1="${y + 12}" y2="${y + 12}" stroke="currentColor" stroke-dasharray="3 3"/>`);
    parts.push(`<line x1="${X(pooled.est)}" x2="${X(pooled.est)}" y1="${top}" y2="${axisY}" stroke="currentColor" stroke-opacity="0.35" stroke-dasharray="2 3"/>`);
    parts.push(`<text x="8" y="${axisY + 34}" font-size="11" fill-opacity="0.75">I² = ${fmt(pooled.i2, 0)}%, τ² = ${fmt(pooled.tau2, 3)}, Q = ${fmt(pooled.q)} (df ${pooled.df}, p ${fmtP(pooled.pQ).startsWith("<") ? fmtP(pooled.pQ) : "= " + fmtP(pooled.pQ)})${pooled.pi ? "; dashed: 95% prediction interval" : ""}</text>`);
  }
  parts.push(`<line x1="${X(0)}" x2="${X(0)}" y1="${top - 6}" y2="${axisY}" stroke="currentColor"/>`,
    `<line x1="${x0}" x2="${x1}" y1="${axisY}" y2="${axisY}" stroke="currentColor"/>`);
  for (const t of ticks(outcome.measure, lo, hi)) {
    parts.push(`<line x1="${X(t)}" x2="${X(t)}" y1="${axisY}" y2="${axisY + 4}" stroke="currentColor"/>`,
      `<text x="${X(t)}" y="${axisY + 16}" text-anchor="middle" font-size="11">${+shown(outcome.measure, t).toPrecision(3)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" color="#222">${parts.join("")}</svg>`;
}

/** Funnel plot as SVG: effect against standard error, with the 95% pseudo-confidence region. */
export function funnelSvg(outcome, analysis) {
  const { used, pooled } = analysis;
  if (!pooled || used.length < 3) return "";
  const W = 420, H = 300, l = 50, r = W - 16, t = 16, b = H - 40;
  const ses = used.map(s => Math.sqrt(s.vi)), seMax = Math.max(...ses) * 1.05;
  const fixed = pooled.est;     // centre on the pooled estimate shown
  const xs = [...used.map(s => s.yi), fixed - Z95 * seMax, fixed + Z95 * seMax];
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const X = v => l + ((v - lo) / (hi - lo || 1)) * (r - l), Y = se => t + (se / seMax) * (b - t);
  const parts = [`<polygon points="${X(fixed)},${Y(0)} ${X(fixed - Z95 * seMax)},${Y(seMax)} ${X(fixed + Z95 * seMax)},${Y(seMax)}" fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.4" stroke-dasharray="3 3"/>`,
    `<line x1="${X(fixed)}" x2="${X(fixed)}" y1="${Y(0)}" y2="${Y(seMax)}" stroke="currentColor" stroke-opacity="0.6"/>`,
    ...used.map((s, i) => `<circle cx="${X(s.yi)}" cy="${Y(ses[i])}" r="4" fill="currentColor" fill-opacity="0.75"/>`),
    `<line x1="${l}" x2="${r}" y1="${b}" y2="${b}" stroke="currentColor"/><line x1="${l}" x2="${l}" y1="${t}" y2="${b}" stroke="currentColor"/>`,
    `<text x="${(l + r) / 2}" y="${H - 6}" text-anchor="middle">${xml(MEASURES[outcome.measure].log ? `log ${outcome.measure === "ratio" ? "ratio" : outcome.measure}` : outcome.measure)}</text>`,
    `<text x="14" y="${(t + b) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(t + b) / 2})">Standard error</text>`];
  for (const tk of ticks(MEASURES[outcome.measure].log ? "difference" : outcome.measure, lo, hi))
    parts.push(`<text x="${X(tk)}" y="${b + 16}" text-anchor="middle" font-size="11">${+tk.toPrecision(3)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif" font-size="12" fill="currentColor" color="#222">${parts.join("")}</svg>`;
}

/** The outcome's data as CSV (study, record id and the numbers), read by the R script. */
export function outcomeCsv(outcome, labels) {
  const cols = OUTCOME_TYPES[outcome.type].columns;
  return writeRows([["study", "record_id", ...cols], ...(outcome.rows ?? []).map(r => [labels.get(r.record_id) || r.record_id, r.record_id, ...cols.map(c => r[c] ?? "")])]);
}

/** An R script (metafor) that reproduces the app's analysis from the CSV. */
export function outcomeR(outcome, { generatedBy = "Review Studio", today = "" } = {}) {
  const stem = outcomeStem(outcome);
  const esc = {
    binary: `dat <- escalc(measure = "${outcome.measure}", ai = e1, n1i = n1, ci = e2, n2i = n2, data = dat)`,
    continuous: `dat <- escalc(measure = "${outcome.measure}", m1i = m1, sd1i = sd1, n1i = n1, m2i = m2, sd2i = sd2, n2i = n2, data = dat)`,
    generic: outcome.measure === "ratio"
      ? `dat$yi <- log(dat$est)\ndat$vi <- ((log(dat$hi) - log(dat$lo)) / (2 * qnorm(0.975)))^2`
      : `dat$yi <- dat$est\ndat$vi <- ((dat$hi - dat$lo) / (2 * qnorm(0.975)))^2`,
  }[outcome.type];
  const method = outcome.model === "fixed" ? `method = "FE"` : `method = "DL"${outcome.hk ? `, test = "knha"` : ""}`;
  const log = MEASURES[outcome.measure].log;
  return [`# ${outcome.name}: ${MEASURES[outcome.measure].label}, ${modelText(outcome)}`,
    `# Written by ${generatedBy}${today ? ` on ${today}` : ""}. Run it in this folder to check the app's results.`,
    `# Note: escalc corrects zero cells for RR/OR like the app; for RD the app adds 0.5 only when needed.`,
    `library(metafor)`, `dat <- read.csv("${stem} data.csv")`, esc,
    `res <- rma(yi, vi, data = dat, slab = study, ${method})`, `print(res)`,
    log ? `predict(res, transf = exp)` : `predict(res)`,
    `forest(res${log ? ", atransf = exp" : ""}, header = TRUE)`,
    `funnel(res)`, `if (res$k >= 3) print(regtest(res, model = "lm"))`, ""].join("\n");
}

/** "Pooled RR 0.49 (95% CI 0.34 to 0.70), p < 0.001; 13 studies." */
export function resultSentence(outcome, analysis) {
  const p = analysis.pooled;
  if (!p) return "No studies with usable data yet.";
  return `Pooled ${MEASURES[outcome.measure].label.toLowerCase()} ${fmt(shown(outcome.measure, p.est))} (95% CI ${fmt(shown(outcome.measure, p.lo))} to ${fmt(shown(outcome.measure, p.hi))}), `
    + `p ${fmtP(p.p).startsWith("<") ? fmtP(p.p) : "= " + fmtP(p.p)}; ${p.k} stud${p.k === 1 ? "y" : "ies"}`
    + (analysis.totals.participants ? `, ${fmtCount(analysis.totals.participants)} participants` : "") + ".";
}

/**
 * The outcome's note.
 * @param {object} p {outcome, analysis, grade (from certainty()), labels, reviewLink, today, generatedBy}
 */
export function outcomeNote({ outcome, analysis, grade, labels, reviewLink, today, generatedBy = "Review Studio" }) {
  const stem = outcomeStem(outcome);
  const { pooled, studies, egger } = analysis;
  const cols = OUTCOME_TYPES[outcome.type].columns;
  const props = { type: "review-synthesis", review: reviewLink, outcome: outcome.name, measure: outcome.measure,
    model: modelText(outcome), studies: pooled?.k ?? 0, certainty: grade.label + (grade.confirmed ? "" : " (not yet confirmed)"),
    updated: today, generated_by: generatedBy };
  const lines = [`# ${outcome.name}`, "", `${MEASURES[outcome.measure].label}; ${modelText(outcome)}; ${outcome.design === "obs" ? "observational studies" : "randomised trials"}.`
    + (outcome.comparison ? ` Comparison: ${outcome.comparison}.` : ""), "", "## Result", "", resultSentence(outcome, analysis)];
  if (pooled && pooled.k > 1) {
    lines.push("", `Heterogeneity: I² = ${fmt(pooled.i2, 0)}%, τ² = ${fmt(pooled.tau2, 3)}, Q = ${fmt(pooled.q)} (df ${pooled.df}, p ${fmtP(pooled.pQ)}).`
      + (pooled.pi ? ` 95% prediction interval ${fmt(shown(outcome.measure, pooled.pi[0]))} to ${fmt(shown(outcome.measure, pooled.pi[1]))}.` : ""));
  }
  lines.push("", `![[${stem} forest.svg]]`, "", "## Studies", "",
    `| Study | ${cols.map(columnLabel).join(" | ")} | ${outcome.measure} (95% CI) | Weight |`, `|${"---|".repeat(cols.length + 3)}`,
    ...studies.map(s => `| ${cell(labels.get(s.row.record_id) || s.row.record_id)} | ${cols.map(c => cell(s.row[c])).join(" | ")} | `
      + (s.skip ? `not pooled: ${s.skip} | — |` : `${effectText(outcome.measure, s.yi, s.yi - Z95 * Math.sqrt(s.vi), s.yi + Z95 * Math.sqrt(s.vi))} | ${fmt(s.weight, 1)}% |`)),
    "", "## Certainty of the evidence (GRADE)", "", "| Domain | Judgement | Reason |", "|---|---|---|",
    ...GRADE_DOMAINS.map(([key, label]) => {
      const d = grade.domains[key];
      const j = d.level === 0 ? "not serious" : d.level === -1 ? "serious (−1)" : "very serious (−2)";
      return `| ${label} | ${j}${d.confirmed ? "" : " (suggested)"} | ${cell(d.reason)} |`;
    }),
    "", `**Certainty: ${grade.symbol} ${grade.label}**${grade.confirmed ? "" : " (some domains are suggestions, not yet confirmed)"}`);
  if (pooled && pooled.k >= 3) {
    lines.push("", "## Small-study effects", "", `![[${stem} funnel.svg]]`, "",
      egger ? `Egger's regression test: intercept ${fmt(egger.intercept)} (SE ${fmt(egger.se)}), t = ${fmt(egger.t)}, df ${egger.df}, p ${fmtP(egger.p)}.`
        + (pooled.k < 10 ? " With fewer than 10 studies the test has little power." : "") : "");
  }
  lines.push("", "## Files", "", `- Data: [[${stem} data.csv]]`, `- R script (metafor) to check this result: [[${stem}.R]]`, "");
  return frontmatter.serialize(props) + "\n" + lines.join("\n");
}

/**
 * The summary-of-findings note over all outcomes.
 * @param {{outcome: object, analysis: object, grade: object}[]} items
 */
export function summaryOfFindings({ items, reviewLink, today, generatedBy = "Review Studio" }) {
  const props = { type: "review-summary-of-findings", review: reviewLink, updated: today, generated_by: generatedBy };
  const downgrades = g => GRADE_DOMAINS.filter(([k]) => g.domains[k].level < 0)
    .map(([k, label]) => `${label.toLowerCase()} (${g.domains[k].level})`).join(", ");
  const rows = items.map(({ outcome, analysis, grade }) => {
    const p = analysis.pooled;
    return `| [[${SYNTHESIS_DIR}/${outcomeStem(outcome)}\\|${cell(outcome.name)}]] | ${p ? `${p.k}${analysis.totals.participants ? ` (${fmtCount(analysis.totals.participants)})` : ""}` : "0"} | `
      + `${p ? `${outcome.measure} ${effectText(outcome.measure, p.est, p.lo, p.hi)}` : "—"} | ${grade.symbol} ${grade.label}${grade.confirmed ? "" : "*"} | ${cell(downgrades(grade) ? "Downgraded for " + downgrades(grade) : "")} |`;
  });
  return frontmatter.serialize(props) + "\n" + ["# Summary of findings", "",
    "| Outcome | Studies (participants) | Effect (95% CI) | Certainty (GRADE) | Comments |", "|---|---|---|---|---|", ...rows, "",
    items.some(i => !i.grade.confirmed) ? "\\* Some GRADE domains are suggestions that the reviewers have not yet confirmed." : "",
    `GRADE: ${Object.values(CERTAINTY).join(", ")}. Effects are ${items.some(i => MEASURES[i.outcome.measure].log) ? "ratios back-transformed from the log scale, or " : ""}differences as stated per outcome.`, ""].join("\n");
}
