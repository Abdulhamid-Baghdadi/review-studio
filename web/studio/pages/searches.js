/**
 * Page: Search & import.
 * @module web/studio/pages/searches
 */
import { api, busy } from "../core/api.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { DB_LINKS } from "./queries.js";
import { PAGES } from "../shell/registry.js";
import { goTab, stepOf } from "../shell/navigation.js";
import { btn, card, copy, dropzone, field, hlQuery, pill } from "../ui/components.js";
import { confirmBox, toast } from "../ui/dialogs.js";

// Step 4, Search & import: every record comes from a planned database search. One card per planned database with
// its search string from step 2 (read-only: a different string is planned in step 2), a link to the database, and
// a drop zone for the export. An illustrated strip on top shows the round trip.

/** Where the export button is in each database (the usual route; the importer reads RIS, BibTeX, CSV and WoS text). */
const EXPORT_HINTS = {
  "Scopus": "Select all → Export → CSV (or RIS), with abstracts.",
  "Web of Science": "Export → RIS (other reference software), record content: Full record.",
  "IEEE Xplore": "Select all → Export → Citations → RIS, Citation & Abstract.",
  "ACM Digital Library": "Select all → Export citations → BibTeX.",
  "PubMed": "Send to → Citation manager (.nbib).",
  "OpenAlex": "Export → CSV or RIS.",
};

/** The four pictures of the round trip: string from step 2 → database website → export file → drop here. */
function importStrip() {
  const A = "var(--accent)", M = "var(--faint)", S2 = "var(--surface-2)", SU = "var(--surface)", OK = "var(--ok)";
  const pics = [
    ["Copy the string", "from step 2, Search strategy", `
      <rect x="18" y="10" width="112" height="76" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <rect x="28" y="20" width="40" height="7" rx="3.5" fill="${M}" opacity=".5"/>
      <rect x="25" y="36" width="32" height="12" rx="4" fill="${S2}" stroke="${M}"/><text x="41" y="44.5" font-size="6.5" text-anchor="middle" fill="${M}" font-family="monospace">repair*</text>
      <rect x="60" y="36" width="22" height="12" rx="4" fill="${A}"/><text x="71" y="44.5" font-size="6.5" text-anchor="middle" fill="var(--accent-ink)" font-weight="700" font-family="monospace">AND</text>
      <rect x="85" y="36" width="41" height="12" rx="4" fill="${S2}" stroke="${M}"/><text x="105.5" y="44.5" font-size="6.5" text-anchor="middle" fill="${M}" font-family="monospace">appliance*</text>
      <rect x="28" y="56" width="70" height="5" rx="2.5" fill="${M}" opacity=".35"/><rect x="28" y="66" width="52" height="5" rx="2.5" fill="${M}" opacity=".35"/>
      <rect x="104" y="58" width="16" height="18" rx="3" fill="${SU}" stroke="${A}" stroke-width="1.6"/><rect x="99" y="63" width="16" height="18" rx="3" fill="${SU}" stroke="${A}" stroke-width="1.6"/>`],
    ["Run it in the database", "on its own website", `
      <rect x="10" y="10" width="128" height="78" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <line x1="10" y1="24" x2="138" y2="24" stroke="${M}" stroke-width="1.2"/>
      <circle cx="19" cy="17" r="2.5" fill="${M}"/><circle cx="27" cy="17" r="2.5" fill="${M}"/><circle cx="35" cy="17" r="2.5" fill="${M}"/>
      <rect x="20" y="31" width="92" height="13" rx="6.5" fill="${S2}" stroke="${A}" stroke-width="1.4"/>
      <text x="27" y="40.5" font-size="7.5" fill="${A}" font-family="monospace">repair* AND appli…</text>
      <circle cx="122" cy="37.5" r="5" fill="none" stroke="${A}" stroke-width="1.8"/><line x1="125.5" y1="41" x2="129" y2="44.5" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/>
      ${[52, 62, 72].map(y => `<rect x="20" y="${y}" width="6" height="6" rx="1.5" fill="none" stroke="${M}"/><rect x="31" y="${y + 0.5}" width="${y === 62 ? 70 : 88}" height="5" rx="2.5" fill="${M}" opacity=".35"/>`).join("")}`],
    ["Export all results", "as CSV or RIS", `
      <path d="M46 10h40l18 18v58a4 4 0 0 1-4 4H46a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <path d="M86 10v14a4 4 0 0 0 4 4h14" fill="none" stroke="${M}" stroke-width="1.5"/>
      <rect x="50" y="38" width="32" height="15" rx="4" fill="${A}"/><text x="66" y="49" font-size="9" text-anchor="middle" font-weight="700" fill="var(--accent-ink)">CSV</text>
      <rect x="52" y="60" width="40" height="4.5" rx="2.25" fill="${M}" opacity=".35"/><rect x="52" y="69" width="30" height="4.5" rx="2.25" fill="${M}" opacity=".35"/>
      <line x1="122" y1="34" x2="122" y2="64" stroke="${A}" stroke-width="2.2" stroke-linecap="round"/><path d="M114 57l8 8 8-8" fill="none" stroke="${A}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="112" y1="74" x2="132" y2="74" stroke="${A}" stroke-width="2.2" stroke-linecap="round"/>`],
    ["Drop the file here", "into its database's card", `
      <rect x="14" y="40" width="120" height="48" rx="10" fill="${S2}" stroke="${A}" stroke-width="1.6" stroke-dasharray="5 4"/>
      <path d="M62 6h22l10 10v28a3 3 0 0 1-3 3H62a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" fill="${SU}" stroke="${M}" stroke-width="1.4"/>
      <rect x="64" y="22" width="22" height="10" rx="3" fill="${A}"/><text x="75" y="29.5" font-size="7" text-anchor="middle" font-weight="700" fill="var(--accent-ink)">CSV</text>
      <path d="M74 52v14m-6-6 6 6 6-6" fill="none" stroke="${A}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="116" cy="74" r="8" fill="${OK}"/><path d="M112 74l3 3 5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`],
  ];
  return h("div", { class: "imp-strip", role: "img", "aria-label": "Copy the search string from step 2, run it in the database, export all results as CSV or RIS, drop the file here" },
    pics.flatMap(([t, sub, art], i) => [i ? h("div", { class: "imp-arrow", "aria-hidden": "true" }, "→") : null,
      h("figure", { class: "imp-pic" }, h("div", { html: `<svg viewBox="0 0 148 96" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">${art}</svg>` }),
        h("figcaption", {}, h("b", {}, `${i + 1} · ${t}`), h("span", {}, sub)))]));
}

