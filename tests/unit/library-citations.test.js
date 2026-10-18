// Citations of library papers (moved from Library Studio): `cites` from OpenAlex reference lists (no cited_by),
// cited works outside the library as DOIs in `cites` (links once they join the library), nothing else in the
// notes touched, and a preview first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { citationGraph, relinkCites, UNLINKED, withCitations, withoutUnlinked } from "../../src/domain/library-citations.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { openLibrary } from "../../src/services/library.js";
import { fetchLibraryWorks, planLibraryCitations, planRelinkCitations, writeLibraryCitations } from "../../src/services/library-citations.js";
import { allWorks } from "../../src/services/openalex-client.js";
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
  const text = note("10.1/a", unlinked, "\r\n").replace("type: publication", "type: publication\r\nreferences:\r\n  - \"[[old]]\"\r\ncited_by:\r\n  - \"[[old]]\"");
  const next = withoutUnlinked(withCitations(text, ["002 B"], [], ["10.9/outside", "W9"]));
  assert.match(next, /^category:\r\n  - "\[\[01- Foundations\]\]"\r\ncites:\r\n  - "\[\[002 B\]\]"\r\n  - "10\.9\/outside"\r\n  - "W9"\r\n---/m, "links first, then DOIs and ids; cites is the last property");
  assert.doesNotMatch(next, /^(references|cited_by):/m, "the retired properties are removed");
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
  assert.deepEqual([preview.publications, preview.found, preview.links, preview.outside, preview.changed, preview.written], [3, 2, 1, 3, 2, 0], "003 - C has no DOI: not found, so not changed");
  assert.equal(await lib.readText("001 - A.md"), before, "the preview writes nothing");
  const done = await s.libraryCitations({ apply: true });
  assert.equal(done.written, 2);
  assert.equal(await lib.readText("003 - C.md"), note(""), "a note OpenAlex did not return stays as it was");
  assert.equal(openalex.calls.length, 2, "the library's papers, then the cited works' DOIs; writing reuses the preview's");
  assert.match(await lib.readText("001 - A.md"), /^cites:\n  - "\[\[002 - B\]\]"\n  - "10\.9\/outside"\n  - "W9"\n---$/m, "a new cites goes last");
  assert.match(await lib.readText("002 - B.md"), /^cites:\n  - "10\.9\/outside"\n---$/m);
  assert.doesNotMatch(await lib.readText("002 - B.md"), /^cited_by:/m, "no cited_by");
  assert.match(await lib.readText("001 - A.md"), /## Summary\n\nMy own words\.\n$/);
  assert.equal((await s.libraryCitations()).changed, 0);

  // the cited work joins the library: the next update turns its DOI into a link
  await lib.writeText("004 - Outside.md", note("10.9/outside"));
  const s2 = await ReviewSession.open(memoryFolder(), { clock: { today: () => "2026-10-18", now: () => "2026-10-18 12:00" },
    settings: { name: "R", recordsPath: "R records/08 - Records" }, library: await openLibrary(lib),
    openalex: fakeOpenalex({ ...WORKS, "10.9/outside": { id: "https://openalex.org/W8", doi: "https://doi.org/10.9/outside", referenced_works: [] } }) });
  await s2.libraryCitations({ apply: true });
  assert.match(await lib.readText("001 - A.md"), /^cites:\n  - "\[\[002 - B\]\]"\n  - "\[\[004 - Outside\]\]"\n  - "W9"\n/m);
});

