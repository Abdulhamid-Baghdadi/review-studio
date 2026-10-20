/**
 * Page: Protocol.
 * @module web/studio/pages/protocol
 */
import { api, busy } from "../core/api.js";
import { autoSave, flushSaves } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { chartingFormCard } from "./charting-form.js";
import { PAGES } from "../shell/registry.js";
import { exampleFor, withScr } from "../shell/help.js";
import { autosize, btn, card, iconBtn, openNote } from "../ui/components.js";

/** Who wrote a protocol section last: you, Claude (a draft to read), or Claude and approved by you. */
function authorPill(key) {
  const m = (S.state.protocol_meta || {})[key];
  if (!m) return null;
  if (m.by === "approved") return h("span", { class: "pill info", style: "margin-left:8px", title: `Drafted by Claude, approved by you on ${m.when}` }, "Claude draft · approved by you");
  return m.by === "claude" ? h("span", { class: "pill warn", style: "margin-left:8px", title: `Drafted by Claude on ${m.when}. Read and edit it to make it yours.` }, "Draft by Claude")
    : h("span", { class: "pill ok", style: "margin-left:8px", title: `Last edited by you on ${m.when}` }, "Edited by you");
}

/** A section's title without its reporting-item reference ("Background and rationale (PRISMA-ScR 3)" → "Background and rationale"): the name of its text field. */
const plainTitle = t => String(t).replace(/\s*\((PRISMA-ScR|PRISMA 2020)[^)]*\)\s*/, " ").trim();
/** The reporting items a section answers, as chips that open the checklist (inside the section: a fold's header holds no buttons). */
const itemChips = t => { const chips = withScr(t).filter(x => x instanceof Node); return chips.length ? h("div", { class: "small muted", style: "margin-top:6px" }, "Reported as ", chips) : null; };

