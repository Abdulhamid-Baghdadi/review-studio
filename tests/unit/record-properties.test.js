// Record notes use full-word property names (title_abstract_decision …), the properties shared with the library's
// publication notes come first, and empty optional groups are left out. Older notes with the short names still open
// and are rewritten in full words when the review is opened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromNote, fullName, hasShortNames, shortName, toNote } from "../../src/domain/record-properties.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { flowView } from "../../src/ui/view-model.js";

test("names: short in memory, full words in the note, both ways", () => {
  for (const [s, f] of [["ta_decision", "title_abstract_decision"], ["ft_reason", "full_text_reason"], ["pdf_status", "full_text_status"],
    ["oa_url", "open_access_url"], ["r2_ft_decision", "second_reviewer_full_text_decision"], ["chart_result", "extracted_result"],
    ["chart_basis", "extraction_basis"], ["title", "title"], ["appraisal_note", "appraisal_note"]]) {
    assert.equal(fullName(s), f);
    assert.equal(shortName(f), s);
  }
});

test("written note: shared properties first, no empty optional groups, unknown properties kept", () => {
  const props = { ta_decision: "include", notes: "", sample_ta: false, r2_ta_decision: "", chart_result: "−58 min", mine: "x",
    title: "T", type: "review-record", record_id: "R0001", authors: "Doe, J.", ai_decision: "", appraisal: "low" };
  const note = toNote(props);
  assert.deepEqual(Object.keys(note), ["type", "record_id", "title", "authors", "title_abstract_decision", "notes", "extracted_result", "appraisal", "mine"]);
  const { ai_decision, ...kept } = props;                                       // an empty optional property is not written
  assert.deepEqual(fromNote(note), { sample_ta: false, r2_ta_decision: "", r2_ta_reason: "", sample_ft: false, r2_ft_decision: "", r2_ft_reason: "", ...kept });
  assert.equal(fromNote({ ta_decision: "exclude", title_abstract_decision: "include" }).ta_decision, "include", "the full-word name wins");
});

const OLD_RECORD = (id, ta, ft) => `---
type: "review-record"
review: "[[Old review]]"
record_id: "${id}"
title: "Paper ${id}"
authors: "Doe, Jane"
year: 2020
ta_decision: "${ta}"
ta_reason: "${ta === "exclude" ? "E1" : ""}"
ft_decision: "${ft}"
ft_reason: ""
pdf_status: ""
screener: ""
screened_on: "2026-01-01"
notes: "typed in Obsidian"
sample_ta: false
r2_ta_decision: ""
r2_ta_reason: ""
sample_ft: false
r2_ft_decision: ""
r2_ft_reason: ""
chart_design: "${ft === "include" ? "RCT" : ""}"
---

# Paper ${id}

## Reading notes

My own words.
`;

test("an older review opens unchanged in meaning and its notes are rewritten in full words", async () => {
  const folder = memoryFolder({
    "08 - Records/R0001 - 2020 - Doe - Paper R0001.md": OLD_RECORD("R0001", "include", "include"),
    "08 - Records/R0002 - 2020 - Doe - Paper R0002.md": OLD_RECORD("R0002", "exclude", ""),
    "08 - Screening guide.md": "---\ntype: \"screening-guide\"\nta_reasons:\n  - \"E1 wrong\"\nft_reasons:\n  - \"E1 wrong\"\n---\n\n# Screening guide\n",
  });
  const s = await ReviewSession.open(folder, { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" },
    settings: { name: "Old review", recordsPath: "Old review records/08 - Records" } });
  const f = flowView([...s.repo.records.values()].map(r => r.props), []);
  assert.deepEqual([f.unique, f.ta_excluded, f.included], [2, 1, 1]);
  const text = await folder.readText("08 - Records/R0001 - 2020 - Doe - Paper R0001.md");
  assert.match(text, /^title_abstract_decision: "include"$/m);
  assert.match(text, /^extracted_design: "RCT"$/m);
  assert.match(text, /^notes: "typed in Obsidian"$/m);
  assert.match(text, /My own words\./);
  assert.doesNotMatch(text, /^(ta_|ft_|r2_|sample_|chart_|pdf_status|second_reviewer)/m);
  assert.doesNotMatch(await folder.readText("08 - Records/R0002 - 2020 - Doe - Paper R0002.md"), /^ta_decision:/m);
  assert.equal(hasShortNames({ ta_decision: "x" }), true);
  assert.deepEqual((await s.repo.reasons()).ta, ["E1 wrong"]);
  assert.match(await folder.readText("08 - Screening guide.md"), /^title_abstract_reasons:/m);
});
