/**
 * Page: Critical appraisal / risk of bias.
 * @module web/studio/pages/appraisal
 */
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { btn, card, field, labelBy, pill } from "../ui/components.js";

PAGES.appraisal = () => {
  const sys = S.review_type.key === "systematic";
  const tool = h("input", { type: "text", value: S.state.charting.appraisal_tool || "", placeholder: sys ? "e.g. RoB 2, ROBINS-I, JBI checklist" : "e.g. MMAT 2018" });
  const inc = S.records.filter(r => r.ft_decision === "include");
  return h("div", {},
    card("Approach", sys ? "Choose a risk-of-bias tool that suits the study designs (RoB 2 for randomised trials, ROBINS-I for non-randomised studies). Required in a systematic review."
      : "Choose a tool that suits the study designs. If you skip appraisal, use 'Skip' above and give the reason.",
      h("div", { class: "row", style: "flex-wrap:nowrap;align-items:flex-end" }, Object.assign(field(sys ? "Risk-of-bias tool" : "Appraisal tool", tool), { style: "flex:1" }),
        btn("Save", () => api("appraisal_tool", { tool: tool.value }), ""),
        btn("Add appraisal columns", () => api("prepare_charting", { appraisal: true }), "primary"))),
    card(sys ? "Risk-of-bias judgements" : "Ratings", `${inc.length} included ${sys ? "stud" + (inc.length === 1 ? "y" : "ies") : "source(s)"}` +
        (inc.some(r => r.appraisal_by === "AI") ? ` · ${inc.filter(r => r.appraisal_by === "AI").length} suggested by AI, to confirm` : ""),
      inc.length ? (() => {
        const head = [sys ? "Study" : "Source", sys ? "Overall risk of bias" : "Rating", "Reasons (with page locators)", ""].map(t => h("th", {}, t));
        return h("table", { class: "tbl" }, h("tr", {}, head),
      inc.map(r => {
        const mine = { appraisal_by: "reviewer" };      // any change by the reviewer makes the rating theirs
        const id = h("b", {}, r.record_id);            // each field is named by its column and this record id
        return h("tr", {}, h("td", { style: "width:34%" }, id, " ", r.title),
          h("td", { style: "width:170px" }, labelBy(h("select", { onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal: e.target.value, ...mine } }, { silent: true }) },
            ["", ...S.review_type.appraisalRatings].map(v => h("option", { value: v, selected: (r.appraisal || "") === v }, v || "—"))), [head[1], id])),
          h("td", {}, labelBy(h("input", { type: "text", value: r.appraisal_note || "", onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal_note: e.target.value, ...mine } }, { silent: true }) }), [head[2], id])),
          h("td", { style: "width:120px" }, r.appraisal_by === "AI" ? h("div", { class: "row" }, pill("AI", "warn"),
            btn("Confirm", () => api("set_record", { record_id: r.record_id, fields: mine }), "sm")) : null));
      }));
      })()
      : h("div", { class: "empty" }, "No included sources yet.")));
};
