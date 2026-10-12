/**
 * The review as a sequence of stages, from the first idea to the report: the stages, the review state kept
 * in review_state.json, and the rules for changing it (status, events, protocol lock and amendments).
 * Functions here change the state object they are given and take the current time from the caller.
 * @module domain/stages
 */
import { strip } from "./text-rules.js";
import { ALL_PROTOCOL_SECTIONS, ALL_STAGE_KEYS, DEFAULT_REVIEW_TYPE, REVIEW_TYPES, reviewType } from "./review-types.js";

export { REVIEW_TYPES, reviewType };

/** @typedef {import("./review-types.js").Stage} Stage */

/** The stages of a scoping review (the default type); `stagesOf(st)` gives a review's own stages. */
export const STAGES = REVIEW_TYPES.scoping.stages;

/** A review's stages, in order, for its review type. */
export const stagesOf = st => reviewType(st).stages;

/** One stage of a review, by key. */
export const stageOf = (st, key) => reviewType(st).stages.find(s => s.key === key) ?? STAGE[key];

/** @type {Readonly<Record<string, Stage>>} */
export const STAGE = Object.freeze(Object.fromEntries(STAGES.map(s => [s.key, s])));

export const FULLTEXT_DIR = "10 - Full texts";
export const STATUS_ICON = Object.freeze({ "not-started": "○", "in-progress": "◐", done: "●", skipped: "⤼" });
export const PROTECTED = Object.freeze(["questions", "concepts", "queries", "protocol_text", "charting", "criteria"]);
export const DEFAULT_DATABASES = Object.freeze(["Scopus", "Web of Science", "IEEE Xplore", "OpenAlex"]);

export const DEFAULT_FIELDS = Object.freeze([
  { name: "study_type", description: "Study type / design (e.g. case study, method development, LCA, review)" },
  { name: "product_domain", description: "Products or systems studied" },
  { name: "modularity_definition", description: "How modularity is defined or measured" },
  { name: "method", description: "Method or approach used" },
  { name: "criteria", description: "Criteria or outcomes assessed (impact, cost, repair, upgrade, ...)" },
  { name: "key_findings", description: "Main findings relevant to the review questions" },
  { name: "locators", description: "Page / section / table locators for the values above" },
].map(Object.freeze));

/** @type {readonly [string, string][]} section key, heading — of a scoping review; `reviewType(st).protocolSections` per review */
export const PROTOCOL_SECTIONS = REVIEW_TYPES.scoping.protocolSections;

/** The PRISMA-ScR checklist; `reviewType(st).checklist` gives a review's own checklist. */
export const CHECKLIST = REVIEW_TYPES.scoping.checklist;

/** A review's checklist ticks ({item: {location, done}}), kept per review type. */
export const checklistOf = st => (st[reviewType(st).checklistKey] ??= {});

/** A deep copy of plain data (state values are JSON). */
const copy = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Equality of JSON-like values: deep, key order ignored. */
export function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) === Number(b) && typeof a !== "string" && typeof b !== "string";
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
  }
  return false;
}

/** A new review's state. */
export function defaultState(type = DEFAULT_REVIEW_TYPE) {
  return {
    version: 1,
    review_type: type,
    stages: Object.fromEntries(ALL_STAGE_KEYS.map(key => [key, { status: "not-started", reason: "", updated: "" }])),
    idea: [],
    questions: { population: "", concept: "", context: "", outcome: "", main: "", sub: [], history: [] },
    concepts: [],
    queries: { databases: [...DEFAULT_DATABASES], manual: {} },
    pilots: [],
    protocol_text: Object.fromEntries(ALL_PROTOCOL_SECTIONS.map(k => [k, ""])),
    protocol_meta: {},
    supervisor_review: {},
    concepts_history: [],
    protocol: { locked: "", file: "", sha256: "", registration: "", commit: "", snapshot: {} },
    amendments: [],
    snowballing: { rounds: [] },
    charting: { fields: DEFAULT_FIELDS.map(f => ({ ...f })), appraisal_tool: "" },
    checklist: {},
    checklist_prisma2020: {},
    synthesis: { approach: "", software: "", results_file: "", heterogeneity: "", reporting_bias: "", certainty: "", notes: "", outcomes: [] },
    ai: {},
    events: [],
  };
}

