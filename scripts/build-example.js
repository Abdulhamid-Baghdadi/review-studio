// Builds the finished example review that the app opens from the Homepage ("Open the finished example").
//   node scripts/build-example.js
// Input: web/example/openalex-search.json, the records an OpenAlex search returned (saved as they came, with the
// string, filter and date; made with scripts/fetch-example-search.js), and web/example/full-texts/*.pdf, the openly
// licensed full texts (see LICENSES.md there). The review is made with the app's own ReviewSession on a folder in
// memory, step by step as a reviewer would, so it has every file a real review has. Output:
// web/example/example-review.json, the review folder as {path: text}; the full texts stay separate files ("linked")
// that the browser fetches when the example is opened.
//
// Topic: design for disassembly of lithium-ion battery packs (an engineering scoping review). The papers are real.
// Titles and abstracts were screened; the included papers were read in full and charted from the full texts (page
// numbers in "locators"). Judgements were made for this example by one reviewer. Papers without a CC BY full text
// that could be downloaded are marked "not retrieved": the example only ships openly licensed papers.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { memoryFolder } from "../src/adapters/memory-folder.js";
import { ReviewSession } from "../src/services/review-session.js";
import { buildQuery } from "../src/domain/queries.js";

const WEB = resolve(import.meta.dirname, "..", "web");
const search = JSON.parse(readFileSync(`${WEB}/example/openalex-search.json`, "utf8"));
const DAY = search.retrieved.slice(0, 10);
const NAME = "Example review";

// a clock that moves on a minute per action, so the timeline keeps the order of the work
let minute = 8 * 60;
const clock = { today: () => DAY, now: () => `${DAY} ${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute++ % 60).padStart(2, "0")}` };

// ------------------------------------------------------------------ the review's plan

const QUESTIONS = {
  population: "Lithium-ion battery packs and modules (electric vehicles, light vehicles, stationary storage, portable devices)",
  concept: "Design features and design methods that make a pack or module easier to disassemble (joining, fastening, architecture, assessment metrics)",
  context: "Engineering research and practice, any year; journal articles and conference papers in English",
  main: "What design features and methods that make lithium-ion battery packs easier to disassemble are described in the engineering literature?",
  sub: ["Which joining and fastening choices are reported to help or hinder disassembly?", "How is the ease of disassembly assessed or measured?"],
};

const CONCEPTS = [
  { name: "Battery pack", role: "AND", terms: ["battery pack", "battery module"] },
  { name: "Disassembly", role: "AND", terms: ["disassembly", "dismantling"] },
  { name: "Design", role: "AND", terms: ["design"] },
];

const REASONS_TA = ["E1 Not about battery packs or modules", "E2 Disassembly process, automation or recycling only, with no link to the pack's design",
  "E3 Pack or module design without regard to disassembly", "E4 Not a journal article or conference paper (book, chapter, thesis, preprint, abstract, editorial, report)",
  "E5 Not in English"];
const REASONS_FT = REASONS_TA;
const INCLUDE = ["Lithium-ion battery packs or modules, any application", "Describes, proposes or assesses a design feature or design method that affects how easily the pack or module comes apart",
  "Journal article or conference paper", "In English; any year; any study design (case study, design concept, assessment, review)"];

const PROTOCOL = {
  rationale: "Millions of lithium-ion battery packs will reach the end of their first life in the coming years. Whether they can be repaired, remanufactured, reused or recycled well depends largely on how easily they come apart, and that is decided when the pack is designed. Work on this is spread over product design, manufacturing and recycling research. This scoping review maps which design features and methods for easier disassembly are described, and how ease of disassembly is assessed.",
  eligibility: "Disassembly is decided when a pack is designed, so the review looks for sources that link design choices to disassembly, from any battery application. Process, automation and recycling studies that say nothing about the pack's design are left out, as is design work that ignores disassembly. Journal articles and conference papers carry the methods detail the charting needs; books, theses, preprints and abstracts are left out to keep the example small.",
  sources: "OpenAlex (title and abstract search), searched once on the day of the search. This example searches one database only to stay small; a real scoping review searches several (e.g. Scopus, Web of Science, IEEE Xplore) and grey literature.",
  selection: "One reviewer screened titles and abstracts, then the full texts. Records without an abstract were judged on the title, or went to full text as 'unsure'. Only openly licensed (CC BY) full texts are used in this example: the others are marked 'not retrieved' and reported as such.",
  charting: "A charting form with six fields (application, type of source, design features, how disassembly is assessed, main findings, locators), filled from the full texts with page numbers.",
  appraisal: "No critical appraisal: this review maps the design approaches that exist (PRISMA-ScR item 12 is optional).",
  synthesis: "Charted data are summarised in tables and grouped by design feature (joining and fastening, architecture and modularity, assessment methods), with a narrative summary per review question.",
  timeline: "Example review, built in one day from a real search. Reviewer: one person (example).",
};

