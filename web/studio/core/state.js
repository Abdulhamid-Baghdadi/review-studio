/**
 * What the page shows: the engine's snapshot of the review, the page on screen, drafts and the screening position.
 * @module web/studio/core/state
 */
import { store } from "./dom.js";

export let S = null;            // server snapshot
export let H = null;            // help texts
export let REVIEW = store.get("review", "Project 2 review");
const MOVED = { queries: "concepts" };            // pages merged into another (old links and saved places)
export let CUR = (k => MOVED[k] ?? k)(location.hash.slice(1) || store.get("stage", "home"));
export const D = {};            // unsaved drafts per stage

export const HOME = "home";                                  // the introduction page above the stages (not a stage itself)
export const PART = { report: store.get("part_report", "paper") };   // which part of a split stage page is shown
// ---------- screening
export const SC = { stage: store.get("sc_stage", "ta"), filter: "todo", id: null, cache: {}, excl: false };

// setters for the modules that replace these values
export function setS(value) { return (S = value); }
export function setH(value) { return (H = value); }
export function setReview(value) { return (REVIEW = value); }
export function setCur(value) { return (CUR = MOVED[value] ?? value); }
