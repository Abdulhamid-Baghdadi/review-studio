/**
 * Page: Synthesis.
 * @module web/studio/pages/synthesis
 */
import { api, busy } from "../core/api.js";
import { autoSave } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { autosize, btn, card, field, labelBy, openNote, pill } from "../ui/components.js";
import { confirmBox } from "../ui/dialogs.js";

PAGES.synthesis = () => {
  const sy = D.synthesis ??= { ...(S.state.synthesis ?? {}) };
  const saver = autoSave("synthesis", () => api("save_synthesis", { fields: sy }, { render: false, silent: true }));
  const area = (k, label, hint, rows = 2) => field(label, autosize(h("textarea", { rows, value: sy[k] || "", placeholder: hint, oninput: e => sy[k] = e.target.value })));
  const line = (k, label, hint) => field(label, h("input", { type: "text", value: sy[k] || "", placeholder: hint, oninput: e => sy[k] = e.target.value }));
  return h("div", {},
    D.outcome ? outcomeEditor() : metaAnalysisCard(),
    h("div", { class: "callout" }, "Record what you did. These answers feed PRISMA 2020 items 13–15 and 20–22; for outcomes analysed above, the notes in 14 - Synthesis and the R scripts are your results file."),
    saver.watch(card("Synthesis", "PRISMA 2020 items 12–13 (methods) and 20 (results).",
      area("approach", "Approach", "e.g. random-effects meta-analysis of mean differences; narrative synthesis (SWiM) where studies could not be pooled", 3),
      line("software", "Software", "e.g. R 4.4, metafor 4.6"),
      line("results_file", "Results file", "e.g. Analysis/forest plots.pdf, or a link to the analysis code"),
      area("heterogeneity", "Heterogeneity and sensitivity", "e.g. I², τ²; subgroups by setting; leave-one-out"))),
    saver.watch(card("Reporting bias and certainty", "PRISMA 2020 items 14–15 (methods) and 21–22 (results).",
      area("reporting_bias", "Reporting bias", "e.g. funnel plot and Egger's test for outcomes with ≥ 10 studies"),
      area("certainty", "Certainty of the evidence", "e.g. GRADE per outcome, summary-of-findings table"),
      area("notes", "Notes", "Anything else a reader needs to reproduce the synthesis", 2))));
};

// ---------------------------------------------------------------- meta-analysis and GRADE (synthesis stage)

const plot = svgText => h("div", { class: "plot", style: "overflow-x:auto", html: svgText.replace(' color="#222"', "") });
const outcomesOf = () => S.state.synthesis?.outcomes ?? [];
const saveOutcome = (outcome, el) => (el ? busy(el, () => api("save_outcome", { outcome })) : api("save_outcome", { outcome }, { silent: true }));

function metaAnalysisCard() {
  const included = S.records.filter(r => r.ft_decision === "include");
  const add = () => {
    D.outcome = { name: "", comparison: "", type: "binary", measure: "RR", model: "random", hk: false, design: "rct", rows: [] };
    render();
  };
  const outcomes = outcomesOf();
  return card("Meta-analysis and certainty (GRADE)",
    "One outcome at a time: enter each study's numbers, and the app pools them (inverse variance; random effects by DerSimonian–Laird, optional Hartung–Knapp), draws the forest and funnel plots and suggests GRADE judgements for you to confirm. "
    + "Every save writes a note, the plots, the data and an R script (metafor) to 14 - Synthesis, and updates 14 - Summary of findings.",
    outcomes.length ? h("div", {}, ...outcomes.map(o => outcomeResult(o, S.synthesis_results.find(x => x.id === o.id)))) : h("div", { class: "empty" },
      included.length ? "No outcomes yet." : "No included studies yet: full-text screening comes first."),
    h("div", { class: "row end", style: "margin-top:8px" },
      outcomes.length ? btn("Open summary of findings", () => openNote("14 - Summary of findings.md"), "ghost") : null,
      btn("+ Add outcome", add, "primary")));
}

