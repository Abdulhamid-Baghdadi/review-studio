// The Obsidian .base files find the review's records wherever the review folder sits: inside a larger vault, or
// opened as a vault of its own (a saved copy of the example). Older files that filtered on the path from the
// vault root are upgraded when the review opens; a .base without that line (edited by hand) is left alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECORD_FILTERS, screeningBase, upgradeBase } from "../../src/domain/notes.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";

const OLD = `views:
  - type: table
    name: Included
    filters:
      and:
        - file.inFolder("My review records/08 - Records")
        - type == "review-record"
        - ft_decision == "include"
`;

test("the screening base does not depend on where the vault starts", () => {
  const base = screeningBase();
  assert.doesNotMatch(base, /records\/08 - Records/);
  for (const f of RECORD_FILTERS) assert.ok(base.includes(`        - ${f}\n`));
  assert.match(base, /name: Second-reviewer sample[\s\S]*?sample_ta == true/);
});

test("older generated bases are upgraded; hand-edited ones are left alone", async () => {
  const up = upgradeBase(OLD, "My review records/08 - Records");
  assert.doesNotMatch(up, /file\.inFolder\("My review/);
  assert.match(up, /file\.folder\.endsWith\("08 - Records"\)\n[\s\S]*ft_decision == "include"/);
  assert.equal(upgradeBase("views: []\n", "My review records/08 - Records"), null);

  const folder = memoryFolder({ "08 - Screening.base": OLD, "12 - Charting.base": OLD });
  await ReviewSession.open(folder, { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" },
    settings: { name: "My review", recordsPath: "My review records/08 - Records" } });
  for (const f of ["08 - Screening.base", "12 - Charting.base"]) assert.match(await folder.readText(f), /file\.folder\.endsWith/);
});
