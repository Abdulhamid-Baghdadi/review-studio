/**
 * Page: Report.
 * @module web/studio/pages/report
 */
import { api, busy, download } from "../core/api.js";
import { h } from "../core/dom.js";
import { D, PART, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { flowDiagram } from "../ui/charts.js";
import { bar, btn, card, labelBy, libraryName, openNote, pill } from "../ui/components.js";
import { confirmBox, modal, toast } from "../ui/dialogs.js";

// Citations between the papers of the library (formerly Library Studio's Citations page): preview, then write.
function citationsCard() {
  const out = h("div", { class: "small", style: "margin-top:8px" });
  const show = (r, written) => out.replaceChildren(
    h("div", {}, `${r.publications} publication notes · ${r.found} found in OpenAlex by DOI · ${r.links} citations between library papers · ${r.outside} cited works outside the library (as DOIs)`),
    r.missing ? h("div", { class: "muted" }, `${r.missing} without a DOI found in OpenAlex: their 'cites' stays empty.`) : null,
    h("div", { style: "margin-top:4px" }, written ? `✓ ${r.written} note(s) updated.` : r.changed ? `${r.changed} note(s) would change.` : "✓ Every note is up to date."),
    !written && r.changed ? h("div", { class: "row end", style: "margin-top:6px" }, btn(`Write to ${r.changed} note(s)`, async e => {
      const button = e.currentTarget;                         // (gone from the event once the dialog was awaited)
      if (!(await confirmBox("Update citations", `Write 'cites' in ${r.changed} publication note(s)? An old 'cited_by' and the old 'Unlinked cited works' section are removed (those works are in 'cites' now). Nothing else in the notes changes.`, "Write"))) return;
      const done = await busy(button, () => api("library_citations", { apply: true }, { silent: true }));
      if (done) show(done, true);
    }, "primary")) : null);
  return card("Citations in your library", `What each library paper cites, from OpenAlex reference lists: 'cites' links to the library papers it cites and lists the others by DOI (an OpenAlex id when there is none). Which papers cite a paper: its backlinks in Obsidian. Run it again after adding papers: DOIs of papers now in the library become links. Nothing is written until you confirm.`,
    h("div", { class: "row" }, h("span", { class: "small muted", style: "flex:1" }, `Library: ${libraryName()}. Uses about one OpenAlex request per 50 papers, and one per 100 cited works.`),
      btn("🔗 Check citations", async e => {
        const r = await busy(e.currentTarget, () => api("library_citations", {}, { silent: true }));
        if (r) show(r, false);
      }, "")), out);
}

const exportsCard = () => card("Exports", "For your reference manager and the tables in your manuscript.",
          h("div", { class: "row" },
            btn("⬇ BibTeX of included", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "bib" })); if (j?.download) download(j.download); }, ""),
            btn("⬇ Included for Zotero (RIS)", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "ris" })); if (j?.download) download(j.download); }, ""),
            btn("⬇ Charting table (CSV)", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "csv" })); if (j?.download) download(j.download); }, "")),
          h("details", { class: "sub", style: "margin-top:8px" },
            h("summary", {}, "Working with Zotero"),
            h("ol", {},
              h("li", {}, "In Zotero, install the Better BibTeX add-on (Tools → Plugins) so every paper gets a stable citation key."),
              h("li", {}, "Zotero → Scoping Review Workbench: right-click a collection → Export Collection… → Better BibTeX, and import that .bib in Search & import. The citation keys are kept on the records."),
              h("li", {}, "Scoping Review Workbench → Zotero: click “Included for Zotero (RIS)”, then in Zotero use File → Import… and pick the file from this review's 07 - Exports folder (not your Downloads), so the full texts in 10 - Full texts are attached."),
              h("li", {}, "Imported papers are tagged review:<name>, included and record:R…; the BibTeX export uses the same citation keys."))));

const syncCard = () => card("Sync with the library", `Marks included papers in ${libraryName()} (included_in). Preview first.`,
          h("div", { class: "row" },
            btn("Preview", async e => { const j = await busy(e.currentTarget, () => api("sync", { apply: false }, { silent: true }));
              if (j) { await modal({ title: "Sync preview", body: h("pre", { class: "code" }, j.message || "Nothing to change.") }); D.syncPreviewed = true; render(); } }, D.syncPreviewed ? "" : "primary"),
            btn("Apply", async e => { if (await confirmBox("Apply sync?", "This writes included_in / candidate_in to the publication notes.", "Apply")) busy(e.target, () => api("sync", { apply: true })); }, D.syncPreviewed ? "primary" : "")));

