// Screening use cases (services/screening.js) and the test set in the library, on in-memory records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applySuggestions, clearPresort, confirmPresorted, decide } from "../../src/services/screening.js";
import { openLibrary } from "../../src/services/library.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";

/** A repository stand-in: the records map and put(), which is all these use cases touch. */
function repoWith(...records) {
  const records_ = new Map(records.map(props => [props.record_id, { id: props.record_id, props }]));
  return { records: records_, put(r) { records_.set(r.id, r); } };
}
const pending = (id, more = {}) => ({ record_id: id, ta_decision: "pending", ta_reason: "", ft_decision: "", ft_reason: "", notes: "", ...more });

test("one decision keeps the reason only for an exclusion; notes are optional", () => {
  const repo = repoWith(pending("R1"), pending("R2"));
  assert.deepEqual([...decide(repo, "R1", "ta", "exclude", { reason: "E1", notes: "off topic" })], ["R1"]);
  assert.deepEqual([repo.records.get("R1").props.ta_decision, repo.records.get("R1").props.ta_reason, repo.records.get("R1").props.notes], ["exclude", "E1", "off topic"]);
  decide(repo, "R2", "ft", "include", { reason: "ignored" });
  assert.deepEqual([repo.records.get("R2").props.ft_decision, repo.records.get("R2").props.ft_reason, repo.records.get("R2").props.notes], ["include", "", ""]);
});

test("confirming pre-sorts: only pending records, each with its own code", () => {
  const repo = repoWith(pending("R1", { presort: "E3" }), pending("R2"), pending("R3", { ta_decision: "include", presort: "E3" }));
  const changed = confirmPresorted(repo, ["R1", "R2", "R3", "R9"], "E1");
  assert.deepEqual([...changed], ["R1", "R2"]);
  assert.equal(repo.records.get("R1").props.ta_reason, "E3");
  assert.equal(repo.records.get("R2").props.ta_reason, "E1", "no pre-sort code: the reason given");
  assert.equal(repo.records.get("R3").props.ta_decision, "include", "a decided record is left alone");
  assert.match(repo.records.get("R1").props.notes, /pre-sorted by rule, confirmed by reviewer/);
});

test("AI suggestions: kept or changed is noted; full text only for records past title/abstract", () => {
  const repo = repoWith(pending("R1", { ai_decision: "exclude", ai_reason: "E2" }), pending("R2", { ai_decision: "include" }),
    pending("R3", { ta_decision: "include", ft_decision: "pending", ai_ft_decision: "include" }), pending("R4", { ta_decision: "exclude", ft_decision: "pending" }));
  const ta = applySuggestions(repo, [{ id: "R1", decision: "exclude", reason: "E2" }, { id: "R2", decision: "exclude", reason: "E1" }]);
  assert.deepEqual([...ta], ["R1", "R2"]);
  assert.match(repo.records.get("R1").props.notes, /AI suggestion confirmed by reviewer/);
  assert.match(repo.records.get("R2").props.notes, /reviewer changed AI suggestion/);
  const ft = applySuggestions(repo, [{ id: "R3", decision: "include" }, { id: "R4", decision: "include" }], "ft");
  assert.deepEqual([...ft], ["R3"], "R4 was excluded at title/abstract");
  assert.match(repo.records.get("R3").props.notes, /AI full-text suggestion confirmed/);
});

test("clearing pre-sorts returns records to the queue", () => {
  const repo = repoWith(pending("R1", { presort: "E3", presort_reason: "year" }));
  clearPresort(repo, ["R1"]);
  assert.deepEqual([repo.records.get("R1").props.presort, repo.records.get("R1").props.presort_reason], ["", ""]);
});

