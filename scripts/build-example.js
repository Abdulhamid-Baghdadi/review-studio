// Builds the finished example review that the app opens from the Homepage ("Open the finished example").
//   node scripts/build-example.js
// Input: web/example/openalex-search.json, the records an OpenAlex search returned (saved as they came, with the
// string, filter and date). The review is made with the app's own ReviewSession on a folder in memory, step by step
// as a reviewer would, so it has every file a real review has. Output: web/example/example-review.json, the review
// folder as {path: text}, which the browser copies into its own storage when the example is opened.
//
// The papers are real; the screening decisions were made from titles and abstracts for this example, and the
// data-extraction values come from the abstracts (locator "abstract"). Risk of bias needs the full texts and is
// left open on purpose.
import { readFileSync, writeFileSync } from "node:fs";
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
const clock = { today: () => DAY, now: () => `${DAY} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute++ % 60).padStart(2, "0")}` };

// ------------------------------------------------------------------ the review's plan

const QUESTIONS = {
  population: "Electrical and electronic products (consumer electronics, household appliances, power electronics, circuit boards)",
  concept: "A repairability score or index: developed, applied to real products or evaluated",
  context: "Other scoring systems, expert or user assessment of the same products, or none",
  outcome: "What the score measures (criteria and weights) · how it was checked against real repair · the problems found",
  main: "How do repairability scores for electrical and electronic products measure repairability, and how well do they agree with real repair?",
  sub: ["Which criteria and weights do the scores use?", "How were the scores checked against real repair, by experts or by users?", "Which weaknesses of the scores do the studies report?"],
};

const CONCEPTS = [
  { name: "Repairability score", role: "AND", terms: ["repairability score", "repairability index", "reparability index", "repairability scoring"] },
  { name: "Electrical and electronic products", role: "AND", terms: ["electronic", "electrical", "smartphone", "appliance"] },
];

const REASONS_TA = ["E1 Not about the repairability of electrical or electronic products", "E2 No repairability score developed, applied or evaluated",
  "E3 Not a journal article or full conference paper", "E4 Record error: the abstract belongs to another publication"];
const REASONS_FT = REASONS_TA.slice(0, 3);

const PROTOCOL = {
  rationale: "Repairability scores are now required on products in France (since 2021) and in the EU for smartphones and tablets (since June 2025). They are meant to steer design and purchases, but they are built in different ways, and it is unclear how well a score reflects how easy a product really is to repair. This review collects the studies that develop, apply or evaluate such scores.",
  eligibility: "Include: studies that develop a repairability score or index for electrical or electronic products, apply one to real products, or evaluate one (against other scores, expert assessment, user observation or a teardown). Journal articles and full conference papers, any year, any language with an English abstract.\nExclude: E1 not about the repairability of electrical or electronic products (e.g. surgical 'repair'); E2 no repairability score developed, applied or evaluated (e.g. policy history, consumer preference only, general circularity frameworks); E3 dissertations, preprints, conference abstracts, books, commentaries; E4 database record errors (an abstract that belongs to another publication).",
  sources: "OpenAlex (title and abstract search), searched once on the day of the search. This example searches one database only to stay small; a real systematic review searches at least two bibliographic databases and reports every source.",
  selection: "One reviewer screened titles and abstracts against the criteria, then the full texts. Records without an abstract were taken to full text as 'unsure'. A real systematic review has a second reviewer screen independently.",
  charting: "A data-extraction form with seven fields (score, products, criteria, method, validation, key findings, locators). In this example the values come from the abstracts (locator: abstract); a real review extracts them from the full texts.",
  appraisal: "Planned: the JBI checklist for analytical cross-sectional studies, adapted to method-development studies. Not done in this example, because appraisal needs the full texts.",
  synthesis: "Narrative synthesis grouped by the purpose of the score (design tool, product label, automated rating), following SWiM. No meta-analysis: the studies do not report a common effect measure.",
  certainty: "Not applicable: the review does not estimate an effect. Limitations of the evidence are reported in the discussion.",
  timeline: "Example review, built in one day from a real search. Reviewer: one person (example).",
};

