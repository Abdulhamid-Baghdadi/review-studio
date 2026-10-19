// The finished example review (web/example/example-review.json, built by scripts/build-example.js) opens with the app's
// own engine and still shows the review it was built as: a real OpenAlex search on design for disassembly of battery
// packs, screened down to 4 papers read in full and charted; the openly licensed full texts ship next to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { buildQuery } from "../../src/domain/queries.js";
import { flowView } from "../../src/ui/view-model.js";

const EX = new URL("../../web/example/", import.meta.url);
const ex = JSON.parse(readFileSync(new URL("example-review.json", EX), "utf8"));

test("the finished example opens: 110 records from its planned OpenAlex search, 4 papers included and charted", async () => {
  const bytes = Object.fromEntries(Object.entries(ex.binary).map(([p, b]) => [p, Uint8Array.from(Buffer.from(b, "base64"))]));
  const pdfs = Object.fromEntries(Object.entries(ex.linked).map(([p, file]) => [p, new Uint8Array(readFileSync(new URL(file, EX)))]));
  const s = await ReviewSession.open(memoryFolder({ ...ex.files, ...bytes, ...pdfs }),
    { clock: { today: () => "2026-10-18", now: () => "2026-10-18 12:00" }, settings: { name: "Example review", recordsPath: "Example review records/08 - Records" } });
  assert.equal(s.st.review_type, "scoping");
  assert.equal(buildQuery(s.st, "OpenAlex"), ex.search.query);              // the string that was run is the planned one
  const props = [...s.repo.records.values()].map(r => r.props);
  const f = flowView(props, await s.repo.searches());
  assert.deepEqual([f.n_db, f.unique, f.ta_excluded, f.sought, f.not_retrieved, f.assessed, f.ft_excluded, f.included], [111, 110, 90, 20, 16, 4, 0, 4]);
  const included = props.filter(p => p.ft_decision === "include");
  assert.ok(included.every(p => p.chart_design_features && p.chart_assessment && p.chart_locators && p.chart_basis === "full text"));
  assert.ok(included.every(p => p.pdf), "every included paper has its full text");
});

test("every full text shipped with the example has its licence listed, and only CC BY ones are shipped", () => {
  const licences = readFileSync(new URL("full-texts/LICENSES.md", EX), "utf8");
  const works = Object.fromEntries(JSON.parse(readFileSync(new URL("openalex-search.json", EX), "utf8")).works.map(w => [w.id, w]));
  for (const file of Object.values(ex.linked)) {
    assert.ok(existsSync(new URL(file, EX)), file);
    const id = file.match(/W\d+/)[0];
    assert.match(licences, new RegExp(`${id}\\.pdf`), `${id} not in LICENSES.md`);
    assert.equal(works[id].license, "cc-by", `${id} is not CC BY`);
  }
});
