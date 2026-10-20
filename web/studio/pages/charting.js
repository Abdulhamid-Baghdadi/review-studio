/**
 * Page: Data charting.
 * @module web/studio/pages/charting
 */
import { api, busy } from "../core/api.js";
import { autoSave } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { exampleFor } from "../shell/help.js";
import { goTab, stepOf } from "../shell/navigation.js";
import { fieldLabel } from "./charting-form.js";
import { autosize, bar, btn, card, decDot, field, openNote, pill, segmented } from "../ui/components.js";

PAGES.charting = () => {
  const inc = S.records.filter(r => r.ft_decision === "include");
  // who charted a paper: you (checked), the AI (prefilled from the full text or the abstract, not checked yet), or
  // nobody yet. Only a paper the AI really prefilled is called AI: with AI off, an unchecked paper is "to chart".
  const kind = r => {
    if ((r.chart.checked_by || "").toLowerCase() === "reviewer") return "me";
    const basis = (r.chart.basis || "").toLowerCase(), byAi = (r.chart.checked_by || "").toLowerCase() === "ai" || basis;
    return !byAi ? "todo" : basis === "full text" ? "ft" : "abs";
  };
  const LABEL = { me: ["checked by you", "ok"], todo: ["to chart", ""], ft: ["AI · full text, check it", "info"], abs: ["AI · abstract, check it", "warn"] };
  const n = k => inc.filter(r => kind(r) === k).length;
  const flt = D.cfilter ??= "all";
  const list = inc.filter(r => flt === "all" || kind(r) === flt);
  let sel = D.chartSel && inc.find(r => r.record_id === D.chartSel) ? D.chartSel : list[0]?.record_id;

  const next = () => {                                  // next paper in the current filter that you have not checked
    const i = list.findIndex(r => r.record_id === sel);
    return list.slice(i + 1).find(r => kind(r) !== "me") || list.find(r => kind(r) !== "me" && r.record_id !== sel);
  };
  const form = h("div", {});
  const drawForm = () => {
    const r = inc.find(x => x.record_id === sel);
    if (!r) return form.replaceChildren(h("div", { class: "empty" }, "Nothing in this view."));
    const hasCols = Object.keys(r.chart).length > 0;
    const k = kind(r);
    form.replaceChildren(
      h("div", { class: "row", style: "align-items:flex-start;gap:10px;margin-bottom:6px" },
        h("div", { style: "flex:1" }, h("h3", { style: "margin:0" }, r.record_id + " · " + r.title),
          h("div", { class: "small muted", style: "margin-top:4px" }, r.authors, r.year ? " · " + r.year : "", r.journal ? " · " + r.journal : "")),
        pill(...LABEL[k])),
      h("div", { class: "row", style: "margin:8px 0 12px" },
        r.pdf_status === "found" ? btn("📄 Open PDF", () => api("open_note", { note: `10 - Full texts/${r.file}.pdf` }, { silent: true }), "")
          : h("span", { class: "small muted" }, "No PDF: chart from the abstract, and say so."),
        r.doi ? h("a", { href: "https://doi.org/" + r.doi, target: "_blank", class: "small" }, "DOI ↗") : null,
        h("span", { style: "flex:1" }),
        k !== "me" ? btn(k === "todo" ? "✓ Charted — next" : "✓ Checked — next", e => busy(e.currentTarget, async () => {
          const nx = next();
          await api("set_record", { record_id: r.record_id, fields: { chart_checked_by: "reviewer" } }, { silent: true });
          if (nx) D.chartSel = nx.record_id;
        }), "primary") : btn("Undo checked", () => api("set_record", { record_id: r.record_id, fields: { chart_checked_by: r.chart.basis ? "AI" : "" } }), "ghost"),   // back to the AI only if the AI prefilled it
        btn("Next ›", () => { const nx = next(); if (nx) { D.chartSel = nx.record_id; render(); } }, "ghost")),
      r.notes ? h("details", { class: "small", style: "margin-bottom:10px" }, h("summary", { class: "muted" }, "Notes on this record"), h("div", { class: "muted", style: "margin-top:4px;white-space:pre-wrap" }, r.notes)) : null,
      ...(hasCols ? S.state.charting.fields.filter(f => f.name !== "checked_by").map(f => field(fieldLabel(f.name), autosize(h("textarea", {
        rows: 2, value: r.chart[f.name] || "", placeholder: exampleFor("charting", f.name),
        oninput: e => { r.chart[f.name] = e.target.value; const v = e.target.value;
          autoSave(`chart:${r.record_id}:${f.name}`, () => api("set_record", { record_id: r.record_id, fields: { ["chart_" + f.name]: v } }, { render: false, silent: true })).schedule(); },
      })), f.description, { hintFirst: true })) : [h("div", { class: "callout warn" }, "This paper's note has no charting fields yet. ",
        btn(`Add the form to the ${inc.length} included paper${inc.length === 1 ? "" : "s"}`, e => busy(e.currentTarget, () => api("prepare_charting", {})), "sm primary"))]));
  };
  drawForm();
  return h("div", {},
    h("div", { class: "row", style: "margin-bottom:12px" },
      h("div", { style: "flex:1" }, bar(inc.length ? n("me") / inc.length : 0),
        h("div", { class: "small muted" }, `Checked by you: ${n("me")} of ${inc.length}`)),
      btn("Open Charting.base", () => openNote("12 - Charting.base"), "ghost")),
    h("div", { class: "chart-grid" },
      card("Included sources", null,
        segmented([["all", `All ${inc.length}`], ["todo", `To chart ${n("todo")}`], ...(n("ft") ? [["ft", `AI, full text ${n("ft")}`]] : []), ...(n("abs") ? [["abs", `AI, abstract ${n("abs")}`]] : []), ["me", `Checked ${n("me")}`]], flt,
          v => { D.cfilter = v; D.chartSel = null; render(); }, "Show papers"),
        h("div", { class: "queue", style: "max-height:640px;margin-top:10px" }, list.map(r => h("div", { class: "qitem" + (r.record_id === sel ? " cur" : ""), onclick: () => { D.chartSel = r.record_id; render(); } },
          kind(r) === "me" ? decDot("include", "checked by you") : kind(r) === "todo" ? decDot("pending", "not charted yet") : decDot("unsure", `prefilled by AI from the ${kind(r) === "ft" ? "full text" : "abstract"}, not checked yet`), h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title))))),
      card(null, null, form)),
    card("Charting form", `The data items (${S.review_type.refs.dataItems}) are planned in Methods; after locking, a change is an amendment.`,
      h("div", { class: "small" }, S.state.charting.fields.filter(f => f.name !== "checked_by").map(f => h("div", {}, h("b", {}, fieldLabel(f.name)), " — ", f.description))),
      h("div", { class: "row end", style: "margin-top:10px" },
        btn("Edit in Methods", () => goTab(stepOf("methods").tabs[0]), "ghost"),
        btn("Add the form to included papers", e => busy(e.currentTarget, () => api("prepare_charting", {})), ""))));
};
