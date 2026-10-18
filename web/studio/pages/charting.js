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
import { autosize, bar, btn, card, decDot, field, iconBtn, openNote, pill, segmented } from "../ui/components.js";

PAGES.charting = () => {
  const fields = D.fields ??= S.state.charting.fields.map(f => ({ ...f }));
  const fieldSaver = autoSave("fields", () => api("save_fields", { fields }, { render: false, silent: true }), "charting");
  const inc = S.records.filter(r => r.ft_decision === "include");
  const kind = r => (r.chart.checked_by || "").toLowerCase() === "reviewer" ? "me" : (r.chart.basis || "").toLowerCase() === "full text" ? "ft" : "abs";
  const n = k => inc.filter(r => kind(r) === k).length;
  const flt = D.cfilter ??= "all";
  const list = inc.filter(r => flt === "all" || kind(r) === flt);
  let sel = D.chartSel && inc.find(r => r.record_id === D.chartSel) ? D.chartSel : list[0]?.record_id;

  // field editor (rarely needed; protocol amendments) — collapsed
  const fl = h("div", { class: "stack" });
  const drawF = () => fl.replaceChildren(
    fields.length ? h("div", { class: "row small muted", style: "flex-wrap:nowrap;font-weight:600" },
      h("span", { style: "width:200px" }, "Field name"), h("span", {}, "What to record")) : null,
    ...fields.map((f, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
    h("input", { type: "text", value: f.name, placeholder: "field_name", "aria-label": `Field name ${i + 1}`, style: "max-width:200px;font-family:var(--mono)", oninput: e => f.name = e.target.value }),
    h("input", { type: "text", value: f.description, placeholder: "e.g. study design", "aria-label": `What to record, field ${i + 1}`, oninput: e => f.description = e.target.value }),
    iconBtn("✕", "Remove field", () => { fields.splice(i, 1); drawF(); fieldSaver.schedule(); }))), btn("+ Add field", () => { fields.push({ name: "", description: "" }); drawF(); }, "sm"));
  drawF();

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
        pill(k === "me" ? "checked by you" : k === "ft" ? "AI · full text" : "AI · abstract", k === "me" ? "ok" : k === "ft" ? "info" : "warn")),
      h("div", { class: "row", style: "margin:8px 0 12px" },
        r.pdf_status === "found" ? btn("📄 Open PDF", () => api("open_note", { note: `10 - Full texts/${r.file}.pdf` }, { silent: true }), "")
          : h("span", { class: "small muted" }, "No PDF yet — values come from the abstract."),
        r.doi ? h("a", { href: "https://doi.org/" + r.doi, target: "_blank", class: "small" }, "DOI ↗") : null,
        h("span", { style: "flex:1" }),
        k !== "me" ? btn("✓ Checked — next", e => busy(e.currentTarget, async () => {
          const nx = next();
          await api("set_record", { record_id: r.record_id, fields: { chart_checked_by: "reviewer" } }, { silent: true });
          if (nx) D.chartSel = nx.record_id;
        }), "primary") : btn("Undo checked", () => api("set_record", { record_id: r.record_id, fields: { chart_checked_by: "AI" } }), "ghost"),
        btn("Next ›", () => { const nx = next(); if (nx) { D.chartSel = nx.record_id; render(); } }, "ghost")),
      r.notes ? h("details", { class: "small", style: "margin-bottom:10px" }, h("summary", { class: "muted" }, "Notes on this record"), h("div", { class: "muted", style: "margin-top:4px;white-space:pre-wrap" }, r.notes)) : null,
      ...(hasCols ? S.state.charting.fields.filter(f => f.name !== "checked_by").map(f => field(f.name, autosize(h("textarea", {
        rows: 2, value: r.chart[f.name] || "", placeholder: exampleFor("charting", f.name),
        oninput: e => { r.chart[f.name] = e.target.value; const v = e.target.value;
          autoSave(`chart:${r.record_id}:${f.name}`, () => api("set_record", { record_id: r.record_id, fields: { ["chart_" + f.name]: v } }, { render: false, silent: true })).schedule(); },
      })), f.description)) : [h("div", { class: "callout warn" }, "Add the charting columns first (Charting form, below).")]));
  };
  drawForm();
  return h("div", {},
    h("div", { class: "row", style: "margin-bottom:12px" },
      h("div", { style: "flex:1" }, bar(inc.length ? n("me") / inc.length : 0),
        h("div", { class: "small muted" }, `Checked by you: ${n("me")} of ${inc.length} included sources · AI from full text ${n("ft")} · AI from abstract ${n("abs")}`)),
      btn("Open Charting.base", () => openNote("12 - Charting.base"), "ghost")),
    h("div", { class: "chart-grid" },
      card("Included sources", null,
        segmented([["all", `All ${inc.length}`], ["ft", `Full text ${n("ft")}`], ["abs", `Abstract ${n("abs")}`], ["me", `Checked ${n("me")}`]], flt,
          v => { D.cfilter = v; D.chartSel = null; render(); }, "Show papers"),
        h("div", { class: "queue", style: "max-height:640px;margin-top:10px" }, list.map(r => h("div", { class: "qitem" + (r.record_id === sel ? " cur" : ""), onclick: () => { D.chartSel = r.record_id; render(); } },
          kind(r) === "me" ? decDot("include", "checked by you") : decDot(r.pdf_status === "found" ? "unsure" : "pending", `prefilled by AI from the ${r.pdf_status === "found" ? "full text" : "abstract"}, not checked yet`), h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title))))),
      card(null, null, form)),
    h("details", { class: "card", style: "margin-top:16px" },
      h("summary", { style: "font-weight:700;color:var(--text)" }, "Charting form (fields)", h("span", { class: "muted small", style: "font-weight:400" }, ` — the data items (${S.review_type.refs.dataItems}); changing them after locking is an amendment`)),
      h("div", { style: "margin-top:10px" }, fieldSaver.watch(fl)), h("div", { class: "row end", style: "margin-top:10px" },
        h("span", { class: "small muted", style: "margin-right:auto" }, "Saved as you type."),
        btn("Add columns to included records", e => busy(e.currentTarget, () => api("prepare_charting", {})), "primary"))));
};