// ------------------------------------------------------------------ decisions

// Included at full text, read in full and charted. Page numbers are the journal's or book's own.
const INCLUDED = {
  W4410478850: { application: "Electric-car traction battery packs (designs of Tesla, GM, Rivian and Lucid compared)",
    source_type: "Narrative review with comparison tables and a service case study",
    design_features: "Modular pack architecture; accessible, snap-in and standardised fasteners; service panels and external harness connectors; labelled modules and QR codes; proposed 'smart' fasteners. Adhesives, welded joints and potting named as barriers",
    assessment: "Indicative figures from the literature: disassembly time (min), service cost, technician hazard level (0–5), automation compatibility (0–5) and material recovery rate",
    findings: "Fully modular packs take about 30–45 min to disassemble, integrated (welded) packs 120–180 min and potted packs over 180 min; modular designs score higher on automation readiness and material recovery",
    locators: "Abstract p2205; Table 1 p2209; Table 3 p2213; Conclusion p2220" },
  W7125753274: { application: "A 72 V 20 Ah lithium-ion battery pack with 80 cells (application not stated)",
    source_type: "Case study: one pack disassembled in 25 operations, rated by two experts",
    design_features: "Screws on the top and bottom covers (12 each), screwed controller and BMS boards in confined positions, nickel strips welded to the cells",
    assessment: "Ease of Disassembly Metric (eDiM, standard time in seconds) combined with an expert difficulty rating (accessibility, positioning, force), normalised into one score",
    findings: "Removing the welded nickel strips took longest (1,243.9 s) and was rated hardest; cover screws took long but were easy; screws in confined positions were quick but hard to reach. Time alone does not show how difficult an operation is",
    locators: "Abstract p296; Table 4 p302; Discussion and Conclusion p304" },
  W4379364418: { application: "Traction battery system of a commercial vehicle (truck), prismatic cells",
    source_type: "Conceptual analysis of an exemplary pack design, with a literature review",
    design_features: "Welded busbars and cell contacts, thermal glue and adhesive gap fillers, double-sided adhesive films between cells, poor accessibility. Proposed: detachable contacting (laser bonding, micro-clinching), plug-in cell frames, cable plugs, cooling integrated in the housing",
    assessment: "Qualitative evaluation of the pack's materials and joining technologies against requirements for remanufacturing down to cell level",
    findings: "Current pack designs cannot be taken apart to cell level without damage, mainly because of adhesive bonds and welded connections; the proposed modifications need more space and must keep performance, weight and size",
    locators: "Abstract p376; main difficulties p382; Table 1 p383; Conclusion p384" },
  W4413070517: { application: "Hybrid electric-vehicle battery pack (HELIOS prototype: high-energy and high-power modules)",
    source_type: "Project paper: design concept, recycling experiments and life cycle assessment",
    design_features: "Identical modules in plastic 'egg-box' housings; subpacks of four modules with their own cooling circuit; subpacks joined by copper busbars and wires for easy removal; parts made of the same material; disassembly pre-planned from CAD for robots",
    assessment: "Not measured: the ease of disassembly is described qualitatively",
    findings: "The modular subpacks can be removed easily for second-life use, and full dismantling is planned to be mainly automated; most of the paper is about graphite recovery and life cycle assessment",
    locators: "Abstract p659; Section 3 pp662–663; Conclusions p675" },
};
// passed title and abstract but no CC BY full text that could be downloaded: not retrieved in this example
const NOT_RETRIEVED = ["W3011769304", "W4313368198", "W7154726003", "W2615434793", "W7150802201", "W7132831355", "W7125700204", "W4403299344",
  "W4298001737", "W4413830632", "W4417338114", "W7222743118", "W4413097404", "W7167023933", "W4401323499", "W2586994541"];
