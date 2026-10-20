/**
 * The journey map at the top of every page: planning steps, the PRISMA flow boxes with live counts, analysis.
 * @module web/studio/shell/journey-map
 */
import { h, store } from "../core/dom.js";
import { CUR, HOME, S, SC } from "../core/state.js";
import { aiMark, render } from "./chrome.js";
import { go, goStep, stepOptional, stepStages, stepStatus } from "./navigation.js";
import { flowDiagram } from "../ui/charts.js";
import { iconBtn } from "../ui/components.js";
import { modal } from "../ui/dialogs.js";

// One row at the top of every page: the planning steps, then the boxes of the PRISMA flow diagram with their live
// counts (identification, screening, included), then the analysis steps and the report. Each box opens its step;
// the box of the page on screen is marked "You are here". It replaces a sidebar: the page keeps its full width.

/** Which box of the map the page on screen belongs to. */
function flowHere() {
  if (CUR === HOME) return null;
  if (CUR === "screening") return SC.stage === "ft" ? "assessed" : "screened";
  return { questions: "question", concepts: "search", protocol: "rules", methods: "methods", registration: "lock",
    searches: "identified", retrieval: "sought",
    charting: "extract", report: "report" }[CUR] ?? null;
}

function flowGroups() {
  const f = S.flow;
  const step = key => S.steps.find(s => s.key === key);
  const stepNode = (id, key, label) => step(key) && { id, step: step(key), label, go: () => goStep(step(key)) };
  const screen = st => () => { SC.stage = st; store.set("sc_stage", st); SC.id = null; go("screening"); };
  return [
    { phase: "Plan", nodes: [stepNode("question", "question", "Question"), stepNode("search", "search", "Search strategy"), stepNode("rules", "rules", "Inclusion & exclusion rules"), stepNode("methods", "methods", "Methods"), stepNode("lock", "lock", "Lock & register")] },
    { phase: "Find", prisma: true, nodes: [
      { id: "identified", step: step("import"), label: "Records found", n: f.n_db + f.n_other, minus: f.duplicates > 0 ? `${f.duplicates} duplicates` : "", go: () => go("searches"),
        tip: `Search & import: records from the databases (${f.n_db}) and other sources (${f.n_other}); duplicates are removed before screening.` },] },
    { phase: "Select", prisma: true, nodes: [
      { id: "screened", step: step("screen"), label: "Titles & abstracts", n: f.unique, minus: f.ta_excluded ? `${f.ta_excluded} excluded` : "", open: f.ta_pending,
        go: screen("ta"), tip: `Screen papers: titles and abstracts (${f.ta_pending} still to do).` },
      { id: "sought", label: "Full texts sought", n: f.sought, minus: f.not_retrieved ? `${f.not_retrieved} not found` : "", go: () => go("retrieval"),
        tip: "Screen papers → Get full texts: the papers that passed the title and abstract check." },
      { id: "assessed", label: "Full texts read", n: f.assessed, minus: f.ft_excluded ? `${f.ft_excluded} excluded` : "", open: f.ft_pending,
        go: screen("ft"), tip: `Screen papers: full texts (${f.ft_pending} still to do).` },
      { id: "included", label: "Included", n: f.included, good: true, go: screen("ft"), tip: "The papers your review is based on." }] },
    { phase: "Chart", nodes: [stepNode("extract", "extract", "Chart the data")] },
    { phase: "Report", nodes: [stepNode("report", "report", "Report")] },
  ].map(g => ({ ...g, nodes: g.nodes.filter(Boolean) }));
}

