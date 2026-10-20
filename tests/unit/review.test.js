// Rules and use cases of the records module, on an in-memory review folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flowCounts } from "../../src/domain/flow.js";
import { formatFixed, formatPercent } from "../../src/domain/text-rules.js";
import { createRecord, mergeDuplicate, nextRecordId, recordText } from "../../src/domain/records.js";
import { checkRecord, isValidReason } from "../../src/domain/screening.js";
import { makeEntry } from "../../src/domain/importers.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewRepository } from "../../src/services/review-repository.js";
import * as commands from "../../src/services/review-commands.js";

const clock = { today: () => "2026-01-15", now: () => "2026-01-15 10:00" };
const settings = { name: "Test review", recordsPath: "Test review records/08 - Records" };
const entry = (title, more = {}) => makeEntry({ title, authors: "Liu, Z.", year: "2024", ...more });

test("number formatting rounds half to even", () => {
  assert.equal(formatFixed(0.125, 2), "0.12");
  assert.equal(formatFixed(0.375, 2), "0.38");
  assert.equal(formatFixed(2.5, 0), "2");
  assert.equal(formatFixed(-0, 2), "-0.00");
  assert.equal(formatPercent(0.05), "5%");
});

test("records: ids, creation from the template, merging duplicates", () => {
  assert.equal(nextRecordId(new Set()), "R0001");
  assert.equal(nextRecordId(new Set(["R0001", "R0003"])), "R0004");
  const template = "---\ntype: \"\"\ncustom: x\n---\n\n# {{title}}\n\n## Abstract\n\n{{abstract}}\n\n## Keywords\n\n{{keywords}}\n";
  const r = createRecord({ id: "R0001", entry: entry("Module $& partition", { doi: "10.1/x", keywords: "k" }), reviewLink: "[[T]]", sourceId: "S01", publication: "001 - Paper", template });
  const note = recordText(r).split("---")[1];                                   // as written: full words, shared properties first
  assert.match(note, /^\ntype: "review-record"\nreview: "\[\[T\]\]"\nrecord_id: "R0001"\ntitle: /);
  assert.match(note, /title_abstract_decision: "pending"/);
  assert.match(note, /\ncustom: "x"\n$/, "a property of the template the app does not know is kept, at the end");
  assert.doesNotMatch(note, /second_reviewer|ta_decision|sample_ta/, "no short names; empty second-reviewer fields are left out");
  assert.equal(r.props.url, "https://doi.org/10.1/x");
  assert.equal(r.props.publication, "[[001 - Paper]]");
  assert.match(r.body, /# Module \$& partition/);
  assert.match(r.body, /_\(no abstract in the export\)_/);
  assert.equal(r.file, "08 - Records/R0001 - 2024 - Liu - Module $& partition.md");
  const m = mergeDuplicate(r, entry("Module partition", { abstract: "Now with abstract", journal: "J" }), "S02");
  assert.deepEqual(m.props.sources, ["S01", "S02"]);
  assert.equal(m.props.journal, "J");
  assert.match(m.body, /Now with abstract/);
  assert.deepEqual(r.props.sources, ["S01"], "merge does not change its input");
});

test("screening check: normalises, fills the full-text stage and the date, reports problems", () => {
  const reasons = { ta: ["E1 wrong concept"], ft: ["E1 wrong concept", "E6 no content"] };
  const a = checkRecord({ ta_decision: " Include ", ft_decision: "" }, reasons, "2026-01-15");
  assert.equal(a.props.ta_decision, "include");
  assert.equal(a.props.ft_decision, "pending");
  assert.equal(a.props.screened_on, "2026-01-15");
  assert.equal(a.changed, true);
  const b = checkRecord({ ta_decision: "exclude", ta_reason: "E9", ft_decision: "pending", screened_on: "x" }, reasons, "d");
  assert.equal(b.props.ft_decision, "");
  assert.deepEqual(b.problems, ["excluded at title/abstract without a reason from the Screening guide"]);
  assert.equal(isValidReason("E1", reasons.ta), true);
  assert.equal(isValidReason("", reasons.ta), false);
  assert.equal(checkRecord({ ta_decision: "pending", ft_decision: "" }, reasons, "d").changed, false);
});

test("flow counts", () => {
  const counts = flowCounts(
    [{ ta_decision: "include", ft_decision: "include" }, { ta_decision: "exclude", ta_reason: "E1" }, { ta_decision: "unsure", ft_decision: "pending", pdf_status: "not-retrieved" }],
    [{ kind: "database", records: "4" }, { kind: "other", records: "1" }]);
  assert.deepEqual([counts.unique, counts.duplicates, counts.sought, counts.notRetrieved, counts.included, counts.ftPending], [3, 2, 2, 1, 1, 0]);
  assert.deepEqual(counts.taReasons, [["E1", 1]]);
});

test("use cases on an in-memory review: import, check, report", async () => {
  const folder = memoryFolder();
  const open = () => ReviewRepository.open(folder, clock, settings);
  const ris = ["A method for module identification in printed circuit boards", "Product architecture and modularity in consumer electronics", "Design structure matrices for electronic products"]
    .map((t, i) => `TY  - JOUR\nTI  - ${t}\nAU  - Liu, Z.\nPY  - 202${i}\nDO  - 10.1/${i}\nER  - `).join("\n") + "\n";
  const msg = await commands.importSearch(await open(), { fileName: "s.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "q" });
  assert.match(msg, /S01 Scopus: 3 records -> 3 new, 0 duplicates/);
  assert.ok(await folder.exists("07 - Exports/S01 - s.ris"));
  assert.ok(await folder.exists("08 - Screening guide.md"));
  assert.ok(await folder.exists("14 - PRISMA flow.md"));

  const again = await commands.importSearch(await open(), { fileName: "w.ris", bytes: new TextEncoder().encode(ris), database: "WoS", query: "q" });
  assert.match(again, /3 records -> 0 new, 3 duplicates/);
  const repo = await open();
  assert.deepEqual([...repo.records.values()].map(r => r.props.sources), [["S01", "S02"], ["S01", "S02"], ["S01", "S02"]]);

  const flow = await folder.readText("14 - PRISMA flow.md");
  assert.match(flow, /\| Records identified — databases \| 6 \|/);
  assert.match(flow, /\| Duplicates removed \| 3 \|/);
  assert.doesNotMatch(flow, /second reviewer|test set/i, "no second-reviewer or test-set sections any more");
});
