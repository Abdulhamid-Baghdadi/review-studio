/**
 * Steps, stages and tabs: which page is on screen, and going to another one.
 * @module web/studio/shell/navigation
 */
import { api } from "../core/api.js";
import { flushSaves } from "../core/autosave.js";
import { $, store } from "../core/dom.js";
import { CUR, HOME, PART, S, SC, setCur } from "../core/state.js";
import { render } from "./chrome.js";
import { openExample, openHelp } from "./help.js";
import { promptText } from "../ui/dialogs.js";

// The sidebar shows steps (src/domain/review-types.js): plain-language groups of stages. A step with more than
// one tab shows its stages as tabs at the top of the page. Statuses, files and links (#questions) stay per stage.
export const stage = k => S.stages.find(s => s.key === k);
export const stepOf = key => S.steps.find(st => st.tabs.some(t => t.stage === key));
export const stepStages = st => [...new Set(st.tabs.map(t => t.stage))].map(stage).filter(Boolean);
/** The tab on screen: the stage, and for a split page the part chosen. */
export const curTab = () => {
  const tabs = stepOf(CUR)?.tabs.filter(t => t.stage === CUR) ?? [];
  const part = CUR === "screening" ? SC.stage : PART[CUR];      // screening: titles and abstracts (ta) or full texts (ft)
  return tabs.find(t => t.part === (part ?? null)) ?? tabs[0];
};
/** Every tab of every step in order: what "Next" and "Back" walk through. */
export const tabSequence = () => S.steps.flatMap(st => st.tabs.map(t => ({ step: st, tab: t })));

/** A step's status from its stages: done when every required stage is done or skipped. */
export function stepStatus(st) {
  const ss = stepStages(st), req = ss.filter(s => !s.optional), count = req.length ? req : ss;
  if (count.every(s => s.status === "skipped")) return "skipped";
  if (count.every(s => s.status === "done" || s.status === "skipped")) return "done";
  return ss.some(s => ["in-progress", "done"].includes(s.status)) ? "in-progress" : "not-started";
}
/** What the page calls a stage: its tab label, or its step's title when the step has one tab. */
export const stageName = key => {
  const st = stepOf(key), own = st?.tabs.filter(t => t.stage === key) ?? [];
  if (own.length > 1) return (key === CUR ? curTab() : own[0]).label;          // a split page: the part on screen
  return st?.tabs.length > 1 ? own[0].label : st?.title ?? stage(key)?.title;
};
export const stepOptional = st => stepStages(st).every(s => s.optional);

/** The pages in order, as Back / Next and Alt+↑/↓ walk them: one per step, and one per part of Screen papers. */
export const pageSequence = () => tabSequence().filter(x => !sectioned(x.step) || x.tab === x.step.tabs[0]);
/** Where the page on screen is in pageSequence(). */
export const pageIndex = seq => { const st = stepOf(CUR), tab = curTab(); return seq.findIndex(x => (sectioned(st) ? x.step === st : x.tab === tab)); };

/**
 * A step shown as one page of sections (its parts one under another) rather than one part at a time. Screen papers
 * is not: its parts are boxes of the map.
 */
export const sectioned = st => Boolean(st) && st.tabs.length > 1 && st.key !== "screen";
/** The id of a part's section on its step's page. */
export const sectionId = t => `sec-${t.stage}${t.part ? "-" + t.part : ""}`;

/** Opens a tab (a stage, and the part of a split page); on a page of sections, scrolls to that section. */
export function goTab(t) {
  if (t.stage === "screening" && t.part) { SC.stage = t.part; store.set("sc_stage", t.part); SC.id = null; }
  else if (t.part) { PART[t.stage] = t.part; store.set("part_" + t.stage, t.part); }
  go(t.stage);
  const st = stepOf(t.stage);
  if (sectioned(st) && t !== st.tabs[0]) document.getElementById(sectionId(t))?.scrollIntoView({ block: "start" });
}
/** Opens a step: a page of sections at its top; otherwise on the part last used there, or its first part. */
export function goStep(st) {
  if (sectioned(st)) return goTab(st.tabs[0]);
  const last = store.get("tab_" + st.key, "");
  goTab(st.tabs.find(t => `${t.stage}:${t.part ?? ""}` === last) ?? st.tabs[0]);
}

export function go(key) { flushSaves(); setCur(key); store.set("stage", key); if (key !== HOME) store.set("last_stage", key); if (key !== HOME) { const st = stepOf(key), t = curTab(); if (st && t) store.set("tab_" + st.key, `${t.stage}:${t.part ?? ""}`); } history.replaceState(null, "", "#" + key); render(); $("#main").scrollTo({ top: 0 }); const dr = $("#drawer"); if (dr.classList.contains("open") && key !== HOME) (dr.querySelector("h2").textContent.startsWith("Example") ? openExample : openHelp)(key); }

export async function skipStage(key = CUR) {
  const r = await promptText("Skip this part", "Skipping is fine for optional parts, but the reason is reported in the timeline and the reporting checklist.", "e.g. not planned in the protocol", true, "", "Skip this part");
  if (r) api("stage_status", { stage: key, status: "skipped", reason: r });
}
