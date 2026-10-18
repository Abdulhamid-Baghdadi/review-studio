// Builds the finished example review that the app opens from the Homepage ("Open the finished example").
//   node scripts/build-example.js
// Input: web/example/openalex-search.json, the records an OpenAlex search returned (saved as they came, with the
// string, filter and date), and web/example/full-texts/*.pdf, the openly licensed full texts (see LICENSES.md there).
// The review is made with the app's own ReviewSession on a folder in memory, step by step as a reviewer would, so
// it has every file a real review has. Output: web/example/example-review.json, the review folder as {path: text};
// the full texts stay separate files ("linked") that the browser fetches when the example is opened.
//
// Topic: sit-stand desks and sitting time at work (randomised trials). The papers are real. Titles and abstracts
// were screened; the included trials were read in full; the data, risk of bias (RoB 2) and the meta-analysis come
// from the full texts (page and table in "locators"). Judgements were made for this example by one reviewer.
// Papers without an openly licensed full text are marked "not retrieved": the example only ships open papers.
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
  population: "Adults who work at a desk (office workers)",
  concept: "A sit-stand desk or workstation at work, alone or with support to use it",
  context: "A usual seated desk (or the same support without a sit-stand desk)",
  outcome: "Sitting time at work, in minutes per 8-hour workday (device-measured or self-reported)",
  main: "In office workers, do sit-stand desks reduce sitting time at work compared with a usual desk?",
  sub: ["How large is the reduction, and does it last up to 12 months?", "Do the results depend on how sitting was measured or on extra support?"],
};

const CONCEPTS = [
  { name: "Sit-stand desk", role: "AND", terms: ["sit-stand desk", "height-adjustable desk", "standing desk", "sit-stand workstation"] },
  { name: "Workplace", role: "AND", terms: ["office workers", "workplace"] },
  { name: "Sitting", role: "AND", terms: ["sitting time", "sedentary time"] },
  { name: "Randomised trial", role: "AND", terms: ["randomised", "randomized"] },
];

const REASONS_TA = ["E1 Wrong population, intervention or comparison", "E2 Not a randomised comparison (review, qualitative or development study, one arm only)",
  "E3 No sitting-time outcome", "E4 Protocol, dissertation, conference abstract, preprint or reference entry", "E5 Another report of a trial (follow-up, secondary or cost analysis)"];
const REASONS_FT = REASONS_TA;

const PROTOCOL = {
  rationale: "Office workers sit for most of their working day, and long sitting is linked to poorer cardiometabolic health. Sit-stand desks let people change position without leaving their work. Many small trials have tested them, with different designs, follow-up and ways of measuring sitting. This review pools the randomised trials to estimate how much sitting at work a sit-stand desk saves.",
  eligibility: "Include: randomised trials (parallel, cluster or crossover) in adults who work at a desk; a sit-stand desk or workstation, alone or with support (education, coaching, prompts); compared with a usual seated desk, or with the same support without the desk; reporting sitting time at work. Any year; journal articles in English.\nExclude: E1 wrong population, intervention or comparison (e.g. students, treadmill desks compared with sit-stand desks); E2 not a randomised comparison (reviews, qualitative and development studies, one-arm analyses); E3 no sitting-time outcome; E4 protocols, dissertations, conference abstracts, preprints, reference entries; E5 another report of a trial (follow-ups, secondary and cost analyses are linked to the main report, not counted again).",
  sources: "OpenAlex (title and abstract search), searched once on the day of the search. This example searches one database only to stay small; a real systematic review searches at least two bibliographic databases (e.g. MEDLINE, Embase, Web of Science) and trial registers.",
  selection: "One reviewer screened titles and abstracts, then the full texts. Records without an abstract went to full text as 'unsure'. A real systematic review has a second reviewer screen independently. Only openly licensed full texts are used in this example: the others are marked 'not retrieved' and reported as such.",
  charting: "A data-extraction form with nine fields (design, setting, participants, intervention, comparison, follow-up, sitting measure, result, locators), filled from the full texts with page and table.",
  appraisal: "Cochrane risk-of-bias tool for randomised trials (RoB 2), with the cluster and crossover variants where they apply; one overall judgement per trial (low, some concerns, high), with the five domains in the note.",
  synthesis: "Outcome: difference in sitting time at work between the sit-stand desk and the comparison group, in minutes per 8-hour workday, at the last follow-up up to 12 months. Random-effects meta-analysis (DerSimonian–Laird, Hartung–Knapp adjustment) of the reported or derived differences with their 95% CI. Percent of work time is converted with 480 minutes. Trials reporting only whole-day sitting are described narratively. Heterogeneity with I² and the prediction interval; certainty with GRADE.",
  certainty: "GRADE for the main outcome: start high (randomised trials), then judge risk of bias, inconsistency, indirectness, imprecision and publication bias.",
  timeline: "Example review, built in one day from a real search. Reviewer: one person (example).",
};