function outcomeResult(o, res) {
  if (!res) return null;
  const g = res.grade, opt = S.synthesis_options;
  const setDomain = (key, value) => {
    const grade = { ...(o.grade ?? {}) };
    if (value) grade[key] = { ...value, confirmed: true }; else delete grade[key];
    saveOutcome({ ...o, grade });
  };
  const levelText = l => (l === 0 ? "not serious" : l === -1 ? "serious (−1)" : "very serious (−2)");
  const gradeHead = ["GRADE domain", "Judgement", "Reason", ""].map(t => h("th", {}, t));
  return h("div", { class: "card", style: "margin:10px 0" },
    h("div", { class: "row" }, h("h2", { style: "flex:1;margin:0" }, o.name),
      pill(`${g.symbol} ${g.label}${g.confirmed ? "" : " · suggested"}`, g.confirmed ? "ok" : "warn"),
      btn("Edit data", () => { D.outcome = structuredClone(o); render(); }, "sm"),
      btn("Open note", () => openNote(`14 - Synthesis/${o.name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim()}.md`), "sm ghost"),
      btn("Remove", async () => { if (await confirmBox(`Remove "${o.name}"?`, "It leaves the analysis and the summary of findings. Its files in 14 - Synthesis are kept.", "Remove", true)) api("delete_outcome", { id: o.id }); }, "sm ghost")),
    h("p", { class: "sub" }, `${opt.measures[o.measure].label}; ${o.model === "fixed" ? "fixed effect" : "random effects" + (o.hk ? " (Hartung–Knapp)" : "")}; ${o.design === "obs" ? "observational studies" : "randomised trials"}${o.comparison ? " · " + o.comparison : ""}`),
    h("p", {}, h("b", {}, res.sentence),
      res.pooled && res.pooled.k > 1 ? ` Heterogeneity: I² = ${res.pooled.i2}%, τ² = ${res.pooled.tau2}, Q = ${res.pooled.q} (df ${res.pooled.df}, p ${res.pooled.pQ}).` : ""),
    res.studies.length ? plot(res.forest) : h("div", { class: "empty" }, "No study data yet: use Edit data."),
    res.funnel ? h("details", {}, h("summary", {}, `Funnel plot and Egger's test${res.egger ? ` (p ${res.egger.p}${res.egger.k < 10 ? "; fewer than 10 studies, little power" : ""})` : ""}`), plot(res.funnel)) : null,
    h("div", { class: "tbl-scroll" }, h("table", { class: "tbl", style: "margin-top:10px" },
      h("tr", {}, gradeHead),
      opt.domains.map(([key, label]) => {
        const d = g.domains[key], sug = d.suggested ?? { level: 0, reason: "" };
        const domain = h("td", { style: "width:150px" }, label);   // each field is named by its column and this domain
        const reason = labelBy(h("input", { type: "text", value: d.reason, onchange: e => setDomain(key, { level: d.level, reason: e.target.value }) }), [gradeHead[2], domain]);
        return h("tr", {}, domain,
          h("td", { style: "width:170px" }, labelBy(h("select", { onchange: e => setDomain(key, { level: Number(e.target.value), reason: d.reason }) },
            [0, -1, -2].map(l => h("option", { value: l, selected: d.level === l }, levelText(l)))), [gradeHead[1], domain])),
          h("td", {}, reason, !d.confirmed ? null : sug.level !== d.level ? h("div", { class: "small muted" }, `Suggested: ${levelText(sug.level)}. ${sug.reason}`) : null),
          h("td", { style: "width:110px" }, d.confirmed ? h("div", { class: "row" }, pill("confirmed", "ok"), btn("Undo", () => setDomain(key, null), "sm ghost"))
            : h("div", { class: "row" }, pill("suggested", "warn"), btn("Confirm", () => setDomain(key, { level: d.level, reason: d.reason }), "sm"))));
      }))),
    h("p", { class: "small muted" }, `Certainty starts ${o.design === "obs" ? "low (observational studies)" : "high (randomised trials)"} and goes down one level per serious concern. The suggestions are rules of thumb: confirm or change each one and give your reason.`));
}

