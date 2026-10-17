/**
 * Page: Concepts.
 * @module web/studio/pages/concepts
 */
import { api } from "../core/api.js";
import { autoSave } from "../core/autosave.js";
import { debounce, h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { btn, card, chipsInput, copy, hlQuery, segmented } from "../ui/components.js";

PAGES.concepts = () => {
  const d = D.concepts ??= JSON.parse(JSON.stringify(S.state.concepts));
  const list = h("div", {}), preview = h("div", { class: "code" });
  const tabs = h("div", { class: "tabs" });
  let db = D.previewDb || S.state.queries.databases[0];
  const saver = autoSave("concepts", () => api("save_concepts", { concepts: d, why: D.cwhy || "" }, { render: false, silent: true }), "concepts");
  const refresh = debounce(async () => {
    if (JSON.stringify(d) !== JSON.stringify(S.state.concepts)) saver.schedule();
    try {
      const r = await api("preview_queries", { concepts: d }, { silent: true, quietError: true });
      D.previews = r.queries; drawPreview();
    } catch (e) { /* ignore */ }
  }, 250);
  const drawPreview = () => {
    tabs.replaceChildren(...S.state.queries.databases.map(x => h("button", { class: x === db ? "on" : "", onclick: () => { db = D.previewDb = x; drawPreview(); } }, x)));
    preview.innerHTML = hlQuery((D.previews || S.queries)[db] || "(add a concept with terms)");
  };
  const draw = () => {
    list.replaceChildren(...d.flatMap((c, i) => [i ? h("div", { class: "joiner" }, c.role === "NOT" ? "AND NOT" : "AND") : [],
      h("div", { class: "concept " + (c.role === "NOT" ? "not" : "and") },
        h("div", { class: "head" },
          h("input", { type: "text", value: c.name, placeholder: "Concept name", oninput: e => { c.name = e.target.value; refresh(); } }),
          segmented([["AND", "AND"], ["NOT", "NOT"]], c.role || "AND", v => { c.role = v; draw(); refresh(); }),
          h("span", { class: "spacer", style: "flex:1" }),
          btn("↑", () => { if (i) { [d[i - 1], d[i]] = [d[i], d[i - 1]]; draw(); refresh(); } }, "ghost icon"),
          btn("↓", () => { if (i < d.length - 1) { [d[i + 1], d[i]] = [d[i], d[i + 1]]; draw(); refresh(); } }, "ghost icon"),
          btn("🗑", () => { d.splice(i, 1); draw(); refresh(); }, "ghost icon danger")),
        chipsInput(c.terms, () => refresh()),
        h("div", { class: "small muted", style: "margin-top:5px" }, `${c.terms.length} term(s) · joined with OR · * = any ending, e.g. repairab* → repairable, repairability`))]));
  };
  draw(); drawPreview(); refresh();
  const page = h("div", { onfocusout: saver.commit },
    h("div", { class: "grid2" },
      h("div", {}, card("Keyword blocks", "One block per idea in your question. A paper needs any word from a block (OR) and a match in every block (AND).",
        list, h("div", { class: "row", style: "margin-top:12px" },
          btn("+ Add concept", () => { d.push({ name: "", role: "AND", terms: [] }); draw(); }, ""),
          h("span", { class: "small muted" }, "Saved as you type.")),
        h("input", { type: "text", placeholder: "Why it changed (optional; kept with this version)", value: D.cwhy || "", style: "margin-top:8px", oninput: e => { D.cwhy = e.target.value; saver.schedule(); } })),
        conceptHistory()),
      h("div", {}, card("Live search string", "Updates as you type. The final strings, and hand edits, are on the Search strings tab.", tabs, preview,
        h("div", { class: "row end", style: "margin-top:10px" }, btn("Copy", () => copy(preview.textContent), "sm"))))));
  return page;
};

function conceptHistory() {
  const hist = [...(S.state.concepts_history || [])].reverse();
  if (!hist.length) return null;
  return card("Earlier versions", `${hist.length} earlier version(s), newest first — the reason for each change is reported with the search strategy`,
    hist.map((v, i) => h("details", { style: "padding:6px 0;border-bottom:1px solid var(--border)" },
      h("summary", {}, h("b", {}, `v${hist.length - i}`), ` · ${v.when} — `, v.why || "no reason given"),
      h("div", { class: "small", style: "padding:6px 0 0 14px" }, v.concepts.map(c => h("div", {}, h("b", {}, c.name), c.role === "NOT" ? " (NOT)" : "", ": ", c.terms.join(" · ")))))));
}