// ------------------------------------------------------------------ decisions

// Included trials, read in full. est/lo/hi: sitting at work, intervention minus control, min per 8-h workday.
const INCLUDED = {
  W2055671197: { label: "Dutta 2014", design: "Randomised crossover trial, two 4-week periods with a 2-week washout", setting: "Office workers, one employer, Minneapolis (USA)",
    participants: "29 randomised, 28 analysed", intervention: "Sit-stand workstation (desktop unit) with a short instruction", comparison: "Usual seated desk (control period)",
    follow_up: "4 weeks per period", sitting_measure: "Thigh-worn accelerometer (MSR 145), % of work time sitting",
    result: "Sitting at work −21% of work time (95% CI −25 to −18) = −100.8 min (−120.0 to −86.4) per 8-h workday",
    locators: "Abstract p1; Results p5", est: -100.8, lo: -120.0, hi: -86.4,
    rob: ["some concerns", "D1 some concerns (sequence generation not described; crossover order) · D2 low · D3 low (1 of 29 missing) · D4 low (device) · D5 some concerns (no published analysis plan)"] },
  W2126997394: { label: "Chau 2014", design: "Pilot randomised crossover trial with a waiting-list control period", setting: "Office workers of a non-government health organisation, Sydney (Australia)",
    participants: "42 randomised", intervention: "Sit-stand workstation with brief instructions and prompts", comparison: "Usual desk (waiting-list period)",
    follow_up: "4 weeks", sitting_measure: "activPAL3 (thigh), sitting min per 8-h workday",
    result: "Change in work sitting −73 min (−106 to −39) with the workstation vs +10 (−24 to 43) in control, p = 0.004; difference −83 min (95% CI −139.5 to −26.5, derived from the p value)",
    locators: "Table 3, p7", est: -83, lo: -139.5, hi: -26.5,
    rob: ["some concerns", "D1 some concerns (pilot; allocation concealment unclear) · D2 low · D3 some concerns (attrition between periods) · D4 low (activPAL) · D5 some concerns (CI derived from p)"] },
  W2178400094: { label: "Graves 2015", design: "Randomised controlled trial (parallel), randomised within departments", setting: "University office staff, Liverpool (UK)",
    participants: "47 randomised (26 intervention, 21 control)", intervention: "Sit-stand workstation (desk mounted) with ergonomic guidance", comparison: "Usual desk",
    follow_up: "8 weeks", sitting_measure: "Ecological momentary assessment diary (self-report)",
    result: "Sitting −80.2 min per 8-h workday (95% CI −129.0 to −31.4) at 8 weeks",
    locators: "Abstract p1; Table 2, p8", est: -80.2, lo: -129.0, hi: -31.4,
    rob: ["high", "D1 low (random number table) · D2 low · D3 low · D4 high (self-reported sitting by participants who knew their group) · D5 low"] },
  W3208920239: { label: "Ma 2021", design: "Randomised controlled trial (parallel)", setting: "Desk workers of one company, Sendai (Japan)",
    participants: "75 randomised (37 intervention, 38 control); 74 analysed", intervention: "Sit-stand desk with instructions", comparison: "Usual desk",
    follow_up: "3 months", sitting_measure: "Waist accelerometer (Omron Active Style Pro) during work hours, min per work time (about 7.5 h)",
    result: "Work sitting after 3 months 239.2 ± 42.2 vs 262.4 ± 58.8 min; difference −23.2 min (95% CI −46.4 to 0.0, derived); group × time p = 0.152",
    locators: "Table 2, p6", est: -23.2, lo: -46.4, hi: 0.0,
    rob: ["some concerns", "D1 some concerns (method not described; baseline sitting differed) · D2 low · D3 low · D4 low (device; waist-worn) · D5 some concerns (follow-up means, not adjusted)"] },
  W4395661599: { label: "Júdice 2024", design: "Cluster randomised controlled trial (parallel), 27 clusters", setting: "Office workers, Lisbon (Portugal)",
    participants: "39 randomised, 38 analysed (19 + 19)", intervention: "Sit-stand workstation (desktop) with an educational session and monthly prompts", comparison: "Usual desk",
    follow_up: "6 months", sitting_measure: "activPAL, 24 h for 7 days: sitting min per day (whole day, not work only)",
    result: "Change in daily sitting −9.9 (SD 54.7) vs +8.6 (SD 75.6) min/day, p = 0.392. Whole-day sitting only: described, not pooled",
    locators: "Table 3, p7", rob: ["some concerns", "D1 some concerns (few participants per cluster) · D2 low · D3 low · D4 low (activPAL) · D5 some concerns"] },
  W4292676900: { label: "Edwardson 2022", design: "Three-arm cluster randomised controlled trial (78 clusters); arm SWAL + desk vs control", setting: "Council offices in Leicester, Liverpool and Greater Manchester (UK)",
    participants: "756 randomised; work-hours data 12 months: about 350 in the two arms compared", intervention: "SMART Work & Life programme plus a height-adjustable desk",
    comparison: "Usual practice", follow_up: "12 months (also 3 months)", sitting_measure: "activPAL3, sitting during work hours normalised to an 8-h workday",
    result: "Sitting during work hours −57.9 min per 8-h workday (95% CI −73.3 to −42.5) at 12 months; −74.3 (−90.8 to −57.7) at 3 months",
    locators: "Table 3 (PMC9382450, open HTML)", est: -57.9, lo: -73.3, hi: -42.5,
    rob: ["some concerns", "D1 low (clusters randomised by an independent statistician after baseline measures) · D2 low · D3 some concerns (about a quarter without valid 12-month work-hours data) · D4 low (activPAL) · D5 low (registered; work-hours outcome secondary)"] },
  W2902369348: { label: "Mantzari 2018", design: "Feasibility study with a randomised controlled component (phase III)", setting: "Office workers of two companies, Cambridge (UK)",
    participants: "20 randomised (10 + 10)", intervention: "Sit-stand desk (full desk or desk mount) at work", comparison: "Usual desk",
    follow_up: "3 months", sitting_measure: "activPAL3, sitting during working hours on working days, min per 8-h day",
    result: "Workplace sitting −94.2 min per 8-h workday (95% CI −170.7 to −17.7) at 3 months",
    locators: "Abstract p1; Table 3, p7", est: -94.2, lo: -170.7, hi: -17.7,
    rob: ["some concerns", "D1 low · D2 low · D3 some concerns (small, feasibility sample) · D4 low (activPAL) · D5 some concerns (feasibility, no powered primary outcome)"] },
  W3094821849: { label: "Pereira 2019", design: "Group-randomised trial, 24 worksites", setting: "Worksites in Phoenix (Arizona) and Minneapolis (Minnesota), USA",
    participants: "630 participants at 24 worksites", intervention: "STAND+: multilevel programme (MOVE+) plus a sit-stand workstation", comparison: "MOVE+: the same multilevel programme without a sit-stand workstation",
    follow_up: "12 months (also 3 months)", sitting_measure: "activPAL3, workplace sitting min per 8-h workday",
    result: "Sitting −59.2 min per 8-h workday (95% CI −74.6 to −43.8) at 12 months; −67.5 (−86.5 to −48.4) at 3 months",
    locators: "Abstract p2; Table 3, p7", est: -59.2, lo: -74.6, hi: -43.8,
    rob: ["low", "D1 low (worksites randomised before recruitment) · D2 low · D3 low · D4 low (activPAL) · D5 low (registered NCT02566317)"] },
};
// passed title and abstract but no openly licensed full text: not retrieved in this example
const NOT_RETRIEVED = ["W2615845359", "W7154981631", "W2905394510", "W2972393671", "W2525911531", "W2997581599", "W2953612249"];
const UNSURE = ["W2905394510", "W2972393671", "W2997581599"];                     // no abstract in OpenAlex
const FT_EXCLUDED = { W1990094225: ["E3", "A stationary high desk was installed, but sitting time was not measured (only steps and physical activity)."] };
const TA_EXCLUDED = {
  E1: ["W2897421585", "W2779981143", "W4294816697", "W4312048034", "W4308029028"],
  E2: ["W4385303224", "W2037141473", "W2801744368", "W4389195364", "W4283730480", "W1517185146", "W2897822343", "W4211042409", "W4206473999",
    "W4417081290", "W4411281608", "W7116043321", "W2565638279", "W4385264340", "W2738411161"],
  E3: ["W2912391309", "W2618261581", "W2032706786"],
  E4: ["W2464895288", "W2753590595", "W3194064345", "W4379536464", "W2891631960", "W2947101819", "W2465160719", "W3026051530", "W2594193004",
    "W3009047757", "W4211244947", "W2944413253", "W2134832195", "W7119089097", "W7140498520", "W7168311983", "W3111684601", "W2327375991"],
  E5: ["W2911063374", "W2901268824", "W4403949057", "W4407997153", "W2607879131", "W4220952550", "W4409212362", "W4409035362", "W4296066603"],
};

