// Citations between library papers (moved from Library Studio): `cites` / `cited_by` from OpenAlex reference
// lists, the cited works outside the library as plain ids, nothing else in the notes touched, and a preview first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { citationGraph, withCitations, withUnlinked } from "../../src/domain/library-citations.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { openLibrary } from "../../src/services/library.js";
import { ReviewSession } from "../../src/services/review-session.js";

const note = (doi, extra = "", eol = "\n") => [
  "---", "type: publication", `doi: ${doi}`, "category:", '  - "[[01- Foundations]]"', "---", "", "# Title", "", "## Summary", "", "My own words.", extra].join(eol) + eol;

const WORKS = {
  "10.1/a": { id: "https://openalex.org/W1", doi: "https://doi.org/10.1/A", referenced_works: ["https://openalex.org/W2", "https://openalex.org/W9"] },
  "10.1/b": { id: "https://openalex.org/W2", doi: "https://doi.org/10.1/b", referenced_works: ["https://openalex.org/W8"] },
};
const fakeOpenalex = () => {
  const calls = [];
  return { calls, get: async (path, params) => {
    calls.push(params.filter);
    const dois = params.filter.replace(/^doi:/, "").split("|");
    return { results: dois.map(d => WORKS[d]).filter(Boolean) };
  } };
};

test("the graph: links inside the library, works outside as plain ids", () => {
  const dois = new Map([["001 A", "10.1/a"], ["002 B", "10.1/b"], ["003 C", ""]]);
  const works = new Map([["10.1/a", { id: "https://openalex.org/W1", referenced: ["https://openalex.org/W2", "https://openalex.org/W9", "https://openalex.org/W7"] }],
    ["10.1/b", { id: "https://openalex.org/W2", referenced: [] }]]);
  const g = citationGraph(dois, works, new Map([["003 C", ["001 A"]]]), new Set(["W7"]));
  assert.deepEqual(g.refs.get("001 A"), ["002 B"]);
  assert.deepEqual(g.cited.get("002 B"), ["001 A"]);
  assert.deepEqual(g.cited.get("001 A"), ["003 C"], "references read from a PDF count in cited_by");
  assert.deepEqual(g.external.get("001 A"), ["W9"], "W7 is a library paper known by title, not unlinked");
  assert.equal(g.refs.has("003 C"), false);
});

test("only the generated parts change; line endings and the rest of the note stay", () => {
  const text = note("10.1/a", "", "\r\n").replace("type: publication", "type: publication\r\nreferences:\r\n  - \"[[old]]\"");
  const next = withUnlinked(withCitations(text, ["002 B"], []), ["W9", "W10"]);
  assert.match(next, /^cites:\r\n  - "\[\[002 B\]\]"\r\ncited_by: \[\]\r\ncategory:/m, "before category, as Library Studio writes them");
  assert.doesNotMatch(next, /^references:/m, "the retired property is removed");
  assert.match(next, /My own words\.\r\n\r\n<!-- library-studio:unlinked-cites:start -->\r\n\r\n## Unlinked cited works\r\n\r\nOpenAlex works cited outside this library: W9; W10\.\r\n\r\n<!-- library-studio:unlinked-cites:end -->\r\n$/);
  assert.equal(withUnlinked(withCitations(next, ["002 B"], []), ["W9", "W10"]), next, "running it again changes nothing");
  assert.doesNotMatch(next, /(?<!\r)\n/, "no bare LF in a CRLF note");
});

test("from the Report page: a preview first, then the notes are written; a second run finds nothing to do", async () => {
  const lib = memoryFolder({ "001 - A.md": note("10.1/A"), "002 - B.md": note("10.1/b"), "003 - C.md": note("") });
  const library = await openLibrary(lib);
  const openalex = fakeOpenalex();
  const s = await ReviewSession.open(memoryFolder(), { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" },
    settings: { name: "R", recordsPath: "R records/08 - Records" }, library, openalex });
  const before = await lib.readText("001 - A.md");
  const preview = await s.libraryCitations();
  assert.deepEqual([preview.publications, preview.found, preview.links, preview.changed, preview.written], [3, 2, 1, 3, 0]);
  assert.equal(await lib.readText("001 - A.md"), before, "the preview writes nothing");
  const done = await s.libraryCitations({ apply: true });
  assert.equal(done.written, 3);
  assert.equal(openalex.calls.length, 1, "writing reuses the reference lists of the preview");
  assert.match(await lib.readText("001 - A.md"), /^cites:\n  - "\[\[002 - B\]\]"\ncited_by: \[\]/m);
  assert.match(await lib.readText("002 - B.md"), /^cited_by:\n  - "\[\[001 - A\]\]"/m);
  assert.match(await lib.readText("001 - A.md"), /OpenAlex works cited outside this library: W9\./);
  assert.match(await lib.readText("001 - A.md"), /## Summary\n\nMy own words\./);
  assert.equal((await s.libraryCitations()).changed, 0);
});