/** The map: folded to one slim line (numbered dots and the PRISMA counts) or unfolded; the choice is remembered. */
export function flowMap() {
  const groups = flowGroups(), here = flowHere(), open = store.get("map_open", "") === "1";
  const toggle = () => { store.set("map_open", open ? "" : "1"); render(); };
  const full = () => modal({ title: "PRISMA flow diagram", wide: true,
    body: h("div", {}, h("p", { class: "muted", style: "margin-top:0" }, "Live from your records; the box you are working on is highlighted."), flowDiagram(S.flow, here ?? undefined)) });
  const arrow = () => h("span", { class: "fm-arrow", "aria-hidden": "true" }, "→");
  const tipOf = (n, isHere) => (n.tip || (n.step ? `${n.step.title}: ${n.step.hint}` : n.label)) + (isHere ? " — you are here" : "");
  if (!open) {                                                     // folded: one line
    const SHORT = { identified: "Found", screened: "Titles & abstracts", sought: "Get full texts", assessed: "Full texts", included: "Included" };
    const item = n => {
      const isHere = n.id === here, num = n.step ? S.steps.indexOf(n.step) + 1 : null;
      if (n.n === undefined) {
        const status = stepStatus(n.step);
        // a step: its status dot and its name (the name folds away on narrower screens; the dot stays)
        return h("button", { class: `fmc-step ${isHere ? "here" : ""}`, onclick: n.go, title: tipOf(n, isHere), "aria-label": n.step.title, "aria-current": isHere ? "step" : null },
          h("span", { class: `fmc-dot ${status}`, "aria-hidden": "true" }, status === "done" ? "✓" : status === "skipped" ? "–" : String(num)),
          h("span", { class: "fmc-name", "aria-hidden": "true" }, n.step.title));
      }
      return h("button", { class: `fmc-count ${isHere ? "here" : ""} ${n.good ? "good" : ""}`, onclick: n.go, title: tipOf(n, isHere), "aria-current": isHere ? "step" : null },
        h("span", {}, SHORT[n.id] ?? n.label), h("b", {}, Number(n.n).toLocaleString()));
    };
    return h("nav", { class: "flowmap compact", "aria-label": "Steps of the review, with the PRISMA flow" },
      groups.flatMap((g, i) => [i ? arrow() : null, h("span", { class: `fmc-group ${g.prisma ? "prisma" : "steps"} ${g.nodes.length === 1 && !g.prisma ? "single" : ""}`, title: g.phase },
        h("span", { class: "fmc-phase" }, g.phase), g.nodes.flatMap((n, j) => [j && g.prisma && g.phase !== "Find" ? h("span", { class: "fmc-sep", "aria-hidden": "true" }, n.id === "reviewer" ? "·" : "›") : null, item(n)]))]),
      h("span", { class: "spacer" }),
      iconBtn("⤢", "Show the full PRISMA flow diagram", full),
      h("button", { class: "btn sm ghost fm-toggle", onclick: toggle, "aria-expanded": "false", title: "Unfold the map: every step with its name, and the PRISMA counts" }, "Map ▾"));
  }
  const node = n => {
    const isHere = n.id === here, status = n.step && n.n === undefined ? stepStatus(n.step) : null, num = n.step ? S.steps.indexOf(n.step) + 1 : null;
    return h("button", { class: `fm-node ${isHere ? "here" : ""} ${n.n === undefined ? "stepnode" : ""} ${n.small ? "small" : ""} ${n.good ? "good" : ""} ${status ?? ""}`,
      onclick: n.go, title: tipOf(n, isHere), "aria-current": isHere ? "step" : null },
      h("span", { class: "fm-label" }, num ? h("span", { class: "fm-num" }, status === "done" ? "✓" : status === "skipped" ? "–" : String(num)) : null, n.label,
        n.step && stepOptional(n.step) ? h("span", { class: "fm-opt" }, "optional") : null, n.step && !n.small ? aiMark([...stepStages(n.step).map(s => s.key), ...(n.step.key === "screen" ? ["fulltext"] : [])]) : null),
      n.n === undefined ? null : h("span", { class: "fm-n" }, Number(n.n).toLocaleString(), n.open ? h("span", { class: "fm-open" }, ` · ${n.open} to do`) : null),
      n.minus ? h("span", { class: "fm-minus" }, "− " + n.minus) : null,
      isHere ? h("span", { class: "fm-here" }, "You are here") : null);
  };
  // the planning and analysis steps as short lists
  const nodesOf = g => !g.prisma || g.phase === "Find"
    ? h("div", { class: "fm-nodes stack" }, g.nodes.map(node))
    : h("div", { class: "fm-nodes" }, g.nodes.flatMap((n, j) => [j && n.id !== "reviewer" ? arrow() : null, node(n)]));
  return h("nav", { class: "flowmap", "aria-label": "Steps of the review, with the PRISMA flow" },
    h("div", { class: "fm-track" }, groups.flatMap((g, i) => [i ? arrow() : null,
      h("div", { class: `fm-group ${g.prisma ? "prisma" : "steps"}` }, h("div", { class: "fm-phase" }, g.phase), nodesOf(g))])),
    h("div", { class: "fm-tools" }, iconBtn("⤢", "Show the full PRISMA flow diagram", full),
      h("button", { class: "btn sm ghost fm-toggle", onclick: toggle, "aria-expanded": "true", title: "Fold the map to one line" }, "▴")));
}