const UNSURE = ["W3011769304"];                     // no abstract in OpenAlex; the title fits
const FT_EXCLUDED = {};
const TA_EXCLUDED = {
  E1: ["W7161275879", "W7220108518", "W2977848555", "W7169684998", "W2884944762", "W4394584769", "W7208719530", "W1517711565", "W2323030707"],
  E2: ["W3135422058", "W4389089739", "W4406000116", "W4387583596", "W7155059919", "W7168999189", "W4389249532", "W7125252604", "W3036983432",
    "W3121088681", "W4416133357", "W4406763849", "W4225716353", "W4286603582", "W4407583712", "W4396888226", "W7220361934", "W4385641567",
    "W3002753706", "W4320059063", "W4405599418", "W7127900962", "W7171090203", "W4394982298", "W4417166378", "W7164072240", "W4311434429",
    "W3173281103", "W4405074583", "W4414567657", "W4377697250", "W7221620663", "W3045145622", "W7151236622", "W4415616736", "W4283816810",
    "W7104013375", "W3201384012", "W2060226588", "W7164754231", "W4413097424", "W7220182964"],
  E3: ["W2807585248", "W2960359457", "W3191534098", "W2903464391", "W4410081030", "W2036433538", "W4393015874", "W4293222135", "W2125643757",
    "W1965998413", "W2143036127", "W4389662047", "W7221629229", "W7221189059"],
  E4: ["W4285306384", "W3121675465", "W4392720819", "W7139927679", "W4405593728", "W7203574201", "W7221159669", "W4405564734", "W4388708180",
    "W7220741364", "W4327850179", "W4396900126", "W4413953136", "W4415279292", "W4407143055", "W2499603214", "W2164383959", "W7212137206",
    "W7128009798", "W4285397922", "W7135164275", "W7215193059", "W4412541928", "W4386834891", "W4391662925"],
  E5: ["W7154446102"],
};

const FIELDS = [
  { name: "application", description: "Battery application and the pack or module studied" },
  { name: "source_type", description: "Type of source (case study, design concept, assessment method, review)" },
  { name: "design_features", description: "Design features or principles addressed (joining, fastening, architecture, materials)" },
  { name: "assessment", description: "How the ease of disassembly is assessed or measured" },
  { name: "findings", description: "Main findings about disassembly" },
  { name: "locators", description: "Page and table of each value" },
];

// ------------------------------------------------------------------ the export file: the search results as RIS

// OpenAlex gives "Melina Graner"; references want "Graner, Melina"
const surnameFirst = a => { const p = a.trim().split(/\s+/); return p.length > 1 ? `${p.at(-1)}, ${p.slice(0, -1).join(" ")}` : a; };
const RIS_TYPE = { "conference-paper": "CPAPER", "conference-abstract": "ABST", dissertation: "THES", preprint: "UNPB", "book-chapter": "CHAP", book: "BOOK", report: "RPRT" };
const ris = search.works.map(w => [
  `TY  - ${RIS_TYPE[w.type] ?? "JOUR"}`,
  `TI  - ${w.title}`, ...w.authors.split("; ").filter(Boolean).map(a => `AU  - ${surnameFirst(a)}`), `PY  - ${w.year}`,
  w.journal ? `JO  - ${w.journal}` : null, w.doi ? `DO  - ${w.doi.replace("https://doi.org/", "")}` : null,
  `UR  - https://openalex.org/${w.id}`, w.abstract ? `AB  - ${w.abstract.replace(/\s+/g, " ")}` : null, "ER  - ",
].filter(Boolean).join("\n")).join("\n") + "\n";

// ------------------------------------------------------------------ the review, step by step

const folder = memoryFolder({}, `${NAME} records`);
const s = await ReviewSession.open(folder, {
  clock, settings: { name: NAME, recordsPath: `${NAME} records/08 - Records`, template: readFileSync(`${WEB}/templates/Review Record Template.md`, "utf8"), reviewer: "EX" },
});
if (s.st.review_type !== "scoping") throw new Error("a new review should be a scoping review");

await s.saveQuestions(QUESTIONS, "first version");
await s.saveConcepts(CONCEPTS, "three blocks: battery pack, disassembly, design");
await s.saveDatabases(["OpenAlex"]);
const planned = buildQuery(s.st, "OpenAlex");
if (planned !== search.query) throw new Error(`planned OpenAlex string differs from the search that was run:\n${planned}\n${search.query}`);
await s.saveProtocolText(PROTOCOL, { generate: true });
await s.saveReasons(REASONS_TA, REASONS_FT, "", INCLUDE);
await s.saveFields(FIELDS);                                   // the charting form is part of the plan
await s.lockProtocol("");
await s.importSearch({ fileName: `openalex-${DAY}.ris`, bytes: new TextEncoder().encode(ris), database: "OpenAlex", query: search.query, date: DAY,
  filters: "none (title and abstract search)" });