/** The saved state over the defaults: saved objects update the default ones key by key (one level). */
export function restoreState(saved) {
  const st = defaultState();
  for (const [k, v] of Object.entries(saved ?? {})) {
    const isObject = x => x && typeof x === "object" && !Array.isArray(x);
    if (isObject(v) && isObject(st[k])) Object.assign(st[k], v);
    else st[k] = v;
  }
  if (!REVIEW_TYPES[st.review_type]) st.review_type = DEFAULT_REVIEW_TYPE;    // reviews made before review types: scoping
  for (const key of ALL_STAGE_KEYS) st.stages[key] ??= { status: "not-started", reason: "", updated: "" };
  return st;
}

/** Adds a dated event to the timeline. */
export function event(st, stage, text, now) {
  st.events.push({ when: now, stage, text });
}

/** A stage that has not started becomes in progress. */
export function touch(st, stage, now) {
  const s = st.stages[stage];
  if (s.status === "not-started") { s.status = "in-progress"; s.updated = now; }
}

/** Sets a stage's status by hand; skipping needs a reason and is only allowed for optional stages. */
export function setStatus(st, stage, status, reason, now) {
  const s = stageOf(st, stage);
  if (status === "skipped" && !s.optional) throw new Error(`${s.title} is required and cannot be skipped.`);
  if (status === "skipped" && !strip(reason ?? "")) throw new Error("A reason is required to skip a stage.");
  st.stages[stage] = { status, reason: strip(reason ?? ""), updated: now };
  if (status === "in-progress") st.stages[stage].reopened = true;    // no automatic "done" until marked again
  event(st, stage, { done: "marked done", skipped: `skipped — ${strip(reason ?? "")}`, "in-progress": "reopened", "not-started": "reset" }[status], now);
}

export const isLocked = st => Boolean(st.protocol.locked);

/** A change to a protected part needs an amendment when the protocol is locked and developer mode is off. */
export const needsAmendment = (st, devMode) => isLocked(st) && !devMode;

/** Records an amendment (a change to a protected part after locking) with its reason. */
export function amend(st, what, reason, now) {
  if (!strip(reason ?? "")) throw new Error("The protocol is locked: give the reason for this amendment.");
  st.amendments.push({ when: now, what, reason: strip(reason) });
  event(st, "protocol", `amendment (${what}): ${strip(reason)}`, now);
}

/** Changes made in developer mode after locking are still written to the timeline. */
function devNote(st, what, devMode, now) {
  if (isLocked(st) && devMode) event(st, "protocol", `developer mode: ${what} changed without an amendment`, now);
}

/**
 * Replaces a protected part of the state; after locking this needs an amendment reason.
 * @returns {boolean} whether anything changed
 */
export function guardedChange(st, key, value, { reason = "", devMode = false, now }) {
  if (sameValue(st[key], value)) return false;
  if (needsAmendment(st, devMode)) amend(st, key, reason, now);
  else devNote(st, key, devMode, now);
  st[key] = copy(value);
  return true;
}

/** Adds a dated note to the idea log. */
export function addIdea(st, text, now) {
  st.idea.push({ when: now, text: strip(text) });
  touch(st, "idea", now);
  event(st, "idea", "idea note added", now);
}

/** Saves a new version of the review questions; the old version is kept with the reason for the change. */
export function saveQuestions(st, { population, concept, context, outcome, main, sub, why, amendment = "" }, { devMode = false, now }) {
  const q = st.questions;
  const next = { population: strip(population), concept: strip(concept), context: strip(context), outcome: strip(outcome ?? q.outcome ?? ""), main: strip(main), sub: sub.map(strip).filter(Boolean) };
  if (!reviewType(st).question.outcome && !next.outcome) delete next.outcome;    // PCC has no outcome: keep scoping histories as they were
  const old = Object.fromEntries(Object.keys(next).map(k => [k, q[k]]));
  if (sameValue(next, old)) return false;
  if (needsAmendment(st, devMode)) amend(st, "questions", amendment || why, now);
  else devNote(st, "questions", devMode, now);
  q.history.push({ when: now, why: strip(why), ...copy(old) });
  Object.assign(q, next);
  touch(st, "questions", now);
  event(st, "questions", `questions revised — ${strip(why) || "no reason given"}`, now);
  return true;
}

/**
 * Changes the review type (scoping or systematic); after locking this is an amendment.
 * @returns {boolean} whether anything changed
 */
export function setReviewType(st, type, { reason = "", devMode = false, now }) {
  if (!REVIEW_TYPES[type]) throw new Error(`Unknown review type: ${type}`);
  if (st.review_type === type) return false;
  if (needsAmendment(st, devMode)) amend(st, "review type", reason, now);
  else devNote(st, "review type", devMode, now);
  st.review_type = type;
  event(st, "questions", `review type: ${REVIEW_TYPES[type].label} (reported to ${REVIEW_TYPES[type].guideline})`, now);
  return true;
}
