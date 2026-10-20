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
  ["idea", "0 · Idea", true, "Jot down, with dates, what you want to find out and why, and how the idea changes. Vague is fine here."],
  ["questions", "1 · Research questions", false, "Say exactly what you want to find out: who or what (Population), which topic (Concept), in which setting (Context). Every version is kept."],
  ["concepts", "2 · Concepts and terms", false, "One block per idea in your question, with all its synonyms and spellings. A paper must match every block."],
  ["queries", "3 · Search strings", false, "Your keywords turned into a ready-to-paste search for each database. Edit one by hand if needed."],
  ["pilot", "4 · Pilot and validation", true, "Try the search before the real run: how many hits it gives, and whether it finds papers you already know are relevant."],
  ["protocol", "5 · Protocol", false, "Your written plan: which papers count, and how you will search, select and summarise."],
  ["registration", "6 · Registration", true, "Freeze your plan before the real searches, so later changes are visible (optionally registered on OSF)."],
  ["searches", "7 · Database searches", false, "Run each search in its database, export the results and drop the file here. Duplicates are merged."],
  ["screening", "8 · Screening", false, "Read each title and abstract and decide: include, unsure or exclude. Then do the same with the full texts."],
  ["reviewer", "9 · Second reviewer", true, "A second person (or Claude) screens a sample of at least 20 % without seeing your decisions; the app measures how well you agree (Cohen's κ)."],
  ["retrieval", "10 · Full-text retrieval", false, "Find and attach the PDF of every paper that passed the title and abstract check, or mark it as not available."],
  ["charting", "11 · Data charting", false, "Fill in the same form for every included paper (what it studied, how, what it found), with page numbers."],
  ["report", "12 · Report", false, "The PRISMA flow diagram, the PRISMA-ScR checklist and tables and references to export for your paper."],
];

/**
 * The steps the page shows: plain-language groups of stages. A step with more than one tab shows its stages as
 * tabs; a tab with a `part` shows one part of its stage's page (the protocol page: rules and methods; screening:
 * titles and abstracts or full texts; the report: the paper, exports, the library). Steps only change how the review is shown: statuses and files stay per stage.
 * [key, title, hint, phase, tabs: [stage, tab label, part?][]]
 */
const SCOPING_STEPS = [
  ["question", "Research question", "What you want to find out", "Plan", [["idea", "Idea notes"], ["questions", "Question"]]],
  ["search", "Search strategy", "Keywords and database search strings", "Plan", [["concepts", "Keywords"], ["queries", "Search strings"], ["pilot", "Test the search"]]],
  ["rules", "Protocol", "Inclusion rules, methods, lock before searching", "Plan",
    [["protocol", "Inclusion rules", "rules"], ["protocol", "Methods", "methods"], ["registration", "Lock & register"]]],
  ["import", "Search & import", "Run the searches, load the results", "Find", [["searches", "Search & import"]]],
  ["screen", "Screen papers", "Include or exclude each paper", "Select", [["screening", "Titles & abstracts", "ta"], ["retrieval", "Get full texts"], ["screening", "Full texts", "ft"], ["reviewer", "Second reviewer"]]],
  ["extract", "Chart the data", "Fill in a form for each paper", "Chart", [["charting", "Chart the data"]]],
  ["report", "Report", "Flow diagram, checklist, exports", "Report",
    [["report", "Flow diagram & checklist", "paper"], ["report", "Exports & review package", "exports"], ["report", "Obsidian library", "library"]]],
];

const step = ([key, title, hint, phase, tabs]) => Object.freeze({ key, title, hint, phase,
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
    ["rationale", "Background and rationale (PRISMA-ScR 3)"],
    ["eligibility", "Eligibility criteria with rationale (PRISMA-ScR 6)"],
    ["sources", "Information sources (PRISMA-ScR 7)"],
    ["selection", "Selection of sources of evidence (PRISMA-ScR 9)"],
    ["charting", "Data charting process (PRISMA-ScR 10)"],
    ["appraisal", "Critical appraisal (PRISMA-ScR 12)"],
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
