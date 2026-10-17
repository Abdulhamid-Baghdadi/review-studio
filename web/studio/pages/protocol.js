/**
 * Page: Protocol.
 * @module web/studio/pages/protocol
 */
import { api, busy } from "../core/api.js";
import { autoSave, flushSaves } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, PART, S } from "../core/state.js";
import { authorPill } from "./pilot.js";
import { PAGES } from "../shell/registry.js";
import { exampleFor, withScr } from "../shell/help.js";
import { autosize, btn, card, iconBtn, openNote } from "../ui/components.js";

// One step, two tabs: the inclusion and exclusion rules (eligibility criteria and the exclusion reasons used in
// screening), and the other method sections of the protocol. Both are saved in the same protocol.
PAGES.protocol = () => {
  const d = D.protocol ??= { ...S.state.protocol_text };
  const r = D.reasons ??= { ta: [...S.reasons.ta], ft: [...S.reasons.ft] };
  const rules = (PART.protocol ?? "rules") === "rules";
  const textSaver = autoSave("protocol_text", () => api("save_protocol_text", { text: d }, { render: false, silent: true }), "protocol_text");
  const reasonSaver = autoSave("reasons", () => api("save_reasons", r, { render: false, silent: true }), "criteria");
  const reasonList = key => {
    const wrap = h("div", { class: "stack" });
    const draw = () => wrap.replaceChildren(...r[key].map((x, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
      h("input", { type: "text", value: x, oninput: e => r[key][i] = e.target.value }), iconBtn("✕", "Remove", () => { r[key].splice(i, 1); draw(); reasonSaver.schedule(); }))),
      btn("+ Add reason", () => { r[key].push(`E${r[key].length + 1} `); draw(); }, "sm"));
    draw(); return wrap;
  };
  const section = (sct, open) => h("details", { open, style: "border-bottom:1px solid var(--border);padding:8px 0" },
    h("summary", {}, h("b", { style: "color:var(--text)" }, withScr(sct.title)), authorPill(sct.key), d[sct.key] ? h("span", { class: "pill ok", style: "margin-left:8px" }, "written") : h("span", { class: "pill", style: "margin-left:8px" }, "empty")),
    h("div", { style: "margin-top:8px" }, autosize(h("textarea", { rows: rules ? 6 : 3, value: d[sct.key] || "", placeholder: exampleFor("protocol", sct.key) || exampleFor("protocol", sct.title), oninput: e => d[sct.key] = e.target.value })),
      ((S.state.protocol_meta || {})[sct.key] || {}).by === "claude" ? h("div", { class: "row end", style: "margin-top:6px" },
        btn("✓ Approve as is", () => api("approve_section", { key: sct.key }), "sm")) : null));
  const saveRow = (...extra) => h("div", { class: "row end", style: "margin-top:12px" }, h("span", { class: "small muted", style: "margin-right:auto" }, "Saved as you type."), ...extra,
    rules ? null : btn("Generate the Protocol note", async e => { flushSaves(); await busy(e.currentTarget, () => api("save_protocol_text", { text: d, generate: true })); }, "primary",
      "Writes 05 - Protocol.md from your question, search, rules and these sections"));
  if (rules) {
    const elig = S.protocol_sections.find(sct => sct.key === "eligibility");
    return h("div", {},
      textSaver.watch(card("Who is in, who is out", "Describe the papers you want (include) and the ones you don't (exclude), with a short reason for each rule. Your question's parts are a good checklist: who or what, which topic, which setting, which publication types.",
        elig ? section({ ...elig, title: elig.title.replace(/^Eligibility criteria/, "Inclusion and exclusion criteria") }, true) : null, saveRow())),
      reasonSaver.watch(card("Exclusion reasons for screening", "The only reasons you can choose when you exclude a paper. Short code first (E1, E2 …), so screeners can type just the code.",
        h("div", { class: "grid2" }, h("div", {}, h("b", {}, "Title and abstract"), reasonList("ta")), h("div", {}, h("b", {}, "Full text"), reasonList("ft"))),
        h("div", { class: "row end small muted", style: "margin-top:12px" }, "Saved as you type."))));
  }
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:16px" }, "Your question, search strings, test results and inclusion rules are added to the protocol automatically. Write the remaining sections below, then generate the Protocol note."),
    textSaver.watch(card("Method sections", null, S.protocol_sections.filter(sct => sct.key !== "eligibility").map(sct => section(sct, !d[sct.key])),
      saveRow(btn("Open Protocol in Obsidian", () => openNote("05 - Protocol.md"), "ghost")))));
};

export function lockReadiness() {
  const checks = S.lock_checks, open = checks.filter(c => c.required && !c.ok).length;
  const sup = S.state.supervisor_review || {};
  const who = h("input", { type: "text", placeholder: "Supervisor's name", value: sup.by || "" });
  return card(open ? `Ready to lock? ${open} thing(s) still open` : "Ready to lock ✓", "Everything a reviewer will look for before the protocol is frozen.",
    h("div", {}, checks.map(c => h("div", { class: "rule", style: "grid-template-columns:26px 1fr" },
      h("span", { style: `font-size:16px;color:${c.ok ? "var(--ok)" : c.required ? "var(--bad)" : "var(--warn)"}` }, c.ok ? "✓" : c.required ? "✕" : "!"),
      h("div", {}, h("b", {}, c.label), c.required ? null : h("span", { class: "small muted" }, " (recommended)"), h("div", { class: "small muted" }, c.detail))))),
    h("div", { class: "row", style: "margin-top:12px;flex-wrap:nowrap" }, h("span", { class: "small muted", style: "white-space:nowrap" }, "Reviewed by"), who,
      btn(sup.by ? "Update" : "Mark as reviewed", () => api("supervisor_review", { by: who.value }), ""),
      sup.by ? btn("Remove", () => api("supervisor_review", { by: "" }), "ghost") : null));
}
