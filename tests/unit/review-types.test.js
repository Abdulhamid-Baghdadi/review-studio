// Review types: scoping (PRISMA-ScR) and systematic (PRISMA 2020) profiles over the same review state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checklistOf, defaultState, restoreState, reviewType, saveQuestions, setReviewType, setStatus, stagesOf } from "../../src/domain/stages.js";
import { REVIEW_TYPES } from "../../src/domain/review-types.js";
import { protocolMarkdown } from "../../src/domain/protocol.js";
import { checklistEvidence, checklistNote, timelineNote } from "../../src/domain/stage-notes.js";
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

test("the PRISMA 2020 checklist has 27 items, 42 with sub-items", () => {
  const items = REVIEW_TYPES.systematic.checklist;
  assert.equal(items.length, 42);
  assert.equal(new Set(items.map(i => i.n.replace(/[a-f]$/, ""))).size, 27);
});

test("a systematic review: PICO, required risk of bias, a synthesis stage and its own checklist", () => {
  const st = defaultState("systematic");
  const titles = Object.fromEntries(stagesOf(st).map(s => [s.key, s]));
  assert.equal(titles.charting.title, "12 · Data extraction");
  assert.equal(titles.appraisal.optional, false);
  assert.equal(titles.synthesis.title, "14 · Synthesis and certainty");
  assert.equal(stagesOf(st).at(-1).title, "15 · Report");
  assert.throws(() => setStatus(st, "appraisal", "skipped", "not needed", now), /required/);

  saveQuestions(st, { population: "adults", concept: "exercise", context: "usual care", outcome: "pain", main: "Does it help?", sub: [], why: "first" }, { now });
  const protocol = protocolMarkdown({ reviewName: "R", reviewLink: "[[R]]", st, ftReasons: [], generatedBy: "test" });
  assert.match(protocol, /reported to PRISMA 2020/);
  assert.match(protocol, /\*\*Comparator:\*\* usual care/);
  assert.match(protocol, /\*\*Outcomes:\*\* pain/);
  assert.match(protocol, /PRISMA 2020 item 4/);
  assert.doesNotMatch(protocol, /PRISMA-ScR/);

  checklistOf(st)["16a"] = { done: true, location: "Results" };
  assert.equal(st.checklist_prisma2020["16a"].done, true);
  assert.deepEqual(st.checklist, {});                     // the PRISMA-ScR ticks are kept apart
  const evidence = checklistEvidence({ st, searches: [], records: [], guideExists: true, flowExists: false });
  assert.equal(evidence["5"], "exclusion reasons defined");
  const note = checklistNote({ reviewName: "R", reviewLink: "[[R]]", st, today: "2026-10-12", evidence });
  assert.match(note, /# R — PRISMA 2020 checklist/);
  assert.match(note, /\| 16a \| \*\*Study selection\*\*/);
  assert.match(timelineNote({ reviewName: "R", reviewLink: "[[R]]", st, today: "2026-10-12" }), /15 - PRISMA 2020 checklist/);
});

test("scoping questions keep their PCC history without an outcome", () => {
  const st = defaultState();
  saveQuestions(st, { population: "p", concept: "c", context: "x", main: "m", sub: [], why: "first" }, { now });
  saveQuestions(st, { population: "p2", concept: "c", context: "x", main: "m", sub: [], why: "second" }, { now });
  assert.equal("outcome" in st.questions.history[1], false);
});

test("optional checklist items do not block the report stage", () => {
  const st = defaultState();
  for (const it of reviewType(st).checklist) if (!it.optional) checklistOf(st)[it.n] = { done: true };
  assert.match(workComplete(st, []).report, /PRISMA-ScR/);
});

test("changing the review type after locking is an amendment", () => {
  const st = defaultState();
  assert.equal(setReviewType(st, "systematic", { now }), true);
  assert.equal(setReviewType(st, "systematic", { now }), false);
  st.protocol.locked = "2026-10-01";
  assert.throws(() => setReviewType(st, "scoping", { now }), /amendment/);
  setReviewType(st, "scoping", { reason: "the question is broader than planned", now });
  assert.equal(st.review_type, "scoping");
  assert.equal(st.amendments.at(-1).what, "review type");
  assert.throws(() => setReviewType(st, "umbrella", { now }), /Unknown/);
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
  assert.equal(REVIEW_TYPES.systematic.steps.length, 10);
  assert.equal(REVIEW_TYPES.systematic.steps.find(s => s.key === "quality").title, "Risk of bias");
});

test("a new review starts as a systematic review; a saved review without a type stays a scoping review", async () => {
  assert.equal((await loadState(memoryFolder())).review_type, "systematic");
  assert.equal((await loadState(memoryFolder({ "review_state.json": JSON.stringify({ questions: { main: "Q?" } }) }))).review_type, "scoping");
  assert.equal((await loadState(memoryFolder({ "review_state.json": JSON.stringify({ review_type: "scoping" }) }))).review_type, "scoping");
});
