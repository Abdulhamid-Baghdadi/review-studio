// The inclusion criteria: a list next to the exclusion reasons, kept in the screening guide, written into the
// protocol's eligibility section, and protected like the exclusion reasons once the protocol is locked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { protocolMarkdown } from "../../src/domain/protocol.js";

const open = folder => ReviewSession.open(folder, { clock: { today: () => "2026-10-20", now: () => "2026-10-20 10:00" },
  settings: { name: "Demo", recordsPath: "Demo records/08 - Records" } });

test("inclusion criteria are saved in the screening guide and written into the protocol", async () => {
  const folder = memoryFolder();
  const s = await open(folder);
  assert.deepEqual((await s.repo.reasons()).include, [], "a new review has no inclusion criteria yet");
  await s.saveReasons(["E1 Wrong topic"], ["E1 Wrong topic"], "", ["  Lithium-ion packs or modules ", "", "Journal article or conference paper"]);
  const reasons = await s.repo.reasons();
  assert.deepEqual(reasons.include, ["Lithium-ion packs or modules", "Journal article or conference paper"]);
  assert.match(await folder.readText("08 - Screening guide.md"), /inclusion_criteria:\n {2}- "?Lithium-ion packs or modules"?\n/);
  await s.saveReasons(["E1 Wrong topic", "E2 Not English"], ["E1 Wrong topic"]);         // no list given: the criteria stay
  assert.deepEqual((await s.repo.reasons()).include, ["Lithium-ion packs or modules", "Journal article or conference paper"]);
  const text = protocolMarkdown({ reviewName: "Demo", reviewLink: "[[Demo]]", st: s.st, ftReasons: reasons.ft, include: reasons.include, generatedBy: "test" });
  assert.match(text, /Include a paper if:\n- Lithium-ion packs or modules\n- Journal article or conference paper\n\nExclude a paper if \(the reasons used in screening\):\n- E1 Wrong topic/);
});

test("after locking, changing the inclusion criteria is an amendment", async () => {
  const s = await open(memoryFolder());
  await s.saveReasons(["E1 Wrong topic"], ["E1 Wrong topic"], "", ["Battery packs"]);
  await s.lockProtocol("");
  await assert.rejects(s.saveReasons(["E1 Wrong topic"], ["E1 Wrong topic"], "", ["Battery packs", "Any year"]), /inclusion and exclusion rules/);
  await s.saveReasons(["E1 Wrong topic"], ["E1 Wrong topic"], "older papers turned out to matter", ["Battery packs", "Any year"]);
  assert.equal(s.st.amendments.at(-1).what, "criteria");
  assert.deepEqual(await s.integrityProblems(), []);
});

test("a new review starts with 'E6 wrong population'; an older guide without its lists keeps the old codes", async () => {
  const fresh = await open(memoryFolder());
  assert.deepEqual((await fresh.repo.reasons()).ta.at(-1), "E6 wrong population");
  assert.deepEqual((await fresh.repo.reasons()).ft.at(-1), "E7 no usable content on the concept");
  // a guide written before the lists were stored in it: E6 there meant "no usable content", and still does
  const old = await open(memoryFolder({ "08 - Screening guide.md": "---\ntype: \"screening-guide\"\n---\n\n# Guide\n" }));
  assert.equal((await old.repo.reasons()).ft.at(-1), "E6 no usable content on the concept");
});
