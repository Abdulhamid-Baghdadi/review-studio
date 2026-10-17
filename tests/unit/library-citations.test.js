// Citations of library papers (moved from Library Studio): `cites` / `cited_by` from OpenAlex reference lists,
// cited works outside the library as DOIs in `cites` (links once they join the library), nothing else in the
// notes touched, and a preview first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { citationGraph, UNLINKED, withCitations, withoutUnlinked } from "../../src/domain/library-citations.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { openLibrary } from "../../src/services/library.js";
import { ReviewSession } from "../../src/services/review-session.js";

const note = (doi, extra = "", eol = "\n") => [
  "---", "type: publication", `doi: ${doi}`, "category:", '  - "[[01- Foundations]]"', "---", "", "# Title", "", "## Summary", "", "My own words.", extra].join(eol) + eol;

const WORKS = {
  "10.1/a": { id: "https://openalex.org/W1", doi: "https://doi.org/10.1/A", referenced_works: ["https://openalex.org/W2", "https://openalex.org/W9", "https://openalex.org/W8"] },
  "10.1/b": { id: "https://openalex.org/W2", doi: "https://doi.org/10.1/b", referenced_works: ["https://openalex.org/W8"] },
};
const CITED = { W8: { id: "https://openalex.org/W8", doi: "https://doi.org/10.9/Outside" }, W9: { id: "https://openalex.org/W9", doi: null } };
const fakeOpenalex = (works = WORKS) => {
  const calls = [];
  return { calls, get: async (path, params) => {
    calls.push(params.filter);
    const kind = params.filter.split(":")[0];
    const keys = params.filter.slice(kind.length + 1).split("|");
    return { results: keys.map(k => (kind === "doi" ? works[k] : CITED[k])).filter(Boolean) };
  } };
};

test("the graph: links inside the library; outside works by DOI, else by OpenAlex id", () => {
  const dois = new Map([["001 A", "10.1/a"], ["002 B", "10.1/b"], ["003 C", ""], ["004 D", "10.9/d"]]);
  const works = new Map([["10.1/a", { id: "https://openalex.org/W1", referenced: ["https://openalex.org/W2", "https://openalex.org/W9", "https://openalex.org/W7", "https://openalex.org/W8", "https://openalex.org/W6", "https://openalex.org/W5"] }],
    ["10.1/b", { id: "https://openalex.org/W2", referenced: [] }]]);
  const refDois = new Map([["W9", ""], ["W8", "10.9/outside"], ["W6", "10.9/d"], ["W5", ""]]);
  const g = citationGraph(dois, works, new Map([["003 C", ["001 A"]]]), { idStems: new Map([["W5", "003 C"]]), ids: new Set(["W7"]), refDois });
  assert.deepEqual(g.refs.get("001 A"), ["002 B", "003 C", "004 D"], "by OpenAlex id, by the notes' openalex property, and by DOI");
  assert.deepEqual(g.external.get("001 A"), ["10.9/outside", "W9"], "a DOI when the work has one, else its id; W7 (known by title) left out");
  assert.deepEqual(g.cited.get("002 B"), ["001 A"]);
  assert.deepEqual(g.cited.get("001 A"), ["003 C"], "references read from a PDF count in cited_by");
  assert.equal(g.refs.has("003 C"), false);
});

test("only the generated parts change; line endings and the rest of the note stay", () => {
  const unlinked = `\r\n\r\n${UNLINKED[0]}\r\n\r\n## Unlinked cited works\r\n\r\nOpenAlex works cited outside this library: W9.\r\n\r\n${UNLINKED[1]}`;
  const text = note("10.1/a", unlinked, "\r\n").replace("type: publication", "type: publication\r\nreferences:\r\n  - \"[[old]]\"");
  const next = withoutUnlinked(withCitations(text, ["002 B"], [], ["10.9/outside", "W9"]));
  assert.match(next, /^cites:\r\n  - "\[\[002 B\]\]"\r\n  - "10\.9\/outside"\r\n  - "W9"\r\ncited_by: \[\]\r\ncategory:/m, "links first, then DOIs and ids, before category");
  assert.doesNotMatch(next, /^references:/m, "the retired property is removed");
  assert.doesNotMatch(next, /Unlinked cited works/, "the old section is gone: those works are in cites");
  assert.match(next, /My own words\.\r\n$/);
  assert.equal(withoutUnlinked(withCitations(next, ["002 B"], [], ["10.9/outside", "W9"])), next, "running it again changes nothing");
  assert.doesNotMatch(next, /(?<!\r)\n/, "no bare LF in a CRLF note");
});

test("from the Report page: a preview first, then the notes are written; a DOI becomes a link once that paper is added", async () => {
  const lib = memoryFolder({ "001 - A.md": note("10.1/A"), "002 - B.md": note("10.1/b"), "003 - C.md": note("") });
  const library = await openLibrary(lib);
  const openalex = fakeOpenalex();
  const s = await ReviewSession.open(memoryFolder(), { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" },
    settings: { name: "R", recordsPath: "R records/08 - Records" }, library, openalex });
  const before = await lib.readText("001 - A.md");
  const preview = await s.libraryCitations();
  assert.deepEqual([preview.publications, preview.found, preview.links, preview.outside, preview.changed, preview.written], [3, 2, 1, 3, 3, 0]);
  assert.equal(await lib.readText("001 - A.md"), before, "the preview writes nothing");
  const done = await s.libraryCitations({ apply: true });
  assert.equal(done.written, 3);
  assert.equal(openalex.calls.length, 2, "the library's papers, then the cited works' DOIs; writing reuses the preview's");
  assert.match(await lib.readText("001 - A.md"), /^cites:\n  - "\[\[002 - B\]\]"\n  - "10\.9\/outside"\n  - "W9"\ncited_by: \[\]/m);
  assert.match(await lib.readText("002 - B.md"), /^cites:\n  - "10\.9\/outside"\ncited_by:\n  - "\[\[001 - A\]\]"/m);
  assert.match(await lib.readText("001 - A.md"), /## Summary\n\nMy own words\.\n$/);
  assert.equal((await s.libraryCitations()).changed, 0);

  // the cited work joins the library: the next update turns its DOI into a link, in both papers
  await lib.writeText("004 - Outside.md", note("10.9/outside"));
  const s2 = await ReviewSession.open(memoryFolder(), { clock: { today: () => "2026-10-18", now: () => "2026-10-18 12:00" },
    settings: { name: "R", recordsPath: "R records/08 - Records" }, library: await openLibrary(lib),
    openalex: fakeOpenalex({ ...WORKS, "10.9/outside": { id: "https://openalex.org/W8", doi: "https://doi.org/10.9/outside", referenced_works: [] } }) });
  await s2.libraryCitations({ apply: true });
  assert.match(await lib.readText("001 - A.md"), /^cites:\n  - "\[\[002 - B\]\]"\n  - "\[\[004 - Outside\]\]"\n  - "W9"\n/m);
  assert.match(await lib.readText("004 - Outside.md"), /^cited_by:\n  - "\[\[001 - A\]\]"\n  - "\[\[002 - B\]\]"/m);
});
