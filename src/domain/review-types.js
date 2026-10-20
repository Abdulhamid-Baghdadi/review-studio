/**
 * Review types: the app supports one, the scoping review (reported to PRISMA-ScR). The type is stored in
 * review_state.json as `review_type`; a state without it, or with a type the app no longer has (reviews made
 * as "systematic" before 2026-10-18), opens as a scoping review and keeps its saved value. A type is a profile:
 * the stages, the reporting checklist, the protocol sections and the words used for them, so another type can
 * be added later as one more profile without changing the review-folder format.
 * @module domain/review-types
 */

/** @typedef {{key: string, title: string, optional: boolean, description: string}} Stage */
/** @typedef {{n: string, item: string, desc: string, optional: boolean}} ChecklistItem */

const stage = ([key, title, optional, description]) => Object.freeze({ key, title, optional, description });
const item = ([n, item, desc, optional = false]) => Object.freeze({ n: String(n), item, desc, optional });

const SCOPING_STAGES = [
  ["questions", "1 · Research questions", false, "Say exactly what you want to find out: who or what (Population), which topic (Concept), in which setting (Context). Every version is kept."],
  ["concepts", "2 · Search strategy", false, "One keyword block per idea in your question, with all its synonyms and spellings (a paper must match every block). Beside them, the ready-to-paste search string for each database; edit one by hand if needed."],
  ["protocol", "3 · Inclusion & exclusion rules", false, "Decide which papers belong in your review and which do not. The short exclusion reasons (E1, E2 …) are the only ones you can pick while screening."],
  ["methods", "4 · Methods", false, "The rest of your plan: the form you will fill in for every paper, then how you will find, select, chart and summarise. Your question, search strings and rules are added to the Protocol note for you."],
  ["registration", "5 · Registration", true, "Freeze your plan before the real searches, so later changes are visible (optionally registered on OSF)."],
  ["searches", "6 · Database searches", false, "Run each search in its database, export the results and drop the file here. Duplicates are merged."],
  ["screening", "7 · Screening", false, "Read each title and abstract and decide: include, unsure or exclude. Then do the same with the full texts."],
  ["retrieval", "8 · Full-text retrieval", false, "Find and attach the PDF of every paper that passed the title and abstract check, or mark it as not available."],
  ["charting", "9 · Data charting", false, "Fill in the same form for every included paper (what it studied, how, what it found), with page numbers."],
  ["report", "10 · Report", false, "The PRISMA flow diagram, the PRISMA-ScR checklist and tables and references to export for your paper."],
];

/**
 * The steps the page shows: plain-language groups of stages. A step with more than one tab shows its stages as
 * sections of one page; a tab with a `part` shows one part of its stage's page (screening: titles and abstracts or
 * full texts; the report: the paper, exports, the library). Steps only change how the review is shown: statuses and files stay per stage.
 * [key, title, hint, phase, tabs: [stage, tab label, part?][]]
 */
const SCOPING_STEPS = [
  ["question", "Research question", "What you want to find out", "Plan", [["questions", "Question"]]],
  ["search", "Search strategy", "Keywords and database search strings", "Plan", [["concepts", "Search strategy"]]],
  ["rules", "Inclusion & exclusion rules", "Which papers are in, which are out", "Plan", [["protocol", "Inclusion & exclusion rules"]]],
  ["methods", "Methods", "Data items and method sections", "Plan", [["methods", "Methods"]]],
  ["lock", "Lock & register", "Freeze the plan before the searches", "Plan", [["registration", "Lock & register"]]],
  ["import", "Search & import", "Run the searches, load the results", "Find", [["searches", "Search & import"]]],
  ["screen", "Screen papers", "Include or exclude each paper", "Select", [["screening", "Titles & abstracts", "ta"], ["retrieval", "Get full texts"], ["screening", "Full texts", "ft"]]],
  ["extract", "Chart the data", "Fill in a form for each paper", "Chart", [["charting", "Chart the data"]]],
  ["report", "Report", "Flow diagram, checklist, exports", "Report",
    [["report", "Flow diagram & checklist", "paper"], ["report", "Exports & review package", "exports"], ["report", "Obsidian library", "library"]]],
];

/** The explanatory name of each step, the title of its page (the map shows the short `title`). */
const LONG = {
  question: "Research question: population, concept, context",
  search: "Search strategy: keywords and database search strings",
  rules: "Inclusion & exclusion rules: which papers are in, which are out",
  methods: "Methods: data items, sources, selection, charting and synthesis",
  lock: "Lock & register: freeze the plan before the searches",
  import: "Run the searches and import the results",
  screen: "Screen titles, abstracts and full texts",
  extract: "Chart the data of every included paper",
  report: "Report: PRISMA flow diagram, checklist and exports",
};

const step = ([key, title, hint, phase, tabs]) => Object.freeze({ key, title, long: LONG[key] ?? title, hint, phase,
  tabs: Object.freeze(tabs.map(([stage, label, part = null]) => Object.freeze({ stage, label, part }))) });

