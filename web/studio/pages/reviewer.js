/**
 * Page: Second reviewer.
 * @module web/studio/pages/reviewer
 */
import { api, busy, download } from "../core/api.js";
import { h, pct } from "../core/dom.js";
import { D, S, SC } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { go } from "../shell/navigation.js";
import { gauge } from "../ui/charts.js";
import { btn, card, decKind, dropzone, field, pill } from "../ui/components.js";
import { confirmBox } from "../ui/dialogs.js";

PAGES.reviewer = () => {
  const stage = h("select", {}, h("option", { value: "ta" }, "Title / abstract"), h("option", { value: "ft" }, "Full text"));
  const frac = h("input", { type: "number", step: "0.05", min: "0.05", max: "1", value: "0.2" });
  const seed = h("input", { type: "text", placeholder: "empty = random (logged)" });
  const g = st => {
    const a = S.agreement[st];
    return h("div", { class: "card", style: "margin:0;text-align:center" }, h("h2", {}, st === "ta" ? "Title / abstract" : "Full text"), gauge(a.kappa),
      h("div", { class: "small muted" }, `${a.sampled} sampled · ${a.decided} decided by both · agreement ${pct(a.agreement)}`),
      a.kappa != null ? h("div", { style: "margin-top:6px" }, a.kappa >= 0.6 ? pill("meets the usual 0.6 convention", "ok") : pill("below 0.6 — discuss and clarify criteria", "bad")) : null);
  };
  const dis = [...S.agreement.ta.disagreements.map(d => ({ ...d, st: "ta" })), ...S.agreement.ft.disagreements.map(d => ({ ...d, st: "ft" }))];
  return h("div", {},
    h("div", { class: "grid2" },
      card("1 · Draw the sample", "A random sample with a recorded seed. The sheet contains none of your decisions.",
        h("div", { class: "grid3" }, field("Stage", stage), field("Fraction", frac), field("Seed", seed)),
        h("div", { class: "row end", style: "margin-top:12px" }, btn("Draw sample & write sheet", async e => {
          const exists = S.records.some(r => r["sample_" + stage.value]);
          if (exists && !(await confirmBox("Sample exists", "A sample for this screening round already exists. Draw a new one? The old draw stays in the log.", "Draw new sample"))) return;
          busy(e.target, () => api("sample", { stage: stage.value, fraction: frac.value, seed: seed.value, redo: exists }));
        }, "primary")),
        S.sheets.length ? h("div", { style: "margin-top:12px" }, h("b", { class: "small" }, "Sheets — send to your second reviewer:"),
          S.sheets.map(s => h("div", {}, h("a", { href: "#", onclick: e => { e.preventDefault(); download("09 - Second reviewer/" + s); } }, "⬇ " + s)))) : null),
      card("2 · Import the returned sheet", "The reviewer fills 'decision' (include / exclude / unsure) and 'reason'.",
        field("Stage of the sheet", (() => { const s2 = stage.cloneNode(true); D.r2stage = s2; return s2; })()),
        h("div", { style: "margin-top:10px" }, dropzone("The CSV sheet as returned", ".csv", p => api("import_r2", { path: p, stage: D.r2stage.value }))))),
    h("div", { class: "grid2", style: "margin-top:16px" }, g("ta"), g("ft")),
    card("Disagreements", "Resolve each by discussion; change your decision if needed and note the outcome.",
      dis.length ? h("table", { class: "tbl" }, h("tr", {}, ["Record", "You", "Second reviewer", ""].map(t => h("th", {}, t))),
        dis.map(d => h("tr", {}, h("td", {}, h("b", {}, d.record_id), " ", h("span", { class: "small" }, d.title)), h("td", {}, pill(d.mine, decKind(d.mine))),
          h("td", {}, pill(d.theirs, decKind(d.theirs)), d.reason ? h("span", { class: "small muted" }, " " + d.reason) : null),
          h("td", {}, btn("Open", () => { SC.stage = d.st; SC.filter = "all"; SC.id = d.record_id; go("screening"); }, "sm")))))
        : h("div", { class: "empty" }, "No disagreements (yet).")));
};