const FIELDS = [
  { name: "design", description: "Trial design (parallel, cluster, crossover) and number of arms" },
  { name: "setting", description: "Workplaces and country" },
  { name: "participants", description: "Number randomised and analysed" },
  { name: "intervention", description: "The sit-stand desk and any support" },
  { name: "comparison", description: "What the control group had" },
  { name: "follow_up", description: "Time of the outcome used" },
  { name: "sitting_measure", description: "How sitting was measured (device or self-report) and its unit" },
  { name: "result", description: "Sitting at work, intervention vs control, with 95% CI" },
  { name: "locators", description: "Page and table of each value" },
];

// ------------------------------------------------------------------ the export file: the search results as RIS

// OpenAlex gives "Charlotte Louise Edwardson"; references and study labels want "Edwardson, Charlotte Louise"
const surnameFirst = a => { const p = a.trim().split(/\s+/); return p.length > 1 ? `${p.at(-1)}, ${p.slice(0, -1).join(" ")}` : a; };
const ris = search.works.map(w => [
  `TY  - ${w.type === "conference-paper" ? "CPAPER" : w.type === "conference-abstract" ? "ABST" : w.type === "dissertation" ? "THES" : w.type === "preprint" ? "UNPB" : "JOUR"}`,
  `TI  - ${w.title}`, ...w.authors.split("; ").filter(Boolean).map(a => `AU  - ${surnameFirst(a)}`), `PY  - ${w.year}`,
  w.journal ? `JO  - ${w.journal}` : null, w.doi ? `DO  - ${w.doi.replace("https://doi.org/", "")}` : null,
  `UR  - https://openalex.org/${w.id}`, w.abstract ? `AB  - ${w.abstract.replace(/\s+/g, " ")}` : null, "ER  - ",
].filter(Boolean).join("\n")).join("\n") + "\n";

