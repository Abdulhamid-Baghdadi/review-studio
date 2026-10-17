/**
 * Charts drawn as SVG: the κ gauge, the PRISMA flow diagram and the pilot recall chart.
 * @module web/studio/ui/charts
 */
import { esc, h } from "../core/dom.js";

export function svg(w, hgt, inner) { return h("div", { html: `<svg viewBox="0 0 ${w} ${hgt}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">${inner}</svg>` }); }

export function gauge(k) {
  const v = k == null ? 0 : Math.max(-0.2, Math.min(1, k));
  const ang = Math.PI * (1 - (v + 0.2) / 1.2);
  const x = 90 + 70 * Math.cos(ang), y = 90 - 70 * Math.sin(ang);
  const color = k == null ? "var(--faint)" : k >= 0.6 ? "var(--ok)" : k >= 0.4 ? "var(--warn)" : "var(--bad)";
  const big = (v + 0.2) / 1.2 > 0.5 ? 1 : 0;
  return svg(180, 110, `
    <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--surface-2)" stroke-width="14" stroke-linecap="round"/>
    ${k == null ? "" : `<path d="M20 90 A70 70 0 ${big > 1 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>`}
    <text x="90" y="84" text-anchor="middle" font-size="26" font-weight="700" fill="var(--text)">${k == null ? "–" : k.toFixed(2)}</text>
    <text x="90" y="104" text-anchor="middle" font-size="11" fill="var(--muted)">Cohen's κ</text>`);
}

/** The PRISMA flow diagram; `here` (a box: identified, screened, sought, assessed, included) is highlighted instead of the screening boxes. */
export function flowDiagram(f, here) {
  const mark = (id, dflt) => here === undefined ? dflt : here === id;
  const W = 760, bw = 330, gap = 60, x1 = 20, x2 = x1 + bw + gap;
  let y = 14, out = "";
  const box = (x, y, w, hh, lines, strong) => {
    out += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="10" fill="${strong ? "var(--accent-2)" : "var(--surface)"}" stroke="${strong ? "var(--accent)" : "var(--border)"}" stroke-width="${strong && here !== undefined ? 3 : 1.5}"/>`;
    lines.forEach((l, i) => out += `<text x="${x + w / 2}" y="${y + 22 + i * 17}" text-anchor="middle" font-size="${i ? 12 : 13}" ${i ? 'fill="var(--muted)"' : 'font-weight="600" fill="var(--text)"'}>${esc(l)}</text>`);
  };
  const arrow = (xa, ya, xb, yb) => out += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="var(--faint)" stroke-width="1.6" marker-end="url(#ah)"/>`;
  out += `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--faint)"/></marker></defs>`;
  const dbl = f.db.map(d => `${d.name}: ${d.n}`).slice(0, 3), otl = f.other.map(d => `${d.name.replace(/ \(.*\)/, "")}: ${d.n}`).slice(0, 3);
  const hTop = 34 + Math.max(dbl.length, otl.length, 1) * 17;
  box(x1, y, bw, hTop, [`Identified — databases (n = ${f.n_db})`, ...dbl], mark("identified", false));
  box(x2, y, bw, hTop, [`Identified — other sources (n = ${f.n_other})`, ...otl], mark("identified", false));
  y += hTop + 26; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2); arrow(x2 + bw / 2, y - 26, x1 + bw / 2 + 40, y - 2);
  box(x1, y, bw, 50, [`Screened — title/abstract (n = ${f.unique})`, `${f.duplicates} duplicates removed · ${f.ta_pending} still open`], mark("screened", true));
  box(x2, y, bw, 50, [`Excluded (n = ${f.ta_excluded})`, Object.entries(f.ta_reasons).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 52)]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  box(x1, y, bw, 50, [`Sought for retrieval (n = ${f.sought})`, `include ${f.ta_include} · unsure ${f.ta_unsure}`], mark("sought", false));
  box(x2, y, bw, 50, [`Not retrieved (n = ${f.not_retrieved})`, ""]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  box(x1, y, bw, 50, [`Assessed — full text (n = ${f.assessed})`, `${f.ft_pending} still open`], mark("assessed", true));
  box(x2, y, bw, 50, [`Excluded (n = ${f.ft_excluded})`, Object.entries(f.ft_reasons).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 52)]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  out += `<rect x="${x1}" y="${y}" width="${bw}" height="50" rx="10" fill="var(--ok-bg)" stroke="var(--ok)" stroke-width="${here === "included" ? 3.5 : 1.5}"/><text x="${x1 + bw / 2}" y="${y + 30}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ok)">Included (n = ${f.included})</text>`;
  return h("div", { class: "flow" }, svg(W, y + 62, out));
}

export function pilotChart(pilots) {
  const rows = pilots.slice(-8);
  if (!rows.length) return h("div", { class: "empty" }, h("div", { class: "big" }, "🧪"), "No pilots yet. Run one above.");
  const W = 760, rh = 34, H0 = rows.length * rh + 30;
  let out = `<text x="250" y="14" font-size="11" fill="var(--muted)">test-set recall</text><text x="${W - 4}" y="14" text-anchor="end" font-size="11" fill="var(--muted)">hits</text>`;
  rows.forEach((p, i) => {
    const y = 24 + i * rh, rec = p.test_set ? p.retrieved / p.test_set : null;
    const label = `${p.when.slice(5, 16)} · ${p.note || p.database}`.slice(0, 34);
    out += `<text x="0" y="${y + 15}" font-size="12" fill="var(--text)">${esc(label)}</text>`;
    out += `<rect x="250" y="${y + 4}" width="400" height="14" rx="7" fill="var(--surface-2)"/>`;
    if (rec != null) out += `<rect x="250" y="${y + 4}" width="${Math.max(4, 400 * rec)}" height="14" rx="7" fill="${rec >= .8 ? "var(--ok)" : rec >= .5 ? "var(--warn)" : "var(--bad)"}"/><text x="${256 + 400 * rec}" y="${y + 15}" font-size="11" font-weight="700" fill="var(--text)">${p.retrieved}/${p.test_set}</text>`;
    else out += `<text x="258" y="${y + 15}" font-size="11" fill="var(--muted)">not checked</text>`;
    out += `<text x="${W - 4}" y="${y + 15}" text-anchor="end" font-size="12" font-weight="600" fill="var(--text)">${Number(p.hits).toLocaleString()}</text>`;
  });
  return svg(W, H0, out);
}
