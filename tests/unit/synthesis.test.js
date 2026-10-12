// The synthesis stage on an in-memory systematic review: outcomes with study data, the meta-analysis,
// GRADE suggestions and confirmed judgements, and the files written to 14 - Synthesis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { synthesisView } from "../../src/ui/view-model.js";

const deps = () => ({ clock: { today: () => "2026-01-15", now: () => "2026-01-15 10:00" }, settings: { name: "T", recordsPath: "T records/08 - Records" } });
const ris = ["Trial A", "Trial B", "Trial C", "Trial D"]
  .map((t, i) => `TY  - JOUR\nTI  - ${t}\nAU  - Author${i}, Z.\nPY  - 202${i}\nAB  - Abstract.\nER  - `).join("\n") + "\n";

async function review() {
  const s = await ReviewSession.open(memoryFolder(), deps());
  s.st.review_type = "systematic";
  await s.lockProtocol("PROSPERO-1");
  await s.importSearch({ fileName: "a.ris", bytes: new TextEncoder().encode(ris), database: "MEDLINE", query: "q" });
  for (const id of ["R0001", "R0002", "R0003"]) { await s.decide(id, "ta", "include"); await s.decide(id, "ft", "include"); }
  await s.setRecord("R0001", { appraisal: "high", appraisal_by: "reviewer" });
  await s.setRecord("R0002", { appraisal: "low", appraisal_by: "reviewer" });
  return s;
}

const mortality = {
  name: "Mortality", comparison: "drug vs placebo", type: "binary", measure: "RR", model: "random", design: "rct",
  rows: [{ record_id: "R0001", e1: 10, n1: 100, e2: 20, n2: 100 }, { record_id: "R0002", e1: 15, n1: 150, e2: 25, n2: 150 },
    { record_id: "R0003", e1: 8, n1: 80, e2: 12, n2: 80 }],
};

test("synthesis: an outcome is analysed and written to 14 - Synthesis with an R script and a summary of findings", async () => {
  const s = await review();
  const { id } = await s.saveOutcome(mortality);
  assert.equal(id, "O1");
  const f = s.repo.folder;
  for (const name of ["Mortality.md", "Mortality forest.svg", "Mortality funnel.svg", "Mortality data.csv", "Mortality.R"])
    assert.ok(await f.exists(`14 - Synthesis/${name}`), name);
  const note = await f.readText("14 - Synthesis/Mortality.md");
  assert.match(note, /Pooled risk ratio 0\.\d\d \(95% CI/);
  assert.match(note, /\| Author0 2020 \| 10 \| 100 \| 20 \| 100 \|/);
  assert.match(await f.readText("14 - Synthesis/Mortality.R"), /escalc\(measure = "RR", ai = e1, n1i = n1, ci = e2, n2i = n2/);
  assert.match(await f.readText("14 - Summary of findings.md"), /\| \[\[14 - Synthesis\/Mortality\\\|Mortality\]\] \| 3 \(660\) \| RR /);
  assert.match(s.st.events.at(-1).text, /outcome "Mortality" added/);
});

test("synthesis: GRADE suggestions, confirmed judgements and the certainty", async () => {
  const s = await review();
  await s.saveOutcome(mortality);
  let [view] = synthesisView(s);
  const d = view.grade.domains;
  assert.equal(view.grade.confirmed, false);
  assert.equal(d.imprecision.level, -1, "only 90 events: below the optimal information size");
  assert.match(d.imprecision.reason, /90 events/);
  assert.equal(d.publication.level, 0);
  assert.match(d.publication.reason, /too few/);
  assert.equal(d.rob.level, -1, "unrated R0003 and high-risk R0001 carry most of the weight");
  const o = s.st.synthesis.outcomes[0];
  await s.saveOutcome({ ...o, grade: { rob: { level: 0, reason: "sensitivity analysis without R0001 agrees", confirmed: true } } });
  [view] = synthesisView(s);
  assert.equal(view.grade.domains.rob.confirmed, true);
  assert.equal(view.grade.domains.rob.level, 0);
  assert.equal(view.grade.score, 3, "high, minus one for imprecision");
  assert.equal(view.grade.label, "Moderate");
  assert.ok(view.forest.startsWith("<svg"));
});

test("synthesis: only included studies; removing an outcome keeps the review notes", async () => {
  const s = await review();
  await assert.rejects(s.saveOutcome({ ...mortality, rows: [{ record_id: "R0004", e1: 1, n1: 2, e2: 1, n2: 2 }] }), /Not an included study: R0004/);
  await assert.rejects(s.saveOutcome({ ...mortality, name: " " }), /name/);
  const { id } = await s.saveOutcome(mortality);
  await s.saveSynthesis({ approach: "random effects" });
  assert.equal(s.st.synthesis.outcomes.length, 1, "saving the synthesis record keeps the outcomes");
  assert.match(await s.deleteOutcome(id), /Removed "Mortality"/);
  assert.equal(s.st.synthesis.outcomes.length, 0);
});
