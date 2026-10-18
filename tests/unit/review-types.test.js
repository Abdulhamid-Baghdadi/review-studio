// Review types: the scoping profile (PRISMA-ScR), the only one the app has; old "systematic" reviews open as scoping reviews.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checklistOf, defaultState, restoreState, reviewType, saveQuestions, stagesOf } from "../../src/domain/stages.js";
import { REVIEW_TYPES } from "../../src/domain/review-types.js";
import { workComplete } from "../../src/domain/progress.js";
import { loadState } from "../../src/services/review-state.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";

const now = "2026-10-12 10:00";

test("a state without a review type is a scoping review", () => {
  const st = restoreState({ questions: { main: "Q?" } });
  assert.equal(st.review_type, "scoping");
  assert.equal(reviewType(st).guideline, "PRISMA-ScR");
  assert.equal(stagesOf(st).length, 15);
  assert.equal(reviewType(st).checklist.length, 22);
  assert.deepEqual(reviewType(st).checklist.filter(i => i.optional).map(i => i.n), ["12", "16"]);
});

test("scoping questions keep their PCC history without an outcome", () => {
  const st = defaultState();
  saveQuestions(st, { population: "p", concept: "c", context: "x", main: "m", sub: [], why: "first" }, { now });
  saveQuestions(st, { population: "p2", concept: "c", context: "x", main: "m", sub: [], why: "second" }, { now: "2026-10-12 11:00" });
  assert.equal("outcome" in st.questions.history[1], false);
});

test("saving while typing: one version and one timeline entry per editing session", () => {
  const st = defaultState();
  const q = (main, when) => saveQuestions(st, { population: "p", concept: "c", context: "x", main, sub: [] }, { now: when });
  q("W", "2026-10-12 10:00"); q("Wh", "2026-10-12 10:00"); q("Which", "2026-10-12 10:01"); q("Which methods?", "2026-10-12 10:25");
  assert.equal(st.questions.history.length, 1);                       // the state before the session
  assert.equal(st.questions.main, "Which methods?");
  assert.equal(st.events.filter(e => e.stage === "questions").length, 1);
  q("Which methods work?", "2026-10-12 11:30");                         // a new session after a pause
  assert.equal(st.questions.history.length, 2);
  assert.equal(st.questions.history.at(-1).main, "Which methods?");
});

test("optional checklist items do not block the report stage", () => {
  const st = defaultState();
  for (const it of reviewType(st).checklist) if (!it.optional) checklistOf(st)[it.n] = { done: true };
  assert.match(workComplete(st, []).report, /PRISMA-ScR/);
});

test("the page's steps: every stage of a review type sits in exactly one step", () => {
  for (const type of Object.values(REVIEW_TYPES)) {
    const shown = [...new Set(type.steps.flatMap(s => s.tabs.map(t => t.stage)))];
    assert.deepEqual([...shown].sort(), type.stages.map(s => s.key).sort(), type.key);
    const owners = shown.map(k => type.steps.filter(s => s.tabs.some(t => t.stage === k)).length);
    assert.ok(owners.every(n => n === 1), `${type.key}: a stage in two steps`);
    assert.ok(type.steps.every(s => s.title && s.hint && s.phase && s.tabs.length), type.key);
  }
  assert.equal(REVIEW_TYPES.scoping.steps.length, 9);
  assert.deepEqual(Object.keys(REVIEW_TYPES), ["scoping"]);
});

test("a new review is a scoping review; a review saved as systematic opens as one and keeps its saved type", async () => {
  assert.equal((await loadState(memoryFolder())).review_type, "scoping");
  assert.equal((await loadState(memoryFolder({ "review_state.json": JSON.stringify({ questions: { main: "Q?" } }) }))).review_type, "scoping");
  const old = await loadState(memoryFolder({ "review_state.json": JSON.stringify({ review_type: "systematic", synthesis: { approach: "narrative" }, checklist_prisma2020: { 3: { done: true } } }) }));
  assert.equal(old.review_type, "systematic");                    // kept as saved
  assert.equal(reviewType(old).key, "scoping");                    // shown as a scoping review
  assert.equal(stagesOf(old).length, 15);
  assert.equal(old.synthesis.approach, "narrative");               // nothing the review saved is dropped
  assert.equal(old.checklist_prisma2020[3].done, true);
});
