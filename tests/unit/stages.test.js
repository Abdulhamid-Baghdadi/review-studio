// Stage rules, search strings, protocol, notes and OpenAlex conversion, without files or network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { amend, defaultState, guardedChange, restoreState, sameValue, saveQuestions, setStatus, touch } from "../../src/domain/stages.js";
import { aiMode, aiPrompt, setAiMode } from "../../src/domain/ai-steps.js";
import { buildQuery, cleanTerms, openalexChanges, openalexWord } from "../../src/domain/queries.js";
import { integrityProblems, lockChecks, protocolMarkdown, reasonCodeClashes } from "../../src/domain/protocol.js";
import { autoDone, chartingProgress, workComplete } from "../../src/domain/progress.js";
import { bibtex, citekeyOf, timelineNote, zoteroRis } from "../../src/domain/stage-notes.js";
import { abstractFromIndex, workToEntry } from "../../src/domain/openalex.js";
import { fileTitle, libraryCitekey, nextIndex, shortAuthors } from "../../src/domain/publications.js";
import { DEFAULT_FT_REASONS, DEFAULT_TA_REASONS } from "../../src/domain/vocabulary.js";
import { OpenAlexClient } from "../../src/services/openalex-client.js";

const NOW = "2026-01-15 10:00";
const reasons = { ta: DEFAULT_TA_REASONS, ft: DEFAULT_FT_REASONS };

test("state: defaults, restore, status, amendments", () => {
  const st = restoreState({ stages: { idea: { status: "done", reason: "", updated: "x" } }, custom: 1 });
  assert.equal(st.stages.idea.status, "done");
  assert.equal(st.stages.report.status, "not-started");
  assert.equal(st.custom, 1);
  touch(st, "questions", NOW);
  assert.equal(st.stages.questions.status, "in-progress");
  assert.throws(() => setStatus(st, "questions", "skipped", "no", NOW), /required/);
  assert.throws(() => setStatus(st, "registration", "skipped", " ", NOW), /reason/);
  setStatus(st, "concepts", "in-progress", "", NOW);
  assert.equal(st.stages.concepts.reopened, true);
  st.protocol.locked = "2026-01-01";
  assert.throws(() => guardedChange(st, "concepts", [{ name: "x" }], { now: NOW }), /amendment/);
  assert.equal(guardedChange(st, "concepts", [{ name: "x" }], { reason: "pilot", now: NOW }), true);
  assert.equal(st.amendments.at(-1).what, "concepts");
  assert.equal(guardedChange(st, "concepts", [{ name: "x" }], { now: NOW }), false, "no change, no amendment");
  assert.equal(guardedChange(st, "ai", { screening: "suggest" }, { devMode: true, now: NOW }), true);
  assert.match(st.events.at(-1).text, /developer mode/);
  assert.throws(() => amend(st, "x", "", NOW));
  assert.ok(sameValue({ a: [1, { b: true }] }, { a: [1, { b: 1 }] }));
  assert.ok(!sameValue("", false));
});

test("questions and AI modes", () => {
  const st = defaultState();
  assert.equal(saveQuestions(st, { population: "P", concept: "C", context: "X", main: "Q?", sub: ["a", " "], why: "first" }, { now: NOW }), true);
  assert.equal(saveQuestions(st, { population: "P", concept: "C", context: "X", main: "Q?", sub: ["a"], why: "same" }, { now: NOW }), false);
  assert.deepEqual(st.questions.history, [], "the first words are not a revision: no empty earlier version");
  assert.equal(st.events.at(-1).text, "questions written");
  assert.equal(aiMode(st, "screening"), "off");
  setAiMode(st, "fulltext", "suggest", { now: NOW });
  assert.equal(aiPrompt("R", st, "fulltext"), 'Use the skill review-screen-fulltexts for the review "R" (mode: suggest).');
  st.ai = { screening: "suggest-ft" };                                   // saved before the full-text split
  assert.deepEqual([aiMode(st, "screening"), aiMode(st, "fulltext")], ["suggest", "suggest"]);
  assert.throws(() => setAiMode(st, "screening", "nope", { now: NOW }));
});