// ------------------------------------------------------------------ the review, step by step

const folder = memoryFolder({}, `${NAME} records`);
const s = await ReviewSession.open(folder, {
  clock, settings: { name: NAME, recordsPath: `${NAME} records/08 - Records`, template: readFileSync(`${WEB}/templates/Review Record Template.md`, "utf8"), reviewer: "EX" },
});
if (s.st.review_type !== "systematic") throw new Error("a new review should be a systematic review");

await s.addIdea("Our office is getting sit-stand desks. Do they really make people sit less at work, and by how much?");
await s.saveQuestions(QUESTIONS, "first version");
await s.saveConcepts(CONCEPTS, "four blocks: desk, workplace, sitting, randomised trial");
await s.saveDatabases(["OpenAlex"]);
const planned = buildQuery(s.st, "OpenAlex");
if (planned !== search.query) throw new Error(`planned OpenAlex string differs from the search that was run:\n${planned}\n${search.query}`);
await s.pilotFile({ fileName: "openalex-pilot.ris", bytes: new TextEncoder().encode(ris), database: "OpenAlex", note: "final string: small enough to screen every record" });
await s.saveProtocolText(PROTOCOL, { generate: true });
await s.saveReasons(REASONS_TA, REASONS_FT);
await s.saveFields(FIELDS);                                   // the extraction form is part of the plan
await s.setAppraisalTool("RoB 2 (Cochrane risk-of-bias tool for randomised trials), with the cluster and crossover variants");
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
const work = Object.fromEntries(search.works.map(w => [w.id, w]));

const toFullText = new Set([...Object.keys(INCLUDED), ...NOT_RETRIEVED, ...Object.keys(FT_EXCLUDED)]);
const merged = search.works.filter(w => !idOf[w.id]).map(w => w.id);     // duplicates merged on import
for (const w of search.works.filter(w => idOf[w.id])) {
  if (UNSURE.includes(w.id)) await s.decide(rid(w.id), "ta", "unsure", { notes: "No abstract in OpenAlex: the title fits; needs the full text." });
  else if (toFullText.has(w.id)) await s.decide(rid(w.id), "ta", "include", { notes: "Randomised trial of a sit-stand desk in desk workers (title and abstract)." });
  else {
    const code = Object.keys(TA_EXCLUDED).find(k => TA_EXCLUDED[k].includes(w.id));
    if (!code) throw new Error(`no decision for ${w.id} ${w.title}`);
    await s.decide(rid(w.id), "ta", "exclude", { reason: code });
  }
}