// record ids by OpenAlex id (the export's UR line)
const idOf = {};
for (const r of s.repo.records.values()) {
  const m = /W\d+/.exec(String(r.props.openalex || r.props.url || ""));
  if (m) idOf[m[0]] = r.id ?? r.props.record_id;
}
const rid = w => { if (!idOf[w]) throw new Error(`no record for ${w}`); return idOf[w]; };

const toFullText = new Set([...Object.keys(INCLUDED), ...NOT_RETRIEVED, ...Object.keys(FT_EXCLUDED)]);
for (const w of search.works.filter(w => idOf[w.id])) {
  if (UNSURE.includes(w.id)) await s.decide(rid(w.id), "ta", "unsure", { notes: "No abstract in OpenAlex: the title fits; needs the full text." });
  else if (toFullText.has(w.id)) await s.decide(rid(w.id), "ta", "include", { notes: "Battery pack or module design discussed with regard to disassembly (title and abstract)." });
  else {
    const code = Object.keys(TA_EXCLUDED).find(k => TA_EXCLUDED[k].includes(w.id));
    if (!code) throw new Error(`no decision for ${w.id} ${w.title}`);
    await s.decide(rid(w.id), "ta", "exclude", { reason: code, ...(w.abstract ? {} : { notes: "No abstract in OpenAlex: decided on the title." }) });
  }
}

// full texts: the openly licensed PDFs in web/example/full-texts
const linked = {};
for (const w of Object.keys(INCLUDED)) {
  const pdf = `${WEB}/example/full-texts/${w}.pdf`;
  if (!existsSync(pdf)) throw new Error(`missing full text ${pdf}`);
  await s.attachPdf(rid(w), new Uint8Array(readFileSync(pdf)));
  const name = String(s.repo.records.get(rid(w)).props.pdf).replace(/^\[\[|\]\]$/g, "");
  linked[`10 - Full texts/${name}`] = `full-texts/${w}.pdf`;
}
for (const w of NOT_RETRIEVED) {
  await s.setRecord(rid(w), { notes: "No CC BY full text that this example could ship. In a real review, get it through your library or the open-access link." });
  await s.markPdf(rid(w), "not-retrieved");
}
for (const w of Object.keys(INCLUDED)) await s.decide(rid(w), "ft", "include", { notes: "Read in full." });
for (const [w, [code, note]] of Object.entries(FT_EXCLUDED)) await s.decide(rid(w), "ft", "exclude", { reason: code, notes: note });

// data charting, from the full texts
await s.prepareCharting(false);
for (const [w, d] of Object.entries(INCLUDED)) {
  const chart = Object.fromEntries(FIELDS.map(f => [`chart_${f.name}`, d[f.name]]));
  await s.setRecord(rid(w), { ...chart, chart_basis: "full text", chart_checked_by: "reviewer" });
}

for (const [stage, status, reason] of [["questions", "done"], ["concepts", "done"], ["queries", "done"],
  ["protocol", "done"], ["methods", "done"], ["registration", "skipped", "example review, not registered"], ["searches", "done"], ["screening", "done"], ["retrieval", "done"],
  ["charting", "done"]])
  await s.setStageStatus(stage, status, reason ?? "");

// ------------------------------------------------------------------ write the folder as one file

const files = {}, binary = {};
for (const [path, data] of folder.files) {
  if (typeof data === "string") files[path] = data;
  else if (!linked[path]) binary[path] = Buffer.from(data).toString("base64");
}
files["10 - Full texts/Licences.md"] = readFileSync(`${WEB}/example/full-texts/LICENSES.md`, "utf8");   // who owns the PDFs, and their licences
const out = { name: NAME, built: DAY, search: { source: search.source, query: search.query, retrieved: search.retrieved, count: search.count }, files, binary, linked };
writeFileSync(`${WEB}/example/example-review.json`, JSON.stringify(out));
console.log(`example review: ${s.repo.records.size} records, ${Object.keys(INCLUDED).length} included, ${Object.keys(linked).length} full texts, ${Object.keys(files).length + Object.keys(binary).length} files → web/example/example-review.json`);