// Two steps share this page code: Inclusion & exclusion rules (the eligibility criteria and the exclusion reasons used in screening)
// and Methods (the data items and the other method sections). Both are saved in the same protocol.
const protocolPage = rules => {
  const d = D.protocol ??= { ...S.state.protocol_text };
  const r = D.reasons ??= { ta: [...S.reasons.ta], ft: [...S.reasons.ft], include: [...(S.reasons.include ?? [])],
    same: S.reasons.ta.join("|") === S.reasons.ft.join("|") };            // full text usually reuses the title/abstract reasons
  const textSaver = autoSave("protocol_text", () => api("save_protocol_text", { text: d }, { render: false, silent: true }), "protocol_text");
  const reasonSaver = autoSave("reasons", () => api("save_reasons", { ta: r.ta, ft: r.same ? r.ta : r.ft, include: r.include }, { render: false, silent: true }), "criteria");
  // one editable list per kind of rule: what a paper must be (include) or the coded reasons to drop it (exclude)
  const ruleList = (key, what, add, start = () => "", placeholder = "") => {
    const wrap = h("div", { class: "stack" });
    const draw = () => wrap.replaceChildren(...r[key].map((x, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
      h("input", { type: "text", value: x, placeholder, "aria-label": `${what} ${i + 1}`, oninput: e => r[key][i] = e.target.value }),
      iconBtn("✕", `Remove ${what.toLowerCase()} ${i + 1}`, () => { r[key].splice(i, 1); draw(); reasonSaver.schedule(); }))),
      btn(add, () => { r[key].push(start()); draw(); wrap.querySelectorAll("input")[r[key].length - 1]?.focus(); }, "sm"));
    draw(); return wrap;
  };
  const reasonList = (key, stage) => ruleList(key, `Exclusion reason, ${stage},`, "+ Add reason", () => `E${r[key].length + 1} `);
  // the full-text reasons: the same list as title and abstract (typed once), or a list of their own
  const ftColumn = () => {
    const box = h("div", {});
    const draw = () => box.replaceChildren(
      h("label", { class: "small", style: "display:flex;gap:6px;align-items:center;margin:4px 0 8px" },
        h("input", { type: "checkbox", checked: r.same, onchange: e => { r.same = e.target.checked; if (!r.same) r.ft = [...r.ta]; draw(); reasonSaver.schedule(); } }),
        "Same reasons as title and abstract"),
      r.same ? h("div", { class: "small muted" }, "Full-text screening uses the list on the left.") : reasonList("ft", "full text"));
    draw(); return box;
  };
  const section = (sct, open) => h("details", { open, style: "border-bottom:1px solid var(--border);padding:8px 0" },
    h("summary", {}, h("b", { style: "color:var(--text)" }, plainTitle(sct.title)), authorPill(sct.key), d[sct.key] ? h("span", { class: "pill ok", style: "margin-left:8px" }, "written") : h("span", { class: "pill", style: "margin-left:8px" }, "empty")),
    itemChips(sct.title),
    sct.key === "sources" ? h("div", { class: "small muted", style: "margin-top:4px" }, "The databases from Search strategy are added to the protocol automatically. Write here what they do not say: search dates, limits and any other sources.") : null,
    h("div", { style: "margin-top:8px" }, autosize(h("textarea", { rows: rules ? 6 : 3, "aria-label": plainTitle(sct.title), value: d[sct.key] || "", placeholder: exampleFor("protocol", sct.key) || exampleFor("protocol", sct.title), oninput: e => d[sct.key] = e.target.value })),
      ((S.state.protocol_meta || {})[sct.key] || {}).by === "claude" ? h("div", { class: "row end", style: "margin-top:6px" },
        btn("✓ Approve as is", () => api("approve_section", { key: sct.key }), "sm")) : null));
  const saveRow = (...extra) => h("div", { class: "row end", style: "margin-top:12px" }, h("span", { class: "small muted", style: "margin-right:auto" }, "Saved as you type."), ...extra,
    rules ? null : btn("Generate the Protocol note", async e => { flushSaves(); await busy(e.currentTarget, () => api("save_protocol_text", { text: d, generate: true })); }, "primary",
      "Writes 05 - Protocol.md from your question, search, rules and these sections"));
  if (rules) {
    const elig = S.protocol_sections.find(sct => sct.key === "eligibility");
    return h("div", {},
      reasonSaver.watch(h("div", {},
        card("Include a paper if…", "One rule per line: what a paper must be or contain. Your question's parts are a good checklist: who or what, which topic, which setting, which publication types. Shown next to every paper while you screen.",
          ruleList("include", "Inclusion criterion", "+ Add criterion", () => "", "e.g. Lithium-ion battery packs or modules")),
        card("Exclude a paper if…", "One rule per line, with a short code first (E1, E2 …). These are the only reasons you can choose when you exclude a paper, and the PRISMA flow counts them.",
          h("div", { class: "grid2" }, h("div", {}, h("b", {}, "Title and abstract"), reasonList("ta", "title and abstract")), h("div", {}, h("b", {}, "Full text"), ftColumn())),
          h("div", { class: "row end small muted", style: "margin-top:12px" }, "Saved as you type.")))),
      textSaver.watch(card("Why these rules", "The reasons behind your rules, in a few sentences. The protocol's eligibility section is this text followed by both lists (PRISMA-ScR 6).",
        elig ? section({ ...elig, title: "Rationale (PRISMA-ScR 6)" }, true) : null, saveRow())));
  }
  return h("div", {},
    chartingFormCard(),
    textSaver.watch(card("Method sections", null, S.protocol_sections.filter(sct => sct.key !== "eligibility").map(sct => section(sct, !d[sct.key])),
      saveRow(btn("Open Protocol in Obsidian", () => openNote("05 - Protocol.md"), "ghost")))));
};
PAGES.protocol = () => protocolPage(true);
PAGES.methods = () => protocolPage(false);

export function lockReadiness() {
  const checks = S.lock_checks, open = checks.filter(c => c.required && !c.ok).length;
  const sup = S.state.supervisor_review || {};
  const who = h("input", { type: "text", placeholder: "Supervisor's name", "aria-label": "Reviewed by (supervisor's name)", value: sup.by || "" });
  return card(open ? `Ready to lock? ${open} thing(s) still open` : "Ready to lock ✓", "Everything a reviewer will look for before the protocol is frozen.",
    h("div", {}, checks.map(c => h("div", { class: "rule", style: "grid-template-columns:26px 1fr" },
      h("span", { style: `font-size:16px;color:${c.ok ? "var(--ok)" : c.required ? "var(--bad)" : "var(--warn)"}` }, c.ok ? "✓" : c.required ? "✕" : "!"),
      h("div", {}, h("b", {}, c.label), c.required ? null : h("span", { class: "small muted" }, " (recommended)"), h("div", { class: "small muted" }, c.detail))))),
    h("div", { class: "row", style: "margin-top:12px;flex-wrap:nowrap" }, h("span", { class: "small muted", style: "white-space:nowrap" }, "Reviewed by"), who,
      btn(sup.by ? "Update" : "Mark as reviewed", () => api("supervisor_review", { by: who.value }), ""),
      sup.by ? btn("Remove", () => api("supervisor_review", { by: "" }), "ghost") : null));
}
