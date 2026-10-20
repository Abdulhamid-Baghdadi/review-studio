/**
 * Page: Search strategy — the keyword blocks and, beside them, the search string they make for each database.
 * @module web/studio/pages/concepts
 */
import { api } from "../core/api.js";
import { autoSave } from "../core/autosave.js";
import { debounce, h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { btn, card, chipsInput, field, iconBtn, segmented } from "../ui/components.js";
import { searchStringCards } from "./queries.js";
import { announce } from "../ui/dialogs.js";

PAGES.concepts = () => {
  const d = D.concepts ??= JSON.parse(JSON.stringify(S.state.concepts));
  const list = h("div", {});
  const strings = searchStringCards(() => D.previews || S.queries);
  const saver = autoSave("concepts", () => api("save_concepts", { concepts: d, why: D.cwhy || "" }, { render: false, silent: true }), "concepts");
  const refresh = debounce(async () => {
    if (JSON.stringify(d) !== JSON.stringify(S.state.concepts)) saver.schedule();
    try {
      const r = await api("preview_queries", { concepts: d }, { silent: true, quietError: true });
      D.previews = r.queries; strings.update();
    } catch (e) { /* ignore */ }
  }, 250);
  // a deleted block stays one click away: its place shows "deleted · Undo" until the next change of the blocks
  const restore = () => { const { block, index } = D.deletedBlock; d.splice(Math.min(index, d.length), 0, block); D.deletedBlock = null; draw(); refresh();
    announce(`Block “${block.name || "unnamed"}” restored.`); };
  const remove = i => { D.deletedBlock = { block: d[i], index: i }; d.splice(i, 1); draw(); refresh();
    announce(`Block “${D.deletedBlock.block.name || "unnamed"}” deleted. Undo is in its place.`); };
  const restructure = change => () => { D.deletedBlock = null; change(); draw(); refresh(); };
  const deleted = () => D.deletedBlock && h("div", { class: "deleted-block" },
    h("span", {}, `Block “${D.deletedBlock.block.name || "unnamed"}” deleted (${D.deletedBlock.block.terms.length} term(s)).`), btn("↶ Undo", restore, "sm"));
  const draw = () => {
    const blocks = d.flatMap((c, i) => [i ? h("div", { class: "joiner" }, c.role === "NOT" ? "AND NOT" : "AND") : [],
      h("div", { class: "concept " + (c.role === "NOT" ? "not" : "and") },
        h("div", { class: "head" },
          h("input", { type: "text", value: c.name, placeholder: "Concept name", "aria-label": `Name of keyword block ${i + 1}`, oninput: e => { c.name = e.target.value; refresh(); } }),
          segmented([["AND", "AND"], ["NOT", "NOT"]], c.role || "AND", v => { c.role = v; draw(); refresh(); }, "How this block joins the search"),
          h("span", { class: "spacer", style: "flex:1" }),
          Object.assign(iconBtn("↑", "Move this block up", restructure(() => { [d[i - 1], d[i]] = [d[i], d[i - 1]]; })), { disabled: !i }),
          Object.assign(iconBtn("↓", "Move this block down", restructure(() => { [d[i + 1], d[i]] = [d[i], d[i + 1]]; })), { disabled: i === d.length - 1 }),
          iconBtn("🗑", `Delete the block “${c.name || "unnamed"}”`, () => remove(i), "danger block-delete")),   // set apart from ↑ ↓ (a slip there deletes)
        chipsInput(c.terms, () => refresh(), undefined, `Add a term to “${c.name || `block ${i + 1}`}”`),
        h("div", { class: "small muted", style: "margin-top:5px" }, `${c.terms.length} term(s) · joined with OR · * = any ending, e.g. repairab* → repairable, repairability`))]);
    if (D.deletedBlock) blocks.splice(Math.min(D.deletedBlock.index, d.length) * 2, 0, deleted());   // two nodes per block (joiner + block)
    list.replaceChildren(...blocks.flat());
  };
  draw(); refresh();
  const page = h("div", { onfocusout: saver.commit },
    h("div", { class: "grid2" },
      h("div", {}, card("Keyword blocks", "One block per idea in your question. A paper needs any word from a block (OR) and a match in every block (AND).",
        list, h("div", { class: "row", style: "margin-top:12px" },
          btn("+ Add concept", () => { D.deletedBlock = null; d.push({ name: "", role: "AND", terms: [] }); draw(); }, ""),   // saved once it has a name or terms
          h("span", { class: "small muted" }, "Saved as you type.")),
        h("div", { style: "margin-top:8px" }, field("Why it changed (optional; kept with this version)",
          h("input", { type: "text", placeholder: "e.g. added synonyms found in the first papers", value: D.cwhy || "", oninput: e => { D.cwhy = e.target.value; saver.schedule(); } })))),
        conceptHistory()),
      strings.el));
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
