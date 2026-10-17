/**
 * Page: Critical appraisal / risk of bias.
 * @module web/studio/pages/appraisal
 */
import { api } from "../core/api.js";
import { h } from "../core/dom.js";
import { S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { btn, card, pill } from "../ui/components.js";

PAGES.appraisal = () => {
  const sys = S.review_type.key === "systematic";
  const tool = h("input", { type: "text", value: S.state.charting.appraisal_tool || "", placeholder: sys ? "e.g. RoB 2, ROBINS-I, JBI checklist" : "e.g. MMAT 2018" });
  const inc = S.records.filter(r => r.ft_decision === "include");
  return h("div", {},
    card("Approach", sys ? "Choose a risk-of-bias tool that suits the study designs (RoB 2 for randomised trials, ROBINS-I for non-randomised studies). Required in a systematic review."
      : "Choose a tool that suits the study designs. If you skip appraisal, use 'Skip' above and give the reason.",
      h("div", { class: "row", style: "flex-wrap:nowrap" }, tool, btn("Save", () => api("appraisal_tool", { tool: tool.value }), ""),
        btn("Add appraisal columns", () => api("prepare_charting", { appraisal: true }), "primary"))),
    card(sys ? "Risk-of-bias judgements" : "Ratings", `${inc.length} included ${sys ? "stud" + (inc.length === 1 ? "y" : "ies") : "source(s)"}` +
        (inc.some(r => r.appraisal_by === "AI") ? ` · ${inc.filter(r => r.appraisal_by === "AI").length} suggested by AI, to confirm` : ""),
      inc.length ? h("table", { class: "tbl" }, h("tr", {}, [sys ? "Study" : "Source", sys ? "Overall risk of bias" : "Rating", "Reasons (with page locators)", ""].map(t => h("th", {}, t))),
      inc.map(r => {
        const mine = { appraisal_by: "reviewer" };      // any change by the reviewer makes the rating theirs
        return h("tr", {}, h("td", { style: "width:34%" }, h("b", {}, r.record_id), " ", r.title),
          h("td", { style: "width:170px" }, h("select", { onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal: e.target.value, ...mine } }, { silent: true }) },
            ["", ...S.review_type.appraisalRatings].map(v => h("option", { value: v, selected: (r.appraisal || "") === v }, v || "—")))),
          h("td", {}, h("input", { type: "text", value: r.appraisal_note || "", onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal_note: e.target.value, ...mine } }, { silent: true }) })),
          h("td", { style: "width:120px" }, r.appraisal_by === "AI" ? h("div", { class: "row" }, pill("AI", "warn"),
            btn("Confirm", () => api("set_record", { record_id: r.record_id, fields: mine }), "sm")) : null));
      }))
      : h("div", { class: "empty" }, "No included sources yet.")));
};