// One step, three tabs: the paper (flow diagram and checklist), the files to share, and the Obsidian library.
PAGES.report = () => {
  const auto = S.checklist_auto;
  const kept = S.records.filter(r => r.ft_decision === "include");
  const checklistHead = ["#", "Item", "Evidence in the vault", "Location in manuscript", "Reported"].map(t => h("th", {}, t));
  const part = PART.report ?? "paper";
  if (part === "library") return h("div", {},
    kept.length ? card("Export to your Obsidian library", `When the review is finished, the papers you kept become publication notes in ${libraryName()}, with their PDFs; then the citations between your library papers are updated ('cites'). Everything else stays in this review's folder.`,
      h("div", { class: "row" }, h("span", { class: "small muted", style: "flex:1" },
        `${kept.length} included paper(s); ${kept.filter(r => r.publication).length} already linked to a library note. `,
        S.publication_template ? `New notes use your template “${S.publication_template}”` : "New notes use the app's own template (choose yours in ⚙ Settings → Review settings)",
        ", plus 'added_by' (this review), 'added_on' (the date), 'citekey' and the OpenAlex id. A paper already in your library only gets this review in its 'included_in'."),
        btn("📚 Export to Obsidian library", async e => {
          const button = e.currentTarget;
          if (await confirmBox("Export to Obsidian library", `Export ${kept.length} included paper(s) to ${libraryName()} as publication notes, then update the citations between library papers (OpenAlex)? Do this when screening is final.`, "Export"))
            busy(button, () => api("add_to_library"));
        }, "primary"))) : null,
    S.library?.length ? citationsCard() : null,
    syncCard(),
    kept.length || S.library?.length ? null : h("div", { class: "card empty" }, "Nothing to do here yet: include papers first, and choose your library folder in ⚙ Settings → Review settings."));
  if (part === "exports") return h("div", {},
    card("Traceability", "Every change of a screening decision is in 08 - Decision log.csv (when, who, how), chained with SHA-256 so that an edited row shows. The review package collects the protocol, searches, decisions, log, second-reviewer sheets, charting, flow, checklist and AI use, with a checksum per file, ready to deposit on OSF or Zenodo.",
      h("div", { class: "row" },
        btn("Check the decision log", async e => {
          const v = await busy(e.currentTarget, () => api("verify_log", {}, { silent: true }));
          if (v) toast(v.intact ? `Decision log: ${v.rows} rows, chain intact` : `Decision log: chain broken at row ${v.brokenAt} — a row was edited or removed`, v.intact ? "ok" : "err");
        }, ""),
        btn("Open the log", () => openNote("08 - Decision log.csv"), "ghost"),
        btn("📦 Make review package", async e => { const j = await busy(e.currentTarget, () => api("review_package")); if (j?.download) download(j.download); }, "primary"))),
    exportsCard());
  return h("div", {},
    h("div", { class: "grid2" },
      card("PRISMA flow", "Live from your records. The PRISMA flow note in Obsidian shows the same.", flowDiagram(S.flow),
        h("div", { class: "row end", style: "margin-top:8px" }, btn("Open note", () => openNote("14 - PRISMA flow.md"), "ghost"), btn("Refresh note", e => busy(e.currentTarget, () => api("report")), ""))),
      h("div", {},
        card("Checklist progress", null, (() => {
          const required = S.checklist_items.filter(it => !it.optional);
          const n = required.filter(it => S.state.checklist[it.n]?.done).length;
          return h("div", {}, h("div", { class: "big", style: "font-size:28px;font-weight:700" }, `${n} / ${required.length}`), bar(n / required.length),
            h("div", { class: "small muted", style: "margin-top:4px" }, `${S.review_type.guideline} items marked as reported` + (required.length < S.checklist_items.length ? " (optional items not counted)" : "")));
        })()))),
    card(`${S.review_type.guideline} checklist`, "Tick each item and note where it is reported. 'Evidence' is what the tool can see in the vault.",
      h("div", { class: "tbl-scroll" }, h("table", { class: "tbl" }, h("tr", {}, checklistHead),
        S.checklist_items.map(it => {
          const c = S.state.checklist[it.n] || {};
          const item = h("b", {}, it.item);            // both fields of a row are named by their column and this item
          const loc = labelBy(h("input", { type: "text", value: c.location || "", placeholder: "e.g. Methods 2.1" }), [checklistHead[3], item]);
          const ok = labelBy(h("input", { type: "checkbox", checked: !!c.done }), [checklistHead[4], item]);
          const save = () => api("checklist", { n: it.n, location: loc.value, done: ok.checked }, { render: false, silent: true });
          loc.addEventListener("change", save); ok.addEventListener("change", save);
          return h("tr", {}, h("td", { class: "num" }, it.n), h("td", {}, item, it.optional ? [" ", pill("optional", "info")] : null, h("div", { class: "small muted" }, it.desc)),
            h("td", { class: "small" }, auto[String(it.n)] ? pill(auto[String(it.n)], "info") : h("span", { class: "muted" }, "—")),
            h("td", { style: "width:200px" }, loc), h("td", { style: "text-align:center" }, h("label", { class: "check" }, ok)));
        })))));
};