PAGES.searches = () => {
  const dbs = S.state.queries.databases;
  const prog = D.importProgress ??= {};                      // per database: copied, opened, file (this visit)
  const runs = db => S.searches.filter(s => s.kind === "database" && s.database === db);
  const toStep2 = () => goTab(stepOf("queries").tabs.find(t => t.stage === "queries"));
  const dbCard = db => {
    const q = S.queries[db] || "", done = runs(db), p = prog[db] ??= {}, last = done.at(-1);
    let path = null;
    const date = h("input", { type: "date", value: new Date().toISOString().slice(0, 10) });
    const filters = h("input", { type: "text", placeholder: "e.g. 2010–2026; articles and reviews; English" });
    const tracker = h("div", { class: "imp-track" });
    const drawTracker = () => tracker.replaceChildren(...[["copied", "Copied"], ["opened", "Database opened"], ["file", "File chosen"], ["done", "Imported"]]
      .map(([k, label], i) => h("span", { class: "imp-dot " + ((k === "done" ? done.length : p[k]) ? "on" : "") }, h("i", {}, k === "done" ? "✓" : String(i + 1)), label)));
    drawTracker();
    const doImport = async (force = false) => {
      if (!path) return toast("Drop the export file first.", "err");
      try {
        await api("import", { path, database: db, query: q, date: date.value, filters: filters.value, force }, { quietError: true });
        prog[db] = {};
      } catch (e) {
        if (e.message === "NOT_LOCKED") {
          if (await confirmBox("Protocol not locked", "The protocol is not locked and registration was not skipped. Searches are normally run after locking. Import anyway?", "Import anyway")) doImport(true);
        } else if (e.message !== "cancelled") toast(e.message, "err");
      }
    };
    const body = [
      h("div", { class: "imp-row" }, h("span", { class: "imp-n" }, "1"), h("div", { class: "grow" },
        h("div", { class: "small muted" }, "Your search string for ", h("b", {}, db), ", from step 2 (read only):"),
        h("div", { class: "code", style: "margin-top:4px", html: hlQuery(q || "(no string yet)") }),
        h("div", { class: "row", style: "margin-top:6px" },
          btn("⧉ Copy", () => { copy(q); p.copied = true; drawTracker(); }, "sm primary"),
          btn("✎ Change it in step 2", toStep2, "sm ghost", "Search strategy → Search strings: the string is planned there")))),
      h("div", { class: "imp-row" }, h("span", { class: "imp-n" }, "2"), h("div", { class: "grow" },
        h("div", { class: "small muted" }, "Paste it into the database's advanced search, run it, and export ", h("b", {}, "all"), " results."),
        h("div", { class: "row", style: "margin-top:6px" },
          DB_LINKS[db] ? h("a", { class: "btn sm", href: DB_LINKS[db], target: "_blank", rel: "noopener", onclick: () => { p.opened = true; drawTracker(); } }, `Open ${db} ↗`) : null,
          h("span", { class: "small" }, "💾 ", EXPORT_HINTS[db] || "Export all results as CSV, RIS or BibTeX, with abstracts.")))),
      h("div", { class: "imp-row" }, h("span", { class: "imp-n" }, "3"), h("div", { class: "grow" },
        dropzone("Drop the export here (CSV, RIS, BibTeX or Web of Science TXT)", ".ris,.bib,.csv,.txt,.tsv,.nbib", f => { path = f; p.file = true; drawTracker(); }),
        h("div", { class: "grid2", style: "margin-top:8px" }, field("Date you ran it", date), field("Filters you used", filters)),
        h("div", { class: "row end", style: "margin-top:8px" }, btn(done.length ? "Import this export too" : "Import", e => busy(e.currentTarget, () => doImport()), "primary")))),
    ];
    return h("div", { class: "card imp-card" + (done.length ? " done" : "") },
      h("div", { class: "imp-head" }, h("h3", {}, db),
        done.length ? pill(`✓ imported ${last.date} · ${Number(last.records).toLocaleString()} records`, "ok") : pill("not imported yet", ""),
        h("span", { class: "spacer" }), done.length ? null : tracker),
      q ? (done.length ? h("details", {}, h("summary", { class: "small" }, "Import another export from this database (e.g. a re-run before submission)"), body) : body)
        : h("div", { class: "callout warn" }, "No search string for this database yet. ", h("a", { href: "#", onclick: e => { e.preventDefault(); toStep2(); } }, "Build it in step 2, Search strategy"), "."));
  };
  const imported = dbs.filter(db => runs(db).length).length;
  return h("div", {},
    card("How it works", `Every record comes from a search you planned in step 2. Do this once for each database (${imported} of ${dbs.length} done).`, importStrip()),
    dbs.length ? dbs.map(dbCard) : h("div", { class: "callout warn" }, "No databases planned yet. Choose them in step 2, Search strategy → Search strings."),
    h("p", { class: "small muted" }, "Papers found through the references of included studies are added later, in the step Citation search."),
    card("Searches", `${S.searches.length} run(s) logged — this is the table reported under ${S.review_type.refs.sources}.`,
      S.searches.length ? h("div", { class: "scroll" }, h("table", { class: "tbl" },
        h("tr", {}, ["ID", "Source", "Date", "08 - Records", "New", "Dupl.", "Query"].map(t => h("th", {}, t))),
        S.searches.map(s => h("tr", {}, h("td", {}, s.id), h("td", {}, s.database, " ", pill(s.kind, s.kind === "database" ? "accent" : "")), h("td", { class: "small" }, s.date),
          h("td", { class: "num" }, s.records), h("td", { class: "num" }, s.new), h("td", { class: "num" }, s.duplicates), h("td", { class: "small", style: "font-family:var(--mono);max-width:360px;word-break:break-word" }, s.query)))))
        : h("div", { class: "empty" }, h("div", { class: "big" }, "🔎"), "No searches imported yet.")));
};
