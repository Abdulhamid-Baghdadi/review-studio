// The review package: one folder and ZIP with the review's evidence and a SHA-256 per file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { crc32, zip } from "../../src/domain/zip.js";

const deps = () => ({ clock: { today: () => "2026-10-12", now: () => "2026-10-12 10:00" }, settings: { name: "T", recordsPath: "T records/08 - Records", reviewer: "AB" } });
const ris = ["Repair scores", "Disassembly time"].map((t, i) => `TY  - JOUR\nTI  - ${t}\nPY  - 202${i}\nAB  - About ${t}.\nER  - `).join("\n") + "\n";

test("crc32 and zip follow the format", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const z = zip([{ path: "a/b.txt", bytes: new TextEncoder().encode("hi") }], { year: 2026, month: 10, day: 12 });
  const v = new DataView(z.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(v.getUint16(z.length - 12, true), 1);                       // one entry
});

test("the package holds the review's evidence and a checksum per file", async () => {
  const s = await ReviewSession.open(memoryFolder(), deps());
  await s.lockProtocol("OSF-1");
  await s.importSearch({ fileName: "a.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "q" });
  await s.decide("R0001", "ta", "include");
  await s.decide("R0002", "ta", "exclude", { reason: "E1" });
  const r = await s.reviewPackage();
  assert.equal(r.path, "07 - Exports/Review package 2026-10-12.zip");
  const dir = "07 - Exports/Review package 2026-10-12";
  const manifest = await s.repo.folder.readText(`${dir}/MANIFEST.md`);
  assert.match(manifest, /reported to PRISMA-ScR/);
  assert.match(manifest, /Decision log: 2 rows, chain intact/);
  for (const f of ["03 Screening/Screening decisions.csv", "03 Screening/08 - Decision log.csv", "02 Searches/07 - Searches.csv",
    "01 Protocol/05 - Protocol.md", "07 Report/14 - PRISMA flow.md", "07 Report/14 - PRISMA-ScR checklist.md", "08 AI use.md"]) {
    const bytes = await s.repo.folder.readBytes(`${dir}/${f}`);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.ok(manifest.includes(`| ${f} |`) && manifest.includes(hash), `${f} listed with its SHA-256`);
  }
  assert.match(await s.repo.folder.readText(`${dir}/03 Screening/Screening decisions.csv`), /R0002,Disassembly time,2021,,[^,]*,exclude,E1/);
  assert.ok((await s.repo.folder.readBytes(r.path)).length > 1000);
  assert.match(s.st.events.at(-1).text, /review package made: \d+ files, decision log 2 rows \(chain intact\)/);
});
