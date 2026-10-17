// The decision log: every change of a screening decision gets a chained row with who and how; changes
// made outside the app are found on reopening; an edited row breaks the chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { DECISION_LOG_FILE, HOW } from "../../src/domain/decision-log.js";

let minute = 0;
const deps = (reviewer = "AB") => ({ clock: { today: () => "2026-10-12", now: () => `2026-10-12 10:${String(minute++).padStart(2, "0")}` },
  settings: { name: "T", recordsPath: "T records/08 - Records", reviewer } });
const ris = ["Repair scores", "Disassembly time", "Module design"]
  .map((t, i) => `TY  - JOUR\nTI  - ${t}\nAU  - Liu, Z.\nPY  - 202${i}\nAB  - Abstract of ${t}.\nER  - `).join("\n") + "\n";

async function review(folder = memoryFolder()) {
  const s = await ReviewSession.open(folder, deps());
  await s.lockProtocol("OSF-1");
  await s.importSearch({ fileName: "a.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "q" });
  return s;
}

test("each decision and each change of mind is a row with the reviewer's initials", async () => {
  const s = await review();
  await s.decide("R0001", "ta", "include");
  await s.decide("R0001", "ta", "exclude", { reason: "E1" });
  await s.decide("R0002", "ta", "unsure");
  const h = await s.repo.decisionLog.history("R0001");
  assert.deepEqual(h.map(r => [r.stage, r.from, r.to, r.reason, r.by, r.how]), [
    ["title/abstract", "pending", "include", "", "AB", HOW.hand],
    ["title/abstract", "include", "exclude", "E1", "AB", HOW.hand],
  ]);
  assert.equal((await s.repo.decisionLog.read()).length, 3);
  assert.deepEqual(await s.repo.decisionLog.verify(), { rows: 3, intact: true, brokenAt: "", last: (await s.repo.decisionLog.read())[2].hash });
});

test("a decision changed in Obsidian is found when the review is opened again", async () => {
  const s = await review();
  await s.decide("R0003", "ta", "include");
  const file = s.repo.records.get("R0003").file;
  await s.repo.folder.writeText(file, (await s.repo.folder.readText(file)).replace(`title_abstract_decision: "include"`, `title_abstract_decision: "exclude"`));
  const again = await ReviewSession.open(s.repo.folder, deps());
  const last = (await again.repo.decisionLog.history("R0003")).at(-1);
  assert.deepEqual([last.from, last.to, last.by, last.how], ["include", "exclude", "", HOW.outside]);
});

test("a review without a log starts it with the decisions it already has", async () => {
  const s = await review();
  await s.decide("R0001", "ta", "include");
  await s.repo.folder.writeText(DECISION_LOG_FILE, "");          // as if the review was made before the log existed
  const folder = memoryFolder();
  for (const f of await s.repo.folder.list("08 - Records")) await folder.writeText(`08 - Records/${f}`, await s.repo.folder.readText(`08 - Records/${f}`));
  const again = await ReviewSession.open(folder, deps());
  const rows = await again.repo.decisionLog.read();
  assert.deepEqual(rows.map(r => [r.record_id, r.to, r.how]), [["R0001", "include", HOW.baseline]]);
});

test("editing a row breaks the chain from that row on", async () => {
  const s = await review();
  for (const id of ["R0001", "R0002", "R0003"]) await s.decide(id, "ta", "include");
  const text = await s.repo.folder.readText(DECISION_LOG_FILE);
  await s.repo.folder.writeText(DECISION_LOG_FILE, text.replace(/(\r\n2,[^,]*,R0002,title\/abstract,pending,)include/, "$1exclude"));
  const v = await s.repo.decisionLog.verify();
  assert.equal(v.intact, false);
  assert.equal(v.brokenAt, "2");
});