test("search strings per database", () => {
  assert.deepEqual(cleanTerms("a; b\n\nc"), ["a", "b", "c"]);
  assert.equal(openalexWord("repairab* disassembl* scor* modul*"), "repairability disassembly score module");
  assert.equal(openalexWord("modul*"), "module OR modular");                  // one stem, two words: both searched
  // OpenAlex finds a stem that is not a word almost never (remanufactur 4 papers, remanufacture 14,246): whole words
  assert.equal(openalexWord("measur* recycl* evaluat* optimiz*"), "measure recycle evaluate optimize");
  assert.equal(openalexWord("behaviour* analysis* format* heat* habitat* sensor*"), "behaviour analysis format heat habitat sensor");
  // a guessed ending never makes a word that does not exist (found in a self-test, 20 October 2026)
  assert.equal(openalexWord("electric motor* remanufactur* lab* tabl* reusab* assembl*"), "electric motor remanufacture lab table reusability assembly");
  assert.deepEqual(openalexChanges([{ terms: ["motor*", "design for", "disassembl*"] }]), [["motor*", "motor"], ["disassembl*", "disassembly"]]);
  const st = defaultState();
  st.concepts = [{ name: "Mod", terms: ["modular*", "module identification"] }, { name: "El", terms: ["electronic*"] }, { name: "Not", role: "NOT", terms: ["software"] }];
  assert.equal(buildQuery(st, "Scopus"), 'TITLE-ABS-KEY((modular* OR "module identification") AND (electronic*) AND NOT (software))');
  assert.equal(buildQuery(st, "Web of Science"), 'TS=((modular* OR "module identification") AND (electronic*) AND NOT (software))');
  assert.equal(buildQuery(st, "IEEE Xplore"), '("All Metadata":modular* OR "All Metadata":"module identification") AND ("All Metadata":electronic*) AND NOT ("All Metadata":software)');
  assert.equal(buildQuery(st, "OpenAlex"), '(modular OR "module identification") AND (electronic) NOT (software)');
  st.queries.manual.Scopus = "hand-made";
  assert.equal(buildQuery(st, "Scopus"), "hand-made");
});

test("protocol, lock checks and integrity", () => {
  const st = defaultState();
  const text = protocolMarkdown({ reviewName: "R", reviewLink: "[[R]]", st, ftReasons: reasons.ft, generatedBy: "test" });
  assert.match(text, /status: "draft"/);
  assert.match(text, /_\(to be written\)_/);
  assert.match(text, /Exclusion reasons used in screening:\n- E1 wrong concept/);
  const checks = lockChecks(st, reasons);
  assert.deepEqual(checks.filter(c => !c.ok).map(c => c.label).slice(0, 2), ["Review questions written", "Keyword blocks and search strings"]);
  assert.deepEqual(reasonCodeClashes({ ta: ["E1 wrong concept", "E6 wrong population"], ft: ["E1 wrong concept", "E6 no usable content"] }), ["E6"]);
  assert.deepEqual(reasonCodeClashes({ ta: ["E1 wrong concept"], ft: ["E1 Wrong concept", "E7 no data"] }), []);
  st.protocol_text.rationale = "See [citation here].";
  assert.match(lockChecks(st, reasons).find(c => c.label === "No placeholders left").detail, /\[citation here\]/);
  st.protocol = { locked: "2026-01-01", file: "06.md", sha256: "abc", snapshot: { ta_reasons: [...reasons.ta], ft_reasons: [...reasons.ft] } };
  assert.deepEqual(integrityProblems(st, reasons, "abc"), []);
  assert.equal(integrityProblems(st, { ta: ["E1 x"], ft: reasons.ft }, "zzz").length, 2);
});

test("progress: finished work marks in-progress stages done", () => {
  const st = defaultState();
  const recs = [{ ta_decision: "include", ft_decision: "include", pdf_status: "found", chart_study_type: "x" }];
  st.charting.fields = [{ name: "study_type", description: "" }];
  assert.deepEqual(chartingProgress(st, recs), [1, 1]);
  assert.deepEqual(Object.keys(workComplete(st, recs)), ["screening", "retrieval", "charting"]);
  st.stages.screening.status = "in-progress";
  st.stages.retrieval = { status: "in-progress", reason: "", updated: "", reopened: true };
  autoDone(st, recs, NOW);
  assert.equal(st.stages.screening.status, "done");
  assert.equal(st.stages.retrieval.status, "in-progress", "a reopened stage stays open");
});