// ------------------------------------------------------------------ decisions (made from title and abstract)

const INCLUDED = {
  W4366827119: { score_name: "French Index of Repairability; iFixit score", products: "Smartphones of three manufacturers", criteria: "Design features, service factors, information for self-repair, authorised and independent repair",
    method: "Netnography and secondary data from manufacturers, policymakers and user communities", validation: "Scores linked to industrial design features of the phones",
    key_findings: "Higher scores are not limited to designs that follow design-for-disassembly guidelines; phones that are hard to repair can still score high when service is good and affordable" },
  W4366316363: { score_name: "Repair Scoring System (RSS) disassembly index", products: "Cooking appliances (ovens, hobs, hoods)", criteria: "Disassembly parameters of the RSS",
    method: "Laboratory disassembly tests and analysis of results", validation: "Laboratory tests of the disassembly index",
    key_findings: "Nine issues with the disassembly index can lead to wrong assessments; guidelines to improve it and the standard" },
  W7165647081: { score_name: "New PCB repairability index", products: "General-purpose printed circuit boards (power electronics as sample case)", criteria: "Traceability, design features, disassembly/reassembly, diagnostics, spare parts, with warning indicators",
    method: "Repair process modelling, interviews with repair experts, review of existing indices; weights from a survey of 50 experts", validation: "Expert interviews and survey",
    key_findings: "Aggregated scores can hide critical repair obstacles; existing indices treat PCBs as one replaceable unit" },
  W4391787504: { score_name: "Repair index based on EN 45554 (repair matrix); compared with AsMeR", products: "Capsule coffee machines (4 existing, 1 redesigned)", criteria: "EN 45554 repair parameters",
    method: "Interpretation of EN 45554 into a repair matrix, applied to four machines; design of a new machine", validation: "Comparison with the AsMeR assessment method",
    key_findings: "Design requirements for repairability identified; options to make EN 45554 more accurate" },
  W7152739603: { score_name: "Repair Index (PCBA design tool)", products: "Printed circuit board assemblies (automotive case study)", criteria: "Component categories, sizes and clearances",
    method: "Tool development with classification levels", validation: "Automotive case study",
    key_findings: "Repairability can be assessed at the design stage of PCBAs" },
  W4411327258: { score_name: "Repairability Index framework for India", products: "Consumer electronics (India)", criteria: "Technical capability, serviceability, supporting artefacts, spare parts, survivability (weighted)",
    method: "Framework development extending the French index; automation through an API", validation: "Not reported in the abstract (comparative positioning only)",
    key_findings: "India-specific factors (multilingual documentation, informal repair sector, price sensitivity) added to the French index" },
  W4399208948: { score_name: "ease of Disassembly Metric (eDiM), used in RSS and the Benelux method", products: "Power electronic converters (PCB-based)", criteria: "Ease of disassembly",
    method: "Applicability study of eDiM; refined PCB-level disassemblability method", validation: "Limitations of eDiM identified on the products",
    key_findings: "eDiM needs adapting for PCB-based products; a PCB-level method is proposed" },
  W4410882382: { score_name: "Calculated repairability indices (small electrical appliances)", products: "Small household electrical appliances", criteria: "Repair stages: first interaction, opening, internal components",
    method: "User observation study (n = 26) with a standard protocol and rubrics", validation: "Users' perceived repairability compared with the calculated index",
    key_findings: "Perceived scores were 35.9 % and 58.8 % lower than the calculated ones for two appliances; opening the product and finding the fault are the main barriers" },
  W7128927348: { score_name: "Reparability Index (RI), with PCI, recyclability and recoverability", products: "Two power electronic converters", criteria: "Disassembly steps and time, bill of materials, circularity indicators",
    method: "Complete disassembly and desoldering; calculation of four indicators", validation: "Indicators calculated on two real converters",
    key_findings: "RI moderate (0.62 and 0.64) while other circularity indicators were low (about 0.2); disassembly took 37 and 78 steps; eight design guidelines" },
  W4387120967: { score_name: "AI-based repairability rating", products: "Smartphones (teardown images)", criteria: "Design features in teardown images",
    method: "Supervised object detection with transfer learning (ConvNeXt, GoogLeNet, ResNet50, VGG16); unsupervised ORB features with k-means", validation: "Smartphone case study",
    key_findings: "AI can support automated assessment and rating of repairability" },
};
const UNSURE = ["W3098276425", "W2015854792", "W4416399979"];          // no abstract: to full text, which this example does not hold
const EXCLUDED = {
  E1: ["W2003383824", "W1961659557"],
  E2: ["W4313909287", "W4407589527", "W4391422562", "W7222076869", "W4412482518", "W7204237282", "W4286882654", "W4413144866"],
  E3: ["W4414746037", "W7169598911", "W7127251159", "W7159555383", "W7161361870", "W4408112013", "W4402940533", "W1541786723"],
};
const HAE = "The repair of home appliances and electronics (HAE)";        // one abstract attached by mistake to 30 records

