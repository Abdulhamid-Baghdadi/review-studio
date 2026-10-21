/**
 * "Your review is a folder": three pictures for the Homepage (in the style of the import and AI strips). The review
 * is a folder on the reviewer's PC; every paper is a plain Markdown note with its decisions as properties; the same
 * folder opens in Obsidian, where the screening table is an Obsidian Bases view. Names are the app's real ones.
 * @module web/studio/ui/folder-strip
 */
import { h } from "../core/dom.js";

const M = "var(--faint)", SU = "var(--surface)", S2 = "var(--surface-2)", T = "var(--text)", A = "var(--accent)", OK = "var(--ok)", BAD = "var(--bad)";
const OBS = "#8b5cf6";                                    // the purple of the Obsidian picture (its windows, not a logo)

// a window frame with a title bar
const frame = (title, accent = M) => `
  <rect x="4" y="4" width="212" height="132" rx="9" fill="${SU}" stroke="${M}" stroke-width="1.4"/>
  <path d="M4 13a9 9 0 0 1 9-9h194a9 9 0 0 1 9 9v9H4z" fill="${S2}"/>
  <circle cx="14" cy="13" r="2.6" fill="${accent}"/><circle cx="22" cy="13" r="2.6" fill="${M}" opacity=".5"/><circle cx="30" cy="13" r="2.6" fill="${M}" opacity=".5"/>
  <text x="40" y="16.2" font-size="7.6" fill="${T}" font-weight="600">${title}</text>`;
const folder = (x, y, c = "#f5b84a") => `<path d="M${x} ${y}h5l1.6 2H${x + 11}v7H${x}z" fill="${c}"/>`;
const file = (x, y, c = M) => `<path d="M${x} ${y}h6l3 3v7h-9z" fill="none" stroke="${c}" stroke-width="1.1"/>`;
const row = (x, y, icon, label, opts = {}) => `${icon}<text x="${x + 14}" y="${y + 7.5}" font-size="7.4" fill="${opts.c ?? T}" ${opts.b ? 'font-weight="700"' : ""}>${label}</text>`;

const PICS = [
  ["A folder on your PC", "plain files you can open, copy and back up", `${frame("My review records")}
    ${row(14, 30, folder(14, 30), "08 - Records", { b: true })}
    ${row(26, 43, file(26, 43, A), "R0001 - 2021 - Li et al.md")}
    ${row(26, 55, file(26, 55, A), "R0002 - 2024 - Pérez et al.md")}
    ${row(26, 67, file(26, 67, A), "R0003 - 2024 - Taheri et al.md")}
    ${row(14, 81, folder(14, 81), "10 - Full texts", { b: true })}
    ${row(26, 94, file(26, 94, BAD), "R0016 - 2023 - Zhou et al.pdf")}
    ${row(14, 108, file(14, 108), "07 - Searches.csv")}
    ${row(14, 120, file(14, 120), "05 - Protocol.md")}`],
  ["Every paper is a note", "its decisions are properties, readable as text", `${frame("R0016 - 2023 - Zhou et al.md")}
    <rect x="12" y="28" width="196" height="50" rx="6" fill="${S2}"/>
    ${[["title_abstract_decision", "include", OK], ["full_text_decision", "include", OK], ["full_text_reason", "—", M], ["screened_by", "AB", T]]
      .map(([k, v, c], i) => `<text x="19" y="${40 + i * 11}" font-size="7.2" fill="${M}">${k}</text><text x="118" y="${40 + i * 11}" font-size="7.2" fill="${c}" font-weight="700">${v}</text>`).join("")}
    <text x="14" y="94" font-size="9" fill="${T}" font-weight="700"># Permanent magnetization remanufacturing</text>
    <text x="14" y="107" font-size="7.4" fill="${T}" font-weight="700">## Abstract</text>
    <rect x="14" y="113" width="180" height="4" rx="2" fill="${M}" opacity=".35"/><rect x="14" y="121" width="150" height="4" rx="2" fill="${M}" opacity=".35"/>`],
  ["Open the folder in Obsidian", "the same notes, with tables and links", `${frame("Obsidian · My review records", OBS)}
    <rect x="5" y="22" width="56" height="113" fill="${S2}"/>
    ${row(9, 30, folder(9, 30, OBS), "Records", { c: T })}
    ${row(9, 43, file(9, 43, OBS), "Screening", { c: OBS, b: true })}
    ${row(9, 56, file(9, 56, M), "Protocol")}
    ${row(9, 69, file(9, 69, M), "Timeline")}
    <text x="70" y="34" font-size="8" fill="${T}" font-weight="700">08 - Screening.base</text>
    <rect x="68" y="40" width="140" height="11" rx="2" fill="${S2}"/>
    <text x="72" y="48" font-size="6.8" fill="${M}" font-weight="700">Paper</text><text x="160" y="48" font-size="6.8" fill="${M}" font-weight="700">Decision</text>
    ${[["Zhou et al. 2023", "include", OK], ["Taheri et al. 2024", "include", OK], ["Li et al. 2021", "exclude", BAD], ["Heim et al. 2025", "include", OK], ["Ren et al. 2017", "exclude", BAD]]
      .map(([p, d, c], i) => `<text x="72" y="${62 + i * 13}" font-size="6.8" fill="${T}">${p}</text><circle cx="163" cy="${59.5 + i * 13}" r="2.6" fill="${c}"/><text x="168" y="${62 + i * 13}" font-size="6.8" fill="${c}" font-weight="700">${d}</text>`).join("")}`],
];

/** The strip: a folder on your PC → every paper a note → the folder in Obsidian. */
export function folderStrip() {
  return h("div", { class: "imp-strip folder-strip", role: "img", "aria-label": PICS.map(([t, sub]) => `${t}: ${sub}`).join("; then ") },
    PICS.flatMap(([t, sub, art], i) => [i ? h("div", { class: "imp-arrow", "aria-hidden": "true" }, "→") : null,
      h("figure", { class: "imp-pic" }, h("div", { html: `<svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">${art}</svg>` }),
        h("figcaption", {}, h("b", {}, `${i + 1} · ${t}`), h("span", {}, sub)))]));
}