/** PRISMA-ScR (Tricco et al. 2018): 20 essential items and 2 optional ones (12 and 16). */
const SCR_CHECKLIST = [
  [1, "Title", "Identify the report as a scoping review."],
  [2, "Structured summary", "Background, objectives, eligibility, sources, charting, results, conclusions."],
  [3, "Rationale", "Why the review is needed."],
  [4, "Objectives", "Questions and objectives (PCC elements)."],
  [5, "Protocol and registration", "Whether a protocol exists, where, registration number."],
  [6, "Eligibility criteria", "Characteristics used as criteria, with rationale."],
  [7, "Information sources", "Databases, dates of coverage, other sources, date last searched."],
  [8, "Search", "Full electronic search strategy for at least one database."],
  [9, "Selection of sources of evidence", "Screening and selection process."],
  [10, "Data charting process", "Methods of charting, calibration, who charted."],
  [11, "Data items", "All variables for which data were sought."],
  [12, "Critical appraisal of individual sources of evidence", "Optional item: methods of appraisal, if done.", true],
  [13, "Synthesis of results", "Methods of handling and summarising the data."],
  [14, "Selection of sources of evidence", "Numbers screened / assessed / included, with flow diagram."],
  [15, "Characteristics of sources of evidence", "Characteristics of each source charted."],
  [16, "Critical appraisal within sources of evidence", "Optional item: appraisal data, if done.", true],
  [17, "Results of individual sources of evidence", "Relevant data charted per source."],
  [18, "Synthesis of results", "Summary of charted results related to the objectives."],
  [19, "Summary of evidence", "Main results, links to the questions."],
  [20, "Limitations", "Limitations of the scoping review process."],
  [21, "Conclusions", "General interpretation and implications."],
  [22, "Funding", "Sources of funding and role of funders."],
];

const freeze = o => Object.freeze(o);

/** Scoping review, reported to PRISMA-ScR; methods from the JBI Manual (Peters et al.) and Arksey & O'Malley. */
const SCOPING = freeze({
  key: "scoping",
  label: "Scoping review",
  guideline: "PRISMA-ScR",
  guidelineCitation: "Tricco et al. 2018, Annals of Internal Medicine",
  methods: "JBI Manual for Evidence Synthesis (scoping reviews); Arksey & O'Malley 2005; Levac et al. 2010",
  stages: freeze(SCOPING_STAGES.map(stage)),
  steps: freeze(SCOPING_STEPS.map(step)),
  checklist: freeze(SCR_CHECKLIST.map(item)),
  checklistKey: "checklist",
  checklistFile: "14 - PRISMA-ScR checklist.md",
  checklistParts: freeze([["Title & abstract", "1", "2"], ["Introduction", "3", "4"], ["Methods — in the protocol", "5", "13"], ["Results", "14", "18"], ["Discussion", "19", "21"], ["Funding", "22", "22"]]),
  question: freeze({ framework: "PCC", population: "Population", concept: "Concept", context: "Context", outcome: null }),
  protocolSections: freeze([
    ["rationale", "Background: why this review is needed (PRISMA-ScR 3)"],
    ["eligibility", "Eligibility criteria and why (PRISMA-ScR 6)"],
    ["sources", "Information sources (PRISMA-ScR 7)"],
    ["selection", "Selection of sources of evidence (PRISMA-ScR 9)"],
    ["charting", "Data charting process (PRISMA-ScR 10)"],
    ["appraisal", "Critical appraisal (PRISMA-ScR 12)", true],            // optional: say whether sources were appraised
    ["synthesis", "Synthesis of results (PRISMA-ScR 13)"],
    ["timeline", "Timeline and team"],
  ].map(freeze)),
  refs: freeze({ objectives: "PRISMA-ScR 4", search: "PRISMA-ScR 8", dataItems: "PRISMA-ScR 11", flow: "PRISMA-ScR item 14", sources: "PRISMA-ScR items 7–8", selection: "PRISMA-ScR 9" }),
  /** which checklist item each piece of evidence the tool can see belongs to */
  evidence: freeze({ questions: "4", registration: "5", criteria: "6", sources: "7", strings: "8", screening: "9", dataItems: "11",
    flow: "14", charting: "15" }),
  words: freeze({ unit: "source of evidence", units: "sources of evidence", chart: "chart", charting: "charting", charted: "charted", appraisal: "critical appraisal" }),
});

export const REVIEW_TYPES = freeze({ scoping: SCOPING });
/** Steps the app had before (they still name old events in a review's timeline). */
export const FORMER_STAGES = freeze({ idea: "Idea notes", pilot: "Test the search", reviewer: "Second reviewer", appraisal: "Quality check",
  snowballing: "Citation search", synthesis: "Synthesis", queries: "Search strings" });
/** The type of a saved review that has none: reviews made before review types were scoping reviews. */
export const DEFAULT_REVIEW_TYPE = "scoping";
/** The type a new review starts as. */
export const NEW_REVIEW_TYPE = "scoping";

/** The profile of a review state (scoping when the state has no type). */
export const reviewType = st => REVIEW_TYPES[st?.review_type] ?? SCOPING;

/** Every stage key used by any review type (the state keeps a status for each). */
export const ALL_STAGE_KEYS = Object.freeze([...new Set(Object.values(REVIEW_TYPES).flatMap(t => t.stages.map(s => s.key)))]);

/** Every protocol section key used by any review type. */
export const ALL_PROTOCOL_SECTIONS = Object.freeze([...new Set(Object.values(REVIEW_TYPES).flatMap(t => t.protocolSections.map(([k]) => k)))]);