const FIELDS = [
  { name: "score_name", description: "The repairability score or index studied" },
  { name: "products", description: "Products or product groups" },
  { name: "criteria", description: "What the score measures (criteria, weights)" },
  { name: "method", description: "How the score was developed or applied" },
  { name: "validation", description: "How the score was checked against real repair (experts, users, teardown, other scores)" },
  { name: "key_findings", description: "Main findings for the review questions" },
  { name: "locators", description: "Where in the paper (page, table); here: abstract" },
];

// ------------------------------------------------------------------ the export file: the search results as RIS

const ris = search.works.map(w => [
  `TY  - ${w.type === "conference-paper" ? "CPAPER" : w.type === "book" ? "BOOK" : w.type === "dissertation" ? "THES" : "JOUR"}`,
  `TI  - ${w.title}`, ...w.authors.split("; ").filter(Boolean).map(a => `AU  - ${a}`), `PY  - ${w.year}`,
  w.journal ? `JO  - ${w.journal}` : null, w.doi ? `DO  - ${w.doi.replace("https://doi.org/", "")}` : null,
  `UR  - https://openalex.org/${w.id}`, w.abstract ? `AB  - ${w.abstract.replace(/\s+/g, " ")}` : null, "ER  - ",
].filter(Boolean).join("\n")).join("\n") + "\n";

// ------------------------------------------------------------------ the review, step by step

const folder = memoryFolder({}, `${NAME} records`);
const s = await ReviewSession.open(folder, {
  clock, settings: { name: NAME, recordsPath: `${NAME} records/08 - Records`, template: readFileSync(`${WEB}/templates/Review Record Template.md`, "utf8"), reviewer: "EX" },
});
if (s.st.review_type !== "systematic") throw new Error("a new review should be a systematic review");

await s.addIdea("Repairability scores are now printed on phones and appliances in France and the EU. Do these scores measure what makes a product easy to repair?");
await s.saveQuestions(QUESTIONS, "first version");
await s.saveConcepts(CONCEPTS, "two blocks: the score and the products");
await s.saveDatabases(["OpenAlex"]);
const planned = buildQuery(s.st, "OpenAlex");
if (planned !== search.query) throw new Error(`planned OpenAlex string differs from the search that was run:\n${planned}\n${search.query}`);
await s.pilotFile({ fileName: "openalex-pilot.ris", bytes: new TextEncoder().encode(ris), database: "OpenAlex", note: "final string: small enough to screen every record" });
await s.saveProtocolText(PROTOCOL, { generate: true });
await s.saveReasons(REASONS_TA, REASONS_FT);
await s.saveFields(FIELDS);                                   // the extraction form is part of the plan
await s.lockProtocol("");
await s.importSearch({ fileName: `openalex-${DAY}.ris`, bytes: new TextEncoder().encode(ris), database: "OpenAlex", query: search.query, date: DAY,
  filters: "none (title and abstract search)" });