test("a note OpenAlex does not return keeps its cites, also when OpenAlex answers with nothing at all", async () => {
  const kept = note("10.1/unknown", "").replace("category:", 'cites:\n  - "[[002 - B]]"\n  - "10.9/outside"\ncategory:') + ["", UNLINKED[0], "W5", UNLINKED[1], ""].join("\n");
  const lib = memoryFolder({ "001 - A.md": kept, "002 - B.md": note("10.1/b") });
  const open = async openalex => ReviewSession.open(memoryFolder(), { clock: { today: () => "2026-10-17", now: () => "2026-10-17 12:00" },
    settings: { name: "R", recordsPath: "R records/08 - Records" }, library: await openLibrary(lib), openalex });
  const silent = await open({ get: async () => ({ results: [] }) });
  const none = await silent.libraryCitations({ apply: true });
  assert.deepEqual([none.found, none.written], [0, 0], "nothing found, nothing written");
  assert.equal(await lib.readText("001 - A.md"), kept);
  await (await open(fakeOpenalex())).libraryCitations({ apply: true });
  assert.equal(await lib.readText("001 - A.md"), kept, "only 002 - B is found; 001 - A is untouched, its Unlinked block too");
  assert.match(await lib.readText("002 - B.md"), /^cites:\n  - "10\.9\/outside"\n---$/m);
});

test("a note OpenAlex holds without any references keeps the cites read from its PDF", async () => {
  const kept = note("10.1/empty").replace("category:", 'cites:\n  - "[[002 - B]]"\n  - "Baker, M. (1989) Marketing."\ncategory:');
  const library = await openLibrary(memoryFolder({ "001 - A.md": kept, "002 - B.md": note("10.1/b") }));
  const works = { ...WORKS, "10.1/empty": { id: "https://openalex.org/W40", doi: "https://doi.org/10.1/empty", referenced_works: [] } };
  const { changes } = await planLibraryCitations(library, await fetchLibraryWorks(library, fakeOpenalex(works)));
  assert.equal(changes.find(c => c.stem === "001 - A"), undefined, "an empty reference list from OpenAlex never empties cites");
});

/** Answers like OpenAlex: `count` matching works, `per-page` of them per page. */
const pagedOpenalex = all => {
  const calls = [];
  return { calls, get: async (path, params) => {
    calls.push(params);
    const keys = new Set(params.filter.replace(/^doi:/, "").split("|"));
    const hits = all.filter(w => keys.has(w.doi.replace("https://doi.org/", "")));
    const per = params["per-page"] ?? 25, page = params.page ?? 1;
    return { meta: { count: hits.length }, results: hits.slice((page - 1) * per, page * per) };
  } };
};

test("a batch of 50 DOIs that matches 51 works (one DOI, two works) loses none of them", async () => {
  const all = Array.from({ length: 50 }, (_, i) => ({ id: `https://openalex.org/W${i}`, doi: `https://doi.org/10.1/${i}`, referenced_works: [`https://openalex.org/W${100 + i}`] }));
  const lib = memoryFolder(Object.fromEntries(all.map((w, i) => [`${String(i).padStart(3, "0")} - P.md`, note(`10.1/${i}`)])));
  all.splice(1, 0, { id: "https://openalex.org/W999", doi: "https://doi.org/10.1/0", referenced_works: ["https://openalex.org/W500"] });   // second work for 10.1/0, early in the answer
  const openalex = pagedOpenalex(all);
  const { works } = await fetchLibraryWorks(await openLibrary(lib), openalex);
  assert.equal(works.size, 50, "every library DOI found, also 10.1/49, the 51st work of the answer");
  assert.deepEqual(works.get("10.1/0"), { id: "https://openalex.org/W0", referenced: ["https://openalex.org/W100", "https://openalex.org/W500"] },
    "the first work keeps its id and gets the references of both");
  assert.equal(openalex.calls.filter(c => c.filter.startsWith("doi:")).length, 1, "still one request for the batch");
});

