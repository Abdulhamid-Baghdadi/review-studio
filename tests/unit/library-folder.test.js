// The command-line tools find the publication library below the vault: "00 - Library/Publication Summary" first,
// then the older layouts ("00 - Library" itself, "98 - Publications").
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findLibraryFolder } from "../../bin/library-folder.js";

test("the library folder: Publication Summary first, then the older layouts, else none", t => {
  const root = mkdtempSync(join(tmpdir(), "library-folder-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(findLibraryFolder(root), "", "no library");
  mkdirSync(join(root, "98 - Publications"));
  assert.equal(findLibraryFolder(root), join(root, "98 - Publications"));
  mkdirSync(join(root, "00 - Library"));
  assert.equal(findLibraryFolder(root), join(root, "00 - Library"), "notes directly in 00 - Library");
  mkdirSync(join(root, "00 - Library", "Publication Summary"));
  assert.equal(findLibraryFolder(root), join(root, "00 - Library", "Publication Summary"), "the vault's current layout");
});
