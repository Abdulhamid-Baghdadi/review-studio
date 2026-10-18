// End of a review: "Add kept papers to library" and "Sync with the library". Found in a test in the real app: after
// adding, the sync wanted to add the review to `included_in` again (the library in memory was stale), and an
// `included_in` typed as text ("[[Other review]]") was split into single letters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { openLibrary } from "../../src/services/library.js";
import { ReviewSession } from "../../src/services/review-session.js";

const EX = new URL("../../web/example/", import.meta.url);
const ex = JSON.parse(readFileSync(new URL("example-review.json", EX), "utf8"));
const template = readFileSync(new URL("../templates/Publication Template.md", EX), "utf8");

test("add kept papers, then sync: nothing left to do, and a typed included_in stays whole", async () => {
  const lib = memoryFolder({
    "001 - 2019 - Pereira et al. - Efficacy.md": `---\ntype: publication\nindex: 1\ntitle: "Efficacy of the 'Stand and Move at Work' Multicomponent Workplace Intervention"\nyear: 2019\ndoi: "10.1186/s12966-020-01033-3"\nincluded_in: "[[Other review]]"\n---\n\n# Mine\n`,
  });
  const pdfs = Object.fromEntries(Object.entries(ex.linked).map(([p, file]) => [p, new Uint8Array(readFileSync(new URL(file, EX)))]));
  const s = await ReviewSession.open(memoryFolder({ ...ex.files, ...pdfs }), { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" },
    settings: { name: "Example review", recordsPath: "Example review records/08 - Records" }, library: await openLibrary(lib) });

  assert.match(await s.addToLibrary(template), /7 added, 1 already in library/);
  const pereira = await lib.readText("001 - 2019 - Pereira et al. - Efficacy.md");
  assert.match(pereira, /included_in:\n  - "\[\[Other review\]\]"\n  - "\[\[Example review\]\]"/, "the typed link is kept as one item");
  assert.equal((await lib.list("PDFs")).length, 7, "Edwardson 2022 has no PDF in the example");

  const plan = await s.sync(false);
  assert.deepEqual(plan.changes.filter(c => c.key === "included_in"), [], "the papers just added already list the review");
  await s.sync(true);
  assert.equal((await s.sync(false)).changes.length, 0, "after a sync, nothing is left to do");
});

const VAULT_TEMPLATE = `---
pdf:
status:
  - unread
importance: 3
reason_for_importance: []
category:
  -
type: publication
publication_type: ""
index:
authors:
year:
title:
journal:
doi:
url:
tags:
  -
---

# {{title}}

## Summary

## Abstract

## Keywords

## Why is this paper important?
`;

test("export with the vault's own template: its properties and sections, plus added_by and added_on; PDFs to the chosen folder", async () => {
  const lib = memoryFolder({}), pdfFolder = memoryFolder({});
  const library = { ...(await openLibrary(lib)), pdfFolder };
  const pdfs = Object.fromEntries(Object.entries(ex.linked).map(([p, file]) => [p, new Uint8Array(readFileSync(new URL(file, EX)))]));
  const s = await ReviewSession.open(memoryFolder({ ...ex.files, ...pdfs }), { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" },
    settings: { name: "Example review", recordsPath: "Example review records/08 - Records" }, library,
    openalex: { get: async () => ({ results: [] }) } });
  assert.match(await s.exportToLibrary(VAULT_TEMPLATE, { status: "quick review" }), /8 added.*Citations: 0 links/);
  const name = (await lib.list("")).find(n => n.includes("Pereira"));
  const note = await lib.readText(name);
  assert.match(note, /^status:\n  - "quick review"$/m, "the status from Review settings, as a list like the template's");
  assert.match(note, /^importance: 3$/m);
  assert.match(note, /^added_by: "\[\[Example review\]\]"\nadded_on: "2026-10-17"$/m, "added_by is the review, as a link");
  assert.match(note, /^openalex: "W3094821849"\ncitekey: "pereira2019"\nurl: "https:\/\/doi\.org\/10\.1186\/s12966-020-01033-3"\ntags: \[\]$/m,
    "the record's OpenAlex id and a citation key in the library's style, after doi as in the library schema");
  assert.match(note, /^publication_type: ""$/m, "the record has no type: the template's empty value stays");
  assert.match(note, /^added_on: "2026-10-17"\ncites: \[\]$/m, "cites is the last property, after added_by and added_on");
  assert.match(note, /## Summary\n\n## Abstract\n\nBACKGROUND:[^\n]*\n\n## Keywords\n\n## Why is this paper important\?/);
  assert.doesNotMatch(note, /Notes from Example review/, "no empty section from the record");
  assert.equal((await pdfFolder.list("")).length, 7);
  assert.equal((await lib.list("")).includes("PDFs"), false);
});
