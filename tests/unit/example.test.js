// The finished example review (web/example/example-review.json, built by scripts/build-example.js) opens with the app's
// own engine and still shows the review it was built as: a real OpenAlex search screened down to 10 included studies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { buildQuery } from "../../src/domain/queries.js";
import { flowView } from "../../src/ui/view-model.js";

const ex = JSON.parse(readFileSync(new URL("../../web/example/example-review.json", import.meta.url), "utf8"));

test("the finished example opens: 61 records from its planned OpenAlex search, 10 studies included", async () => {
  const bytes = Object.fromEntries(Object.entries(ex.binary).map(([p, b]) => [p, Uint8Array.from(Buffer.from(b, "base64"))]));
  const s = await ReviewSession.open(memoryFolder({ ...ex.files, ...bytes }),
    { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" }, settings: { name: "Example review", recordsPath: "Example review records/08 - Records" } });
  assert.equal(s.st.review_type, "systematic");
  assert.equal(buildQuery(s.st, "OpenAlex"), ex.search.query);              // the string that was run is the planned one
  const props = [...s.repo.records.values()].map(r => r.props);
  const f = flowView(props, await s.repo.searches());
  assert.deepEqual([f.unique, f.ta_excluded, f.sought, f.not_retrieved, f.included], [61, 48, 13, 3, 10]);
  assert.ok(props.filter(p => p.ft_decision === "include").every(p => p.chart_key_findings && p.chart_locators === "abstract"));
});