function outcomeEditor() {
  const o = D.outcome, opt = S.synthesis_options;
  const included = S.records.filter(r => r.ft_decision === "include").sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)));
  const rows = new Map((o.rows ?? []).map(r => [r.record_id, r]));
  const sel = (key, choices, after) => h("select", { onchange: e => { o[key] = e.target.value; after?.(); render(); } },
    choices.map(([v, label]) => h("option", { value: v, selected: o[key] === v }, label)));
  const cols = opt.types[o.type].columns;
  const label = r => `${String(r.authors || "").split(";")[0].split(",")[0].trim() || r.record_id} ${r.year || ""}`.trim();
  const save = async e => {
    o.rows = included.map(r => rows.get(r.record_id)).filter(r => r && cols.some(c => String(r[c] ?? "").trim() !== ""));
    const j = await busy(e.currentTarget, () => api("save_outcome", { outcome: o }));
    if (j) { delete D.outcome; render(); }
  };
  return card(o.id ? `Edit outcome: ${o.name}` : "New outcome", "Leave a study's row empty if it did not report this outcome. Group 1 is the intervention (or exposure), group 2 the comparator.",
    h("div", { class: "grid2" },
      field("Outcome", h("input", { type: "text", value: o.name, placeholder: "e.g. All-cause mortality at 12 months", oninput: e => o.name = e.target.value })),
      field("Comparison", h("input", { type: "text", value: o.comparison ?? "", placeholder: "e.g. exercise vs usual care", oninput: e => o.comparison = e.target.value }))),
    h("div", { class: "row", style: "gap:12px;flex-wrap:wrap" },
      field("Data", sel("type", Object.entries(opt.types).map(([k, t]) => [k, t.label]), () => { o.measure = opt.types[o.type].measures[0]; })),
      field("Effect measure", sel("measure", opt.types[o.type].measures.map(m => [m, opt.measures[m].label]))),
      field("Model", sel("model", [["random", "Random effects (DerSimonian–Laird)"], ["fixed", "Fixed effect (inverse variance)"]])),
      o.model === "random" ? h("div", { class: "field" }, h("span", {}, "CI method"),       // not field(): a label may not hold another label
        h("label", { class: "row small" }, h("input", { type: "checkbox", checked: o.hk, onchange: e => o.hk = e.target.checked }), "Hartung–Knapp (recommended with few studies)")) : null,
      field("Study design", sel("design", [["rct", "Randomised trials (GRADE starts high)"], ["obs", "Observational (GRADE starts low)"]]))),
    included.length ? (() => {
      const head = Object.fromEntries(cols.map(c => [c, h("th", {}, opt.columns[c])]));
      return h("div", { style: "overflow-x:auto" }, h("table", { class: "tbl" },
      h("tr", {}, h("th", {}, "Study"), ...cols.map(c => head[c])),
      included.map(r => {
        const study = h("td", { title: r.title }, h("b", {}, r.record_id), " ", label(r));   // a cell is named by its column and study
        return h("tr", {}, study,
        ...cols.map(c => h("td", { style: "width:90px" }, labelBy(h("input", { type: "text", inputmode: "decimal", value: rows.get(r.record_id)?.[c] ?? "",
          oninput: e => {      // kept on the draft, so switching the data type or measure keeps what was typed
            let row = rows.get(r.record_id);
            if (!row) { row = { record_id: r.record_id }; rows.set(r.record_id, row); (o.rows ??= []).push(row); }
            row[c] = e.target.value;
          } }), [head[c], study]))));
      })));
    })()
      : h("div", { class: "empty" }, "No included studies yet."),
    h("div", { class: "row end", style: "margin-top:10px" }, btn("Cancel", () => { delete D.outcome; render(); }, "ghost"), btn("Save and analyse", save, "primary")));
}
