/**
 * The search strings and databases of the Search strategy page (shown beside the keyword blocks, see concepts.js).
 * @module web/studio/pages/queries
 */
import { api } from "../core/api.js";
import { autoSave, runSave } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { render } from "../shell/chrome.js";
import { autosize, btn, card, chipsInput, copy, hlQuery, pill } from "../ui/components.js";

/**
 * The search string per database, ready to copy, with a hand edit; and the list of databases.
 * @param {() => Record<string, string>} generated the strings made from the keyword blocks on screen (updated as you type)
 * @returns {{el: HTMLElement, update: () => void}}
 */
export function searchStringCards(generated) {
  const dbs = [...S.state.queries.databases];
  const box = h("div", {});
  const update = () => {
    const db = D.qdb && dbs.includes(D.qdb) ? D.qdb : dbs[0];
    if (!db) { box.replaceChildren(h("div", { class: "small muted" }, "Add a database below.")); return; }
    const manual = S.manual.includes(db), editing = D.qedit === db;
    const q = (manual ? S.queries[db] : generated()[db] ?? S.queries[db]) || "";
    const ta = autosize(h("textarea", { class: "code", rows: 5, value: q, "aria-label": `Search string for ${db}` }));
    const saver = autoSave("query:" + db, () => api("save_manual_query", { db, text: ta.value }, { render: false, silent: true }), "concepts");
    if (editing) saver.watch(ta);
    box.replaceChildren(
      h("div", { class: "tabs", role: "group", "aria-label": "Database" }, dbs.map(x => h("button", { class: x === db ? "on" : "", "aria-pressed": String(x === db), onclick: () => { D.qdb = x; D.qedit = null; update(); } }, x, S.manual.includes(x) ? " ✎" : ""))),
      h("div", { class: "row", style: "margin-bottom:8px" }, pill(manual ? "edited by hand" : "made from your keyword blocks, updates as you type", manual ? "warn" : "accent"),
        db === "OpenAlex" && !manual ? openalexNote() : null),
      editing ? ta : h("div", { class: "code", html: hlQuery(q || "(add a keyword block with terms)") }),
      h("div", { class: "row end", style: "margin-top:10px" },
        editing ? [h("span", { class: "small muted" }, "Saved as you type."), btn("✓ Done", async () => { await runSave("query:" + db, () => api("save_manual_query", { db, text: ta.value }, { silent: true })); D.qedit = null; render(); }, "primary")]
          : [manual ? btn("Use generated", () => api("save_manual_query", { db, text: null }), "ghost") : null, btn("✎ Edit by hand", () => { D.qedit = db; update(); }), dbLink(db), btn("⧉ Copy", () => copy(q), "primary")]));
  };
  update();
  const dbSaver = autoSave("databases", () => api("save_databases", { databases: dbs }));
  const chips = chipsInput(dbs, () => { update(); dbSaver.schedule(); }, "add a database, press Enter", "Add a database");
  const el = h("div", {},
    card("Search strings", "The result of this page: copy each string into the database's advanced search. Syntax differs per database; the tool translates it.", box),
    card("Databases", "Which sources this review searches. At least two bibliographic databases is the usual minimum (see Help). Saved as you add or remove one.", chips));
  return { el, update };
}

// OpenAlex has no wildcards: each term with * is searched as a full word. Every change is listed, so the reviewer
// can check them (the tool's completions are rules, not a dictionary).
function openalexNote() {
  const changes = D.oaChanges ?? S.openalex_changes ?? [];
  if (!changes.length) return null;
  return h("div", { class: "small", style: "flex-basis:100%" },
    h("b", {}, "OpenAlex has no wildcards. Check these words: "),
    changes.map(([from, to], i) => [i ? " · " : "", h("code", {}, from), " → ", h("code", {}, to)]),
    h("span", { class: "muted" }, ". Wrong? Edit by hand."));
}

// Advanced-search pages of the databases (opened from the search-string and import pages)
export const DB_LINKS = {
  "Scopus": "https://www.scopus.com/search/form.uri?display=advanced",
  "Web of Science": "https://www.webofscience.com/wos/woscc/advanced-search",
  "IEEE Xplore": "https://ieeexplore.ieee.org/search/advanced/command",
  "ACM Digital Library": "https://dl.acm.org/search/advanced",
  "PubMed": "https://pubmed.ncbi.nlm.nih.gov/advanced/",
  "OpenAlex": "https://openalex.org/",
};
export const dbLink = db => DB_LINKS[db] ? h("a", { class: "btn sm", href: DB_LINKS[db], target: "_blank", rel: "noopener" }, `Open ${db} ↗`) : null;

export function copyBlock(text, label) {
  return h("div", {}, h("div", { class: "code", style: "max-height:150px;overflow:auto", html: hlQuery(text) }),
    h("div", { class: "row end", style: "margin-top:6px" }, btn("⧉ Copy " + label, () => copy(text), "sm primary")));
}
