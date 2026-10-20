/**
 * "How it works with Claude": a four-picture strip in the AI card of the steps where Claude can help (in the style of
 * Search & import's strip). It shows who does what: you copy the prompt, Claude Code runs it and only suggests, and
 * you decide each suggestion in the app.
 * @module web/studio/ui/ai-strip
 */
import { h } from "../core/dom.js";

const A = "var(--accent)", M = "var(--faint)", S2 = "var(--surface-2)", SU = "var(--surface)", OK = "var(--ok)", INK = "var(--accent-ink)";

// shared pictures: copy the prompt from this card, paste it in Claude Code
const COPY = ["Copy the prompt", "from this card", `
  <rect x="22" y="12" width="104" height="72" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
  <rect x="32" y="22" width="44" height="7" rx="3.5" fill="${M}" opacity=".5"/>
  <rect x="32" y="36" width="80" height="5" rx="2.5" fill="${M}" opacity=".35"/><rect x="32" y="46" width="64" height="5" rx="2.5" fill="${M}" opacity=".35"/>
  <rect x="32" y="62" width="56" height="14" rx="5" fill="${A}"/><text x="60" y="72" font-size="7.5" text-anchor="middle" font-weight="700" fill="${INK}">Copy prompt</text>
  <rect x="100" y="60" width="14" height="17" rx="3" fill="${SU}" stroke="${A}" stroke-width="1.6"/><rect x="95" y="65" width="14" height="17" rx="3" fill="${SU}" stroke="${A}" stroke-width="1.6"/>`];
const PASTE = ["Paste it in Claude Code", "opened on the app's folder", `
  <rect x="10" y="12" width="128" height="74" rx="8" fill="#1f2333" stroke="${M}" stroke-width="1.5"/>
  <circle cx="20" cy="21" r="2.5" fill="#ff6b6b"/><circle cx="28" cy="21" r="2.5" fill="#ffd166"/><circle cx="36" cy="21" r="2.5" fill="#06d6a0"/>
  <text x="20" y="44" font-size="9" fill="#9aa3ff" font-family="monospace">&gt;</text>
  <rect x="30" y="37" width="86" height="8" rx="2" fill="#9aa3ff" opacity=".55"/>
  <rect x="20" y="54" width="60" height="5" rx="2.5" fill="#cfd3ea" opacity=".35"/><rect x="20" y="64" width="78" height="5" rx="2.5" fill="#cfd3ea" opacity=".35"/>
  <rect x="116" y="38" width="3" height="8" fill="#cfd3ea"/>`];

// you decide: a record with its decision keys (I include, U unsure, E exclude)
const decideArt = keys => {
  const w = keys.length === 3 ? 32 : 48, step = keys.length === 3 ? 36 : 54;
  return `
  <rect x="12" y="10" width="124" height="78" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
  <rect x="22" y="20" width="80" height="7" rx="3.5" fill="${M}" opacity=".5"/><rect x="22" y="32" width="100" height="5" rx="2.5" fill="${M}" opacity=".3"/><rect x="22" y="41" width="90" height="5" rx="2.5" fill="${M}" opacity=".3"/>
  ${keys.map(([k, c], i) => `<rect x="${22 + i * step}" y="58" width="${w}" height="20" rx="5" fill="${S2}" stroke="${c}" stroke-width="1.6"/><text x="${22 + i * step + w / 2}" y="71.5" font-size="10" text-anchor="middle" font-weight="700" fill="${c}">${k}</text>`).join("")}`;
};

// a small "AI" badge, so the pictures show which marks are Claude's
const badge = (x, y) => `<rect x="${x}" y="${y}" width="18" height="11" rx="3" fill="#f59e0b"/><text x="${x + 9}" y="${y + 8.3}" font-size="7" text-anchor="middle" font-weight="700" fill="#1f2333">AI</text>`;

