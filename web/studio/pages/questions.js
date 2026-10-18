/**
 * Page: Question.
 * @module web/studio/pages/questions
 */
import { api } from "../core/api.js";
import { autoSave } from "../core/autosave.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { exampleFor } from "../shell/help.js";
import { autosize, btn, card, field, iconBtn, labelBy } from "../ui/components.js";

PAGES.questions = () => {
  const q = S.state.questions, rt = S.review_type, Q = rt.question;
  const d = D.questions ??= { population: q.population, concept: q.concept, context: q.context, outcome: q.outcome ?? "", main: q.main, sub: [...q.sub], why: "" };
  const bind = k => e => d[k] = e.target.value;
  const saver = autoSave("questions", () => api("save_questions", { q: { ...d, sub: d.sub.filter(x => x.trim()) }, why: d.why }, { render: false, silent: true }), "questions");
  const subs = h("div", { class: "stack" }), subsTitle = h("span", { class: "small muted", style: "font-weight:600" }, "Sub-questions");
  const drawSubs = () => subs.replaceChildren(...d.sub.map((s, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
    ...(n => [n, labelBy(h("input", { type: "text", value: s, placeholder: exampleFor("questions", "Sub-questions", i), oninput: e => d.sub[i] = e.target.value }), [subsTitle, n])])(h("span", { class: "muted", style: "width:22px" }, `${i + 1}.`)),
    iconBtn("✕", "Remove sub-question", () => { d.sub.splice(i, 1); drawSubs(); saver.schedule(); }))), btn("+ Add sub-question", () => { d.sub.push(""); drawSubs(); }, "sm"));
  drawSubs();
  const pcc = (k, label, hint, color) => {
    const title = h("h2", {}, label), sub = h("p", { class: "sub" }, hint);   // the card's title is the field's label
    return h("div", { class: "card", style: `border-top:3px solid ${color};margin:0` }, title, sub,
      labelBy(autosize(h("textarea", { rows: 2, value: d[k], placeholder: exampleFor("questions", label), oninput: bind(k) })), title, sub));
  };
  const hints = { population: "What is studied? (products, systems, people…)", concept: "The core phenomenon, method or intervention", context: "Setting, domain, period, publication types" };
  return saver.watch(h("div", {},
    h("div", { class: Q.outcome ? "grid4" : "grid3", style: "margin-bottom:16px" },
      pcc("population", Q.population, hints.population, "#4f46e5"),
      pcc("concept", Q.concept, hints.concept, "#0891b2"),
      pcc("context", Q.context, hints.context, "#16a34a"),
      Q.outcome ? pcc("outcome", Q.outcome, hints.outcome, "#d97706") : null),
    card("Review questions", null,
      field("Main question", autosize(h("textarea", { rows: 2, value: d.main, placeholder: exampleFor("questions", "Main question"), oninput: bind("main") }))),
      h("div", { style: "margin-top:12px" }, subsTitle, subs),
      h("div", { class: "hr" }),
      field("Why it changed (optional; kept with this version)", h("input", { type: "text", placeholder: "e.g. narrowed to household appliances after reading the first papers", value: d.why, oninput: bind("why") }),
        "Saved as you type. A new version is kept each time you come back to edit after a pause.")),
    q.history.length ? card("Earlier versions", `${q.history.length} version(s), newest first`,
      [...q.history].reverse().map(v => h("details", { style: "padding:6px 0;border-bottom:1px solid var(--border)" },
        h("summary", {}, h("b", {}, v.when), " — ", v.why || "no reason given"),
        h("div", { class: "small", style: "padding:6px 0 0 14px" }, h("div", {}, "Main: ", v.main || "—"), h("div", { class: "muted" }, `${Q.population}: ${v.population || "—"} · ${Q.concept}: ${v.concept || "—"} · ${Q.context}: ${v.context || "—"}` + (Q.outcome ? ` · ${Q.outcome}: ${v.outcome || "—"}` : "")))))) : null));
};