// full texts: the openly licensed PDFs in web/example/full-texts; the BMJ trial is read in its open HTML (PMC)
const linked = {};
for (const w of [...Object.keys(INCLUDED), ...Object.keys(FT_EXCLUDED)]) {
  const pdf = `${WEB}/example/full-texts/${w}.pdf`;
  if (existsSync(pdf)) {
    await s.attachPdf(rid(w), new Uint8Array(readFileSync(pdf)));
    const name = String(s.repo.records.get(rid(w)).props.pdf).replace(/^\[\[|\]\]$/g, "");
    linked[`10 - Full texts/${name}`] = `full-texts/${w}.pdf`;
  } else await s.setRecord(rid(w), { oa_url: w === "W4292676900" ? "https://pmc.ncbi.nlm.nih.gov/articles/PMC9382450/" : work[w].landing });
}
for (const w of NOT_RETRIEVED) {
  await s.setRecord(rid(w), { notes: "Not openly licensed: this example only uses open-access full texts. In a real review, get it through your library." });
  await s.markPdf(rid(w), "not-retrieved");
}
for (const w of Object.keys(INCLUDED)) await s.decide(rid(w), "ft", "include", { notes: "Read in full." });
for (const [w, [code, note]] of Object.entries(FT_EXCLUDED)) await s.decide(rid(w), "ft", "exclude", { reason: code, notes: note });

// data extraction and risk of bias, from the full texts
await s.prepareCharting(true);
for (const [w, d] of Object.entries(INCLUDED)) {
  const chart = Object.fromEntries(FIELDS.map(f => [`chart_${f.name}`, d[f.name]]));
  await s.setRecord(rid(w), { ...chart, chart_basis: "full text", chart_checked_by: "reviewer", appraisal: d.rob[0], appraisal_note: d.rob[1], appraisal_by: "reviewer" });
}

// the meta-analysis, with the app's engine
const pooled = Object.entries(INCLUDED).filter(([, d]) => d.est !== undefined);
await s.saveOutcome({
  name: "Sitting time at work (min per 8-h workday)", type: "generic", measure: "difference", model: "random", hk: true, design: "rct",
  comparison: "Sit-stand desk (alone or with support) vs usual desk",
  rows: pooled.map(([w, d]) => ({ record_id: rid(w), est: d.est, lo: d.lo, hi: d.hi })),
  grade: {
    rob: { level: -1, reason: "Five of seven trials have some concerns and one is at high risk (self-reported sitting); the effect stays large without them.", confirmed: true },
    inconsistency: { level: -1, reason: "All trials favour the desk, but the sizes differ a lot (I² over 80%) and the prediction interval reaches no effect.", confirmed: true },
    indirectness: { level: 0, reason: "Office workers, sit-stand desks and sitting at work, as asked.", confirmed: true },
    imprecision: { level: 0, reason: "The 95% CI lies well away from no effect, from about 1,200 participants.", confirmed: true },
    publication: { level: 0, reason: "Too few trials for a funnel test; the large trials agree with the small ones.", confirmed: true },
  },
});
await s.saveSynthesis({
  approach: "Random-effects meta-analysis (DerSimonian–Laird with Hartung–Knapp) of the difference in sitting at work, min per 8-h workday, at the last follow-up up to 12 months; 7 trials. Júdice 2024 reported whole-day sitting only and is described narratively.",
  software: "Systematic Review Workbench (formulas as metafor; the R script in 14 - Synthesis reproduces it)", results_file: "14 - Synthesis",
  heterogeneity: "Large between-trial differences in size (short crossover trials with big effects; 12-month cluster trials with smaller ones). Reported with I², τ² and the prediction interval.",
  reporting_bias: "Fewer than 10 trials: no funnel test. Small and large trials point the same way.",
  certainty: "Low (GRADE): downgraded once for risk of bias and once for inconsistency.",
  notes: "Without the desk the same support did little (Pereira 2019: MOVE+ alone hardly changed sitting). Effects are largest in the first weeks and smaller but lasting at 12 months (Edwardson 2022, Pereira 2019). Júdice 2024 found no difference in whole-day sitting at 6 months.",
});

for (const [stage, status, reason] of [["idea", "done"], ["questions", "done"], ["concepts", "done"], ["queries", "done"], ["pilot", "done"],
  ["protocol", "done"], ["registration", "skipped", "example review, not registered"], ["searches", "done"], ["screening", "done"], ["retrieval", "done"],
  ["snowballing", "skipped", "not done in this example"], ["charting", "done"], ["appraisal", "done"], ["synthesis", "done"]])
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