/** The third and fourth pictures per step: what Claude does, and what you do. */
const STEPS = {
  ta: [
    ["Claude suggests", "include or exclude, with a reason", `
      <rect x="12" y="10" width="124" height="78" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      ${[22, 44, 66].map((y, i) => `<rect x="22" y="${y}" width="56" height="6" rx="3" fill="${M}" opacity=".4"/><rect x="22" y="${y + 9}" width="40" height="4" rx="2" fill="${M}" opacity=".25"/>
        <rect x="88" y="${y}" width="${i === 1 ? 40 : 34}" height="12" rx="4" fill="${S2}" stroke="${i === 1 ? "var(--bad)" : OK}" stroke-width="1.3"/>
        <text x="${i === 1 ? 108 : 105}" y="${y + 8.5}" font-size="7" text-anchor="middle" fill="${i === 1 ? "var(--bad)" : OK}" font-weight="700">${i === 1 ? "exclude E2" : "include"}</text>`).join("")}
      ${badge(118, 4)}`],
    ["You decide each one", "Suggested queue: Enter keeps it, I U E changes it", decideArt([["I", OK], ["U", "#f59e0b"], ["E", "var(--bad)"]])],
  ],
  ft: [
    ["Claude reads each PDF", "and suggests a decision with page numbers", `
      <path d="M30 8h44l16 16v62a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <rect x="32" y="20" width="22" height="11" rx="3" fill="var(--bad)"/><text x="43" y="28.5" font-size="7" text-anchor="middle" font-weight="700" fill="#fff">PDF</text>
      ${[40, 49, 58, 67].map(y => `<rect x="34" y="${y}" width="${y === 58 ? 30 : 46}" height="4" rx="2" fill="${M}" opacity=".35"/>`).join("")}
      <rect x="32" y="56" width="50" height="8" rx="2" fill="#fde68a" opacity=".7"/>
      <rect x="96" y="40" width="44" height="26" rx="5" fill="${S2}" stroke="${OK}" stroke-width="1.3"/><text x="118" y="51" font-size="7" text-anchor="middle" fill="${OK}" font-weight="700">include</text><text x="118" y="61" font-size="6.5" text-anchor="middle" fill="${M}">p. 4</text>
      ${badge(120, 22)}`],
    ["You decide each one", "Suggested queue: Enter keeps it, I or E changes it", decideArt([["I", OK], ["E", "var(--bad)"]])],
  ],
  retrieval: [
    ["Claude finds the PDFs", "open access first, attached to each paper", `
      <rect x="10" y="12" width="70" height="56" rx="7" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <rect x="18" y="22" width="44" height="12" rx="6" fill="${S2}" stroke="${A}" stroke-width="1.2"/><text x="24" y="30.5" font-size="6.5" fill="${A}" font-family="monospace">doi.org/…</text>
      <rect x="18" y="42" width="50" height="5" rx="2.5" fill="${M}" opacity=".35"/><rect x="18" y="52" width="38" height="5" rx="2.5" fill="${M}" opacity=".35"/>
      <path d="M84 40h18m-6-6 6 6-6 6" fill="none" stroke="${A}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M110 22h20l10 10v44a3 3 0 0 1-3 3h-27a3 3 0 0 1-3-3V25a3 3 0 0 1 3-3z" fill="${SU}" stroke="${M}" stroke-width="1.4"/>
      <rect x="111" y="38" width="20" height="10" rx="3" fill="var(--bad)"/><text x="121" y="45.5" font-size="6.5" text-anchor="middle" font-weight="700" fill="#fff">PDF</text>
      ${badge(64, 4)}`],
    ["You check each PDF", "is it the same paper? replace it if not", `
      <path d="M40 10h44l16 16v60a4 4 0 0 1-4 4H40a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <rect x="44" y="22" width="44" height="7" rx="3.5" fill="${M}" opacity=".55"/><rect x="44" y="34" width="30" height="5" rx="2.5" fill="${M}" opacity=".35"/>
      ${[48, 57, 66].map(y => `<rect x="44" y="${y}" width="46" height="4" rx="2" fill="${M}" opacity=".25"/>`).join("")}
      <circle cx="108" cy="72" r="11" fill="${OK}"/><path d="M102 72l4 4 8-9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`],
  ],
  charting: [
    ["Claude fills the form", "empty fields only, with page numbers", `
      <rect x="14" y="8" width="120" height="82" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      ${[16, 40, 64].map((y, i) => `<rect x="24" y="${y}" width="36" height="5" rx="2.5" fill="${M}" opacity=".55"/><rect x="24" y="${y + 8}" width="100" height="12" rx="3" fill="${S2}" stroke="${i < 2 ? "#f59e0b" : M}" stroke-width="1.2"/>${i < 2 ? `<rect x="28" y="${y + 12}" width="${i ? 52 : 70}" height="4" rx="2" fill="${M}" opacity=".5"/><text x="118" y="${y + 17}" font-size="6" text-anchor="end" fill="${M}">p. ${i ? 7 : 3}</text>` : ""}`).join("")}
      ${badge(114, 2)}`],
    ["You check each paper", "against the page, then Checked — next", `
      <rect x="14" y="8" width="120" height="82" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      ${[16, 36].map(y => `<rect x="24" y="${y}" width="36" height="5" rx="2.5" fill="${M}" opacity=".55"/><rect x="24" y="${y + 8}" width="100" height="10" rx="3" fill="${S2}" stroke="${OK}" stroke-width="1.2"/>`).join("")}
      <rect x="44" y="64" width="60" height="17" rx="5" fill="${A}"/><text x="74" y="75.5" font-size="7.5" text-anchor="middle" font-weight="700" fill="${INK}">Checked — next</text>`],
  ],
};

/**
 * The strip for an AI step. @param {"ta"|"ft"|"retrieval"|"charting"} which titles and abstracts, full texts,
 * getting full texts, or charting @returns {HTMLElement|null}
 */
export function aiStrip(which) {
  const steps = STEPS[which];
  if (!steps) return null;
  const pics = [COPY, PASTE, ...steps];
  return h("div", { class: "imp-strip ai-strip", role: "img", "aria-label": pics.map(([t, sub]) => `${t}, ${sub}`).join("; then ") },
    pics.flatMap(([t, sub, art], i) => [i ? h("div", { class: "imp-arrow", "aria-hidden": "true" }, "→") : null,
      h("figure", { class: "imp-pic" }, h("div", { html: `<svg viewBox="0 0 148 96" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">${art}</svg>` }),
        h("figcaption", {}, h("b", {}, `${i + 1} · ${t}`), h("span", {}, sub)))]));
}