// record ids by OpenAlex id (the export's UR line)
const idOf = {};
for (const r of s.repo.records.values()) {
  const m = /W\d+/.exec(String(r.props.url ?? ""));
  if (m) idOf[m[0]] = r.id ?? r.props.record_id;
}
const rid = w => { if (!idOf[w]) throw new Error(`no record for ${w}`); return idOf[w]; };
const NOTE = "Example review: decided on the title and abstract.";

for (const w of search.works) {
  if (INCLUDED[w.id]) await s.decide(rid(w.id), "ta", "include", { notes: NOTE });
  else if (UNSURE.includes(w.id)) await s.decide(rid(w.id), "ta", "unsure", { notes: "No abstract: needs the full text." });
  else if (w.abstract.startsWith(HAE)) await s.decide(rid(w.id), "ta", "exclude", { reason: "E4", notes: "The abstract is about repairing household electronics; the title is not: an OpenAlex record error." });
  else {
    const code = Object.keys(EXCLUDED).find(k => EXCLUDED[k].includes(w.id));
    if (!code) throw new Error(`no decision for ${w.id} ${w.title}`);
    await s.decide(rid(w.id), "ta", "exclude", { reason: code, notes: NOTE });
  }
}

// full texts: the open-access links; the three without an abstract were not retrieved for this example
for (const w of search.works) {
  if (INCLUDED[w.id] && w.oa) await s.setRecord(rid(w.id), { oa_url: w.oa });
  if (UNSURE.includes(w.id)) await s.markPdf(rid(w.id), "not-retrieved");
}
for (const w of Object.keys(INCLUDED)) await s.decide(rid(w), "ft", "include", { notes: "Example review: full-text decision taken from the abstract; in a real review, read the full text." });

await s.prepareCharting(false);
for (const [w, values] of Object.entries(INCLUDED))
  await s.setRecord(rid(w), { ...Object.fromEntries(Object.entries(values).map(([k, v]) => [`chart_${k}`, v])), chart_locators: "abstract", chart_basis: "abstract", chart_checked_by: "reviewer" });

await s.setAppraisalTool("JBI checklist for analytical cross-sectional studies (adapted). Not done in this example: appraisal needs the full texts.");
await s.saveSynthesis({
  approach: "Narrative synthesis (SWiM), grouped by the purpose of the score: design tools (PCB, PCBA, eDiM, coffee machines), product labels (French index, India framework, smartphones) and automated rating (AI).",
  software: "None (narrative)", results_file: "",
  heterogeneity: "The scores differ in criteria, weights and product level (whole product versus circuit board), so results were compared by group, not pooled.",
  reporting_bias: "Not assessed: too few studies per group.",
  certainty: "Not graded: the review does not estimate an effect.",
  notes: "Recurring finding across groups: an aggregated score can hide critical obstacles to repair (W7165647081, W4366827119), and users find products harder to repair than the calculated index suggests (W4410882382).",
});

for (const [stage, status, reason] of [["idea", "done"], ["questions", "done"], ["concepts", "done"], ["queries", "done"], ["pilot", "done"],
  ["protocol", "done"], ["registration", "done"], ["searches", "done"], ["screening", "done"], ["retrieval", "done"],
  ["snowballing", "skipped", "not done in this example"], ["charting", "done"], ["synthesis", "done"]])
  await s.setStageStatus(stage, status, reason ?? "");

// ------------------------------------------------------------------ write the folder as one file

const files = {}, binary = {};
for (const [path, data] of folder.files) {
  if (typeof data === "string") files[path] = data;
  else binary[path] = Buffer.from(data).toString("base64");
}
const out = { name: NAME, built: DAY, search: { source: search.source, query: search.query, retrieved: search.retrieved, count: search.count }, files, binary };
writeFileSync(`${WEB}/example/example-review.json`, JSON.stringify(out));
const f = s.repo.records.size;
console.log(`example review: ${f} records, ${Object.keys(INCLUDED).length} included, ${Object.keys(files).length + Object.keys(binary).length} files → web/example/example-review.json`);
