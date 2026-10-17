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
