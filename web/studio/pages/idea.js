/**
 * Page: Idea.
 * @module web/studio/pages/idea
 */
import { api, busy } from "../core/api.js";
import { $, h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGE_KEYS, PAGES } from "../shell/registry.js";
import { exampleFor } from "../shell/help.js";
import { autosize, btn, card } from "../ui/components.js";

// Ctrl+Enter adds the note being typed.
PAGE_KEYS.idea = e => {
  if (!(e.ctrlKey && e.key === "Enter")) return false;
  $("#page .btn.primary")?.click();
  return true;
};

PAGES.idea = () => {
  const ta = autosize(h("textarea", { placeholder: exampleFor("idea", "Note") || "What do you want to find out, and why? What did you read or discuss? What changed?", rows: 4, value: D.idea || "", oninput: e => D.idea = e.target.value }));
  const ideas = [...S.state.idea].reverse();
  return h("div", {},
    card("New idea note", "Short and dated. It is fine to be vague here — the Question tab makes it precise.", ta,
      h("div", { class: "row end", style: "margin-top:10px" }, h("span", { class: "kbdhint" }, "Ctrl+Enter to add"),
        btn("Add note", e => { if (ta.value.trim()) busy(e.currentTarget, () => api("add_idea", { text: ta.value }).then(() => D.idea = "")); }, "primary"))),
    card("Idea log", `${ideas.length} note(s)`, ideas.length ? h("div", { class: "tl" }, ideas.map(i => h("div", { class: "ev" }, h("div", { class: "when" }, i.when), i.text)))
      : h("div", { class: "empty" }, h("div", { class: "big" }, "💡"), "No notes yet.")));
};
