/**
 * Page: Pilot searches.
 * @module web/studio/pages/pilot
 */
import { api, busy } from "../core/api.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { copyBlock, dbLink, testCheckQuery, testSetCard } from "./queries.js";
import { PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { pilotChart } from "../ui/charts.js";
import { btn, card, dropzone, field, segmented } from "../ui/components.js";
import { toast } from "../ui/dialogs.js";

PAGES.pilot = () => {
  const dbs = S.state.queries.databases.filter(x => x !== "OpenAlex");
  let db = D.pdb && dbs.includes(D.pdb) ? D.pdb : dbs[0];
  const note = h("input", { type: "text", placeholder: "What are you testing? e.g. 'v3: added decompos*'", value: D.pnote || "", oninput: e => D.pnote = e.target.value });
  const hits = h("input", { type: "number", placeholder: "e.g. 4090" }), got = h("input", { type: "number", placeholder: "found" });
  const avail = h("input", { type: "number", placeholder: "in database", value: S.test_set.dois.length || "" });
  const guide = h("div", {});
  const drawGuide = () => {
    const q = S.queries[db] || "", t = testCheckQuery(db, q);
    guide.replaceChildren(
      h("div", { class: "row", style: "margin:4px 0 10px" }, h("b", {}, "Step 1"), h("span", { class: "muted" }, `Open ${db}'s advanced search and paste your search string.`), h("span", { style: "flex:1" }), dbLink(db)),
      q ? copyBlock(q, "search string") : h("div", { class: "callout warn" }, "No search string yet — fill in the concept table first."),
      h("div", { class: "row", style: "margin:14px 0 10px" }, h("b", {}, "Step 2"), h("span", { class: "muted" }, t
        ? `Paste the test-set check: the same search, limited to your ${S.test_set.dois.length} test papers' DOIs. The number it shows = test papers found.`
        : `Check by hand which of your ${S.test_set.size} test papers appear in the results.`)),
      t ? copyBlock(t, "test-set check") : h("div", { class: "small muted" }, "Test papers: " + S.test_set.papers.join(" · ")),
      h("div", { class: "row", style: "margin:14px 0 6px" }, h("b", {}, "Step 3"), h("span", { class: "muted" }, "Enter what the database showed and log the pilot.")),
      h("div", { class: "grid3" }, field("Hits (documents found)", hits), field("Test papers found", got), field("Test papers in the database", avail, "lower if a test paper is not indexed there")),
      h("div", { class: "row end", style: "margin-top:10px" }, btn("Log pilot", () => {
        if (!hits.value) return toast("Enter the number of hits.", "err");
        api("pilot_manual", { database: db, hits: hits.value, retrieved: got.value, available: got.value ? avail.value : "", note: note.value }).then(() => D.pnote = "");
      }, "primary")));
  };
  drawGuide();
  const db2 = h("select", {}, dbs.map(x => h("option", {}, x)));
  const pilots = [...S.state.pilots].reverse();
  return h("div", {},
    testSetCard(),
    (() => {
      const method = D.pmethod || "db";
      const panels = {
        db: [h("div", { class: "row", style: "margin-bottom:6px" }, h("span", { class: "small muted" }, "Database"),
              segmented(dbs.map(x => [x, x]), db, v => { db = D.pdb = v; render(); }, "Database")),
            field("Note for this run", note), h("div", { class: "hr" }), guide],
        file: [h("p", { class: "sub" }, "Run the string in the database, export the results (RIS, BibTeX or CSV) and drop the file here: the tool counts the records and checks the test set itself."),
            field("Note for this run", note), h("div", { class: "grid2", style: "margin-top:10px" }, field("Database", db2),
              dropzone("RIS, BibTeX or CSV", ".ris,.bib,.csv,.txt,.tsv", p => api("pilot_file", { path: p, database: db2.value, note: note.value })))],
        openalex: [h("p", { class: "sub" }, "Free and automatic, but rough: OpenAlex has no wildcards and searches differently, so its counts are only indicative. Good for a first impression, not for the final decision."),
            field("Note for this run", note),
            h("div", { class: "row end", style: "margin-top:10px" }, btn("Run OpenAlex check", e => busy(e.currentTarget, () => api("pilot_openalex", { note: note.value }).then(() => D.pnote = "")), "primary"))],
      };
      return card("How do you want to pilot?", `Pick one method per run — they are alternatives, not steps. Test set = ${S.test_set.size} paper(s) you already know are relevant (test_in).`,
        h("div", { style: "margin-bottom:14px" }, segmented([["db", "In a database (recommended)"], ["file", "From an export file"], ["openalex", "Quick check in OpenAlex"]],
          method, k => { D.pmethod = k; render(); }, "How to pilot")),
        panels[method]);
    })(),
    card("Results", "Tune on recall first, then on the number of hits you can screen.", pilotChart(S.state.pilots),
      pilots.length ? h("div", { class: "scroll", style: "margin-top:12px" }, h("table", { class: "tbl" },
        h("tr", {}, ["When", "Source", "Hits", "Test set", "Missed papers"].map(t => h("th", {}, t))),
        pilots.map(p => h("tr", {}, h("td", { class: "small" }, p.when), h("td", {}, p.database, p.note ? h("div", { class: "small muted" }, p.note) : null),
          h("td", { class: "num" }, Number(p.hits).toLocaleString()), h("td", { class: "num" }, p.test_set === "" ? "–" : `${p.retrieved}/${p.test_set}`),
          h("td", { class: "small" }, p.missed.length ? h("details", {}, h("summary", {}, `${p.missed.length} missed`), h("ul", {}, p.missed.map(m => h("li", {}, m)))) : p.test_set === "" ? "" : "none"))))) : null));
};

export function authorPill(key) {
  const m = (S.state.protocol_meta || {})[key];
  if (!m) return null;
  if (m.by === "approved") return h("span", { class: "pill info", style: "margin-left:8px", title: `Drafted by Claude, approved by you on ${m.when}` }, "Claude draft · approved by you");
  return m.by === "claude" ? h("span", { class: "pill warn", style: "margin-left:8px", title: `Drafted by Claude on ${m.when}. Read and edit it to make it yours.` }, "Draft by Claude")
    : h("span", { class: "pill ok", style: "margin-left:8px", title: `Last edited by you on ${m.when}` }, "Edited by you");
}
