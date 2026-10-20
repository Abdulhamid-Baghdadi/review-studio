/**
 * Page: Search strings and databases.
 * @module web/studio/pages/queries
 */
import { api } from "../core/api.js";
import { autoSave, runSave } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { autosize, btn, card, chipsInput, copy, decDot, field, hlQuery, pill } from "../ui/components.js";

PAGES.queries = () => {
  const dbs = [...S.state.queries.databases];
  let db = D.qdb && dbs.includes(D.qdb) ? D.qdb : dbs[0];
  const box = h("div", {});
  const drawBox = () => {
    const q = S.queries[db] || "", manual = S.manual.includes(db);
    const editing = D.qedit === db;
    const ta = autosize(h("textarea", { class: "code", rows: 5, value: q, "aria-label": `Search string for ${db}` }));
    const saver = autoSave("query:" + db, () => api("save_manual_query", { db, text: ta.value }, { render: false, silent: true }), "queries");
    if (editing) saver.watch(ta);
    box.replaceChildren(
      h("div", { class: "tabs", role: "group", "aria-label": "Database" }, dbs.map(x => h("button", { class: x === db ? "on" : "", "aria-pressed": String(x === db), onclick: () => { db = D.qdb = x; D.qedit = null; drawBox(); } }, x, S.manual.includes(x) ? " ✎" : ""))),
      h("div", { class: "row", style: "margin-bottom:8px" }, pill(manual ? "edited by hand" : "generated from the concept table", manual ? "warn" : "accent"),
        db === "OpenAlex" ? pill("OpenAlex: no wildcards — stems completed to full words", "info") : null),
      editing ? ta : h("div", { class: "code", html: hlQuery(q || "(no concepts yet)") }),
      h("div", { class: "row end", style: "margin-top:10px" },
        editing ? [h("span", { class: "small muted" }, "Saved as you type."), btn("✓ Done", async () => { await runSave("query:" + db, () => api("save_manual_query", { db, text: ta.value }, { silent: true })); D.qedit = null; render(); }, "primary")]
          : [manual ? btn("Use generated", () => api("save_manual_query", { db, text: null }), "ghost") : null, btn("✎ Edit by hand", () => { D.qedit = db; drawBox(); }), dbLink(db), btn("⧉ Copy", () => copy(q), "primary")]));
  };
  drawBox();
  const dbSaver = autoSave("databases", () => api("save_databases", { databases: dbs }, { render: false, silent: true }));
  const chips = chipsInput(dbs, () => dbSaver.schedule(), "add a database, press Enter", "Add a database");
  return h("div", {},
    card("Search strings", "Copy each string into the database's advanced search. Syntax differs per database; the tool translates it.", box),
    card("Databases", "Which sources this review searches. At least two bibliographic databases is the usual minimum (see Help). Saved as you add or remove one.", chips));
};

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