test("notes: timeline and BibTeX", () => {
  const st = defaultState();
  st.events.push({ when: NOW, stage: "idea", text: "a | b" });
  assert.match(timelineNote({ reviewName: "R", reviewLink: "[[R]]", st, today: "2026-01-15" }), /\| 2026-01-15 10:00 \| Idea notes \| a \/ b \|/);
  assert.equal(bibtex([{ record_id: "R0001", authors: "Liu, Z.; Zhong, P.", year: 2024, title: "T", journal: "", doi: "10.1/x" }]),
    "@article{Liu2024R0001,\n  title = {T},\n  author = {Liu, Z. and Zhong, P.},\n  year = {2024},\n  doi = {10.1/x}\n}\n");
  assert.match(bibtex([{ record_id: "R0002", citekey: "liuDeep2024", authors: "Liu, Z.", year: 2024, title: "T", abstract: "A b.", keywords: "x; y" }]),
    /^@article\{liuDeep2024,[\s\S]*abstract = \{A b\.\},\n  keywords = \{x, y\}/);
});

test("RIS for Zotero: citation key, tags and linked full text", () => {
  const ris = zoteroRis([{ record_id: "R0001", citekey: "liu2024", authors: "Liu, Z.; Zhong, P.", year: 2024, title: "T", doi: "10.1/x",
    abstract: "Line one\nline two", keywords: "k1", pdf: "[[R0001 - T.pdf]]", pdf_status: "found" }], "My review");
  for (const line of ["TY  - JOUR", "ID  - liu2024", "AU  - Liu, Z.", "AU  - Zhong, P.", "AB  - Line one line two", "KW  - k1",
    "KW  - review:My review", "KW  - included", "KW  - record:R0001", "L1  - ../10 - Full texts/R0001 - T.pdf", "ER  - "])
    assert.ok(ris.split("\r\n").includes(line), line);
  assert.ok(!zoteroRis([{ record_id: "R0002", title: "T", pdf: "[[x.pdf]]", pdf_status: "not-retrieved" }], "R").includes("L1"));
  assert.equal(citekeyOf({ record_id: "R0003", year: 2020, authors: "" }), "anon2020R0003");
});

test("OpenAlex works and publication names", () => {
  assert.equal(abstractFromIndex({ world: [1], hello: [0] }), "hello world");
  const e = workToEntry({ id: "https://openalex.org/W1", doi: "https://doi.org/10.1/X", title: "T", publication_year: 2020,
    authorships: [{ author: { display_name: "Ann Lee" } }, { author: null }], primary_location: { source: { display_name: "J" } } });
  assert.deepEqual([e.authors, e.doi, e.journal, e.url], ["Ann Lee", "10.1/x", "J", "https://doi.org/10.1/X"]);
  assert.equal(shortAuthors("Liu, Z. and Zhong, P."), "Liu & Zhong");
  assert.equal(shortAuthors("Rebecca M. Henderson; Kim B. Clark"), "Henderson & Clark", "names given first, as from OpenAlex");
  assert.equal(shortAuthors("Karl T. Ulrich"), "Ulrich");
  assert.equal(fileTitle("A: very/long " + "word ".repeat(30)).length <= 90, true);
  assert.equal(fileTitle("Architectural Innovation: The Reconfiguration of Existing Product Technologies"),
    "Architectural Innovation - The Reconfiguration of Existing Product Technologies", "a colon becomes ' - ', as in the library");
  assert.equal(fileTitle("Why? A note : on/off"), "Why A note - onoff");
  assert.equal(libraryCitekey("Ulrich, Karl T.", 1995), "ulrich1995");
  assert.equal(libraryCitekey("Ellen Bracquené; Jef R. Peeters", 2019), "bracquene2019", "accents folded, name given first");
  assert.equal(libraryCitekey("De Fazio, Thomas L.", 1987), "defazio1987");
  assert.equal(libraryCitekey("Baldwin, C. Y.; Clark, K. B.", 2000, new Set(["baldwin2000", "baldwin2000a"])), "baldwin2000b");
  assert.equal(libraryCitekey("", ""), "anonnd");
  assert.equal(nextIndex(new Map([["a", { index: 7 }], ["b", { index: "12" }], ["c", {}]])), 13);
});

test("OpenAlex client spaces calls, retries and explains a used-up budget", async () => {
  const waits = [];
  const answers = [{ status: 503 }, { status: 200, body: { ok: 1 } }];
  const http = { get: async () => { const a = answers.shift(); return { status: a.status, header: () => null, json: async () => a.body }; } };
  let t = 0;
  const client = new OpenAlexClient({ http, wait: async ms => { waits.push(ms); t += ms; }, monotonic: () => t });
  assert.deepEqual(await client.get("works", { filter: "x" }), { ok: 1 });
  assert.equal(waits[0], 1000, "first retry after 1 s");
  const budget = new OpenAlexClient({ http: { get: async () => ({ status: 429, header: n => (n === "X-RateLimit-Remaining" ? "0" : null), json: async () => ({}) }) }, wait: async () => {} });
  await assert.rejects(budget.get("works"), /daily budget/);
});

test("PDF matching: DOI first, title needs the first author, letter-spaced names", async () => {
  const { matchPdfs, summarizePdf, firstAuthor } = await import("../../src/domain/pdf-matching.js");
  const records = new Map([
    ["R1", { doi: "10.1000/abc", title: "Anything", authors: "Liu, Z." }],
    ["R2", { title: "Design structure matrix methods for products", authors: "Jiao, J.; Tseng, M." }],
    ["R3", { title: "Design structure matrix", authors: "Other, O." }],
  ]);
  const pdfs = [
    { path: "a.pdf", name: "a.pdf", ...summarizePdf("Some paper DOI: 10.1000/ABC). text") },
    { path: "b.pdf", name: "b.pdf", ...summarizePdf("Design Structure Matrix Methods for Products\nJ I A O and M. Tseng") },
  ];
  assert.deepEqual(matchPdfs(records, pdfs).map(m => [m.record_id, m.how, m.pdf]), [["R1", "doi", "a.pdf"], ["R2", "title", "b.pdf"]]);
  assert.equal(firstAuthor("Agus Sudjianto; Kevin Otto"), "sudjianto");
});
