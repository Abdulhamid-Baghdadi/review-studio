// The finished example review (web/example/example-review.json, built by scripts/build-example.js) opens with the app's
// own engine and still shows the review it was built as: a real OpenAlex search on sit-stand desks, screened down to
// 8 randomised trials read in full, with risk of bias and a meta-analysis; the open full texts ship next to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { buildQuery } from "../../src/domain/queries.js";
import { flowView } from "../../src/ui/view-model.js";
import { synthesisResults } from "../../src/services/synthesis.js";

const EX = new URL("../../web/example/", import.meta.url);
const ex = JSON.parse(readFileSync(new URL("example-review.json", EX), "utf8"));

test("the finished example opens: 65 records from its planned OpenAlex search, 8 trials included and pooled", async () => {
  const bytes = Object.fromEntries(Object.entries(ex.binary).map(([p, b]) => [p, Uint8Array.from(Buffer.from(b, "base64"))]));
  const pdfs = Object.fromEntries(Object.entries(ex.linked).map(([p, file]) => [p, new Uint8Array(readFileSync(new URL(file, EX)))]));
  const s = await ReviewSession.open(memoryFolder({ ...ex.files, ...bytes, ...pdfs }),
    { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" }, settings: { name: "Example review", recordsPath: "Example review records/08 - Records" } });
  assert.equal(s.st.review_type, "systematic");
  assert.equal(buildQuery(s.st, "OpenAlex"), ex.search.query);              // the string that was run is the planned one
  const props = [...s.repo.records.values()].map(r => r.props);
  const f = flowView(props, await s.repo.searches());
  assert.deepEqual([f.unique, f.ta_excluded, f.sought, f.not_retrieved, f.assessed, f.ft_excluded, f.included], [65, 49, 16, 7, 9, 1, 8]);
  const included = props.filter(p => p.ft_decision === "include");
  assert.ok(included.every(p => p.chart_result && p.chart_locators && p.chart_basis === "full text"));
  assert.ok(included.every(p => ["low", "some concerns", "high"].includes(p.appraisal)));
  const [{ analysis, grade }] = synthesisResults(s.repo, s.st);
  assert.equal(analysis.pooled.k, 7);                                       // Júdice 2024 (whole-day sitting) is described, not pooled
  assert.ok(analysis.pooled.est < -40 && analysis.pooled.hi < 0, "sit-stand desks reduce sitting at work");
  assert.equal(grade.label, "Low");
});

test("every full text shipped with the example has its licence listed, and only open ones are shipped", () => {
  const licences = readFileSync(new URL("full-texts/LICENSES.md", EX), "utf8");
  const works = Object.fromEntries(JSON.parse(readFileSync(new URL("openalex-search.json", EX), "utf8")).works.map(w => [w.id, w]));
  for (const file of Object.values(ex.linked)) {
    assert.ok(existsSync(new URL(file, EX)), file);
    const id = file.match(/W\d+/)[0];
    assert.match(licences, new RegExp(`${id}\\.pdf`), `${id} not in LICENSES.md`);
    assert.match(works[id].license, /^cc-by/, `${id} is not openly licensed`);
  }
});