test("relink: DOIs and OpenAlex ids of library papers become links; everything else stays, in its order", () => {
  const known = { stemOfDoi: new Map([["10.9/new", "009 - New"], ["10.1/self", "001 - A"]]), stemOfId: new Map([["W9", "010 - Id"]]) };
  const r = relinkCites(["[[002 - B]]", "10.9/z", "https://doi.org/10.9/NEW", "Baker, M. (1989) Marketing.", "W9", "10.1/self", "W8"], "001 - A", known);
  assert.deepEqual(r.links, ["002 - B", "009 - New", "010 - Id"], "sorted as the OpenAlex update sorts them");
  assert.deepEqual(r.plain, ["10.9/z", "Baker, M. (1989) Marketing.", "10.1/self", "W8"], "outside works and reference texts keep their order; a note never links itself");
  assert.deepEqual(r.linked, ["https://doi.org/10.9/NEW", "W9"]);
  assert.equal(relinkCites(["[[002 - B]]", "10.9/z"], "001 - A", known), null, "nothing to link: null");
  assert.deepEqual(relinkCites(["[[009 - New]]", "10.9/new"], "001 - A", known).links, ["009 - New"], "a DOI of a paper already linked just goes");
});

test("relink after adding papers: offline, only cites changes, and running it again changes nothing", async () => {
  const a = note("10.1/a", "", "\n").replace("category:", 'cites:\n  - "[[002 - B]]"\n  - "10.9/outside"\n  - "W9"\n  - "10.9/twice"\ncategory:');
  const lib = memoryFolder({ "001 - A.md": a, "002 - B.md": note("10.1/b"),
    "004 - Outside.md": note("https://doi.org/10.9/Outside"), "005 - Id.md": note("").replace("type: publication", "type: publication\nopenalex: W9"),
    "006 - Twice.md": note("10.9/twice"), "007 - Twice too.md": note("10.9/twice") });
  const changes = await planRelinkCitations(await openLibrary(lib));
  assert.deepEqual(changes.map(c => [c.stem, c.linked]), [["001 - A", ["10.9/outside", "W9"]]]);
  await writeLibraryCitations(await openLibrary(lib), changes);
  assert.equal(await lib.readText("001 - A.md"), a.replace('cites:\n  - "[[002 - B]]"\n  - "10.9/outside"\n  - "W9"\n',
    'cites:\n  - "[[002 - B]]"\n  - "[[004 - Outside]]"\n  - "[[005 - Id]]"\n'), "a DOI two notes share stays a DOI; nothing else in the note changes");
  assert.deepEqual(await planRelinkCitations(await openLibrary(lib)), []);
});

test("Check citations relinks the notes OpenAlex does not return", async () => {
  const kept = note("10.1/unknown").replace("category:", 'cites:\n  - "10.1/b"\n  - "Baker, M. (1989) Marketing."\ncategory:');
  const lib = memoryFolder({ "001 - A.md": kept, "002 - B.md": note("10.1/b") });
  const { summary, changes } = await planLibraryCitations(await openLibrary(lib), { works: new Map(), refDois: new Map() });
  assert.equal(summary.relinked, 1);
  assert.deepEqual(changes.map(c => c.stem), ["001 - A"]);
  assert.match(changes[0].next, /^cites:\n  - "\[\[002 - B\]\]"\n  - "Baker, M\. \(1989\) Marketing\."\ncategory:/m, "an existing cites is replaced where it is");
});

test("allWorks asks for the next page while works are missing", async () => {
  const all = Array.from({ length: 201 }, (_, i) => ({ id: `https://openalex.org/W${i}`, doi: `https://doi.org/10.2/${i % 200}` }));
  const openalex = pagedOpenalex(all);
  const got = await allWorks(openalex, { filter: "doi:" + Array.from({ length: 200 }, (_, i) => `10.2/${i}`).join("|"), select: "id,doi" });
  assert.equal(got.length, 201);
  assert.deepEqual(openalex.calls.map(c => [c["per-page"], c.page]), [[200, 1], [200, 2]]);
  assert.deepEqual(await allWorks({ get: async () => ({ results: [] }) }, { filter: "doi:10.9/x" }), [], "an answer without meta ends the paging");
});
