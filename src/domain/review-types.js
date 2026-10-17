/**
 * Review types: a scoping review (reported to PRISMA-ScR) or a systematic review (reported to PRISMA 2020).
 * The type is stored in review_state.json as `review_type`; a state without it is a scoping review. Each
 * type is a profile: the stages, the reporting checklist, the protocol sections and the words used for
 * them. Stage keys are the same in both types, so the review-folder format does not depend on the type.
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
  ["snowballing", "11 · Snowballing", true, "Look through the references of (and citations to) your included papers for ones the search missed. Repeat until a round finds nothing new."],
  ["charting", "12 · Data charting", false, "Fill in the same form for every included paper (what it studied, how, what it found), with page numbers."],
  ["appraisal", "13 · Critical appraisal", true, "Rate the quality of each included paper. Optional in scoping reviews."],
  ["report", "14 · Report", false, "The PRISMA flow diagram, the PRISMA-ScR checklist and tables and references to export for your paper."],
];

const SYSTEMATIC_CHANGES = {
  questions: ["1 · Review question", false, "Say exactly what you want to find out, as PICO: Population, Intervention or exposure, Comparator, Outcomes. Every version is kept."],
  registration: ["6 · Registration", true, "Freeze your plan before the real searches. Strongly recommended for systematic reviews: register it (PROSPERO for health topics, otherwise OSF)."],
  reviewer: ["9 · Second reviewer", false, "A second person screens without seeing your decisions: all records is the standard, a sample must be justified. The app measures agreement (Cohen's κ)."],
  snowballing: ["11 · Snowballing", true, "Look through the references of (and citations to) your included papers for ones the search missed. Repeat until a round finds nothing new."],
  charting: ["12 · Data extraction", false, "Fill in the same form for every included study (outcomes and other variables), with page numbers."],
  appraisal: ["13 · Risk of bias", false, "Judge how trustworthy each included study is, with a suitable tool (e.g. RoB 2, ROBINS-I, a JBI checklist)."],
};

const SYSTEMATIC_STAGES = [
  ...SCOPING_STAGES.filter(([key]) => key !== "report").map(([key, ...rest]) => [key, ...(SYSTEMATIC_CHANGES[key] ?? rest)]),
  ["synthesis", "14 · Synthesis and certainty", false, "Combine the results (narrative or meta-analysis), check how much studies differ and how certain the evidence is (e.g. GRADE)."],
  ["report", "15 · Report", false, "The PRISMA flow diagram, the PRISMA 2020 checklist and tables and references to export for your paper."],
];

/**
 * The steps the page shows: plain-language groups of stages. A step with more than one tab shows its stages as
 * tabs; a tab with a `part` shows one part of its stage's page (the protocol page has the rules and the other
 * method sections). Steps only change how the review is shown: statuses and files stay per stage.
 * [key, title, hint, phase, tabs: [stage, tab label, part?][]]
 */
const SCOPING_STEPS = [
  ["question", "Research question", "What you want to find out", "Plan", [["questions", "Question"], ["idea", "Idea notes"]]],
  ["search", "Search strategy", "Keywords and database search strings", "Plan", [["concepts", "Keywords"], ["queries", "Search strings"], ["pilot", "Test the search"]]],
  ["rules", "Inclusion rules", "Which papers are in, which are out", "Plan",
    [["protocol", "Include / exclude rules", "rules"], ["protocol", "Other methods", "methods"], ["registration", "Lock & register"]]],
  ["import", "Search & import", "Run the searches, load the results", "Find & select", [["searches", "Search & import"]]],
  ["screen", "Screen papers", "Include or exclude each paper", "Find & select", [["screening", "Screen"], ["retrieval", "Get full texts"], ["reviewer", "Second reviewer"]]],
  ["citations", "Citation search", "Follow references · optional", "Find & select", [["snowballing", "Citation search"]]],
  ["extract", "Chart the data", "Fill in a form for each paper", "Analyse", [["charting", "Chart the data"]]],
  ["quality", "Quality check", "Critical appraisal · optional", "Analyse", [["appraisal", "Quality check"]]],
  ["report", "Report", "Flow diagram, checklist, exports", "Report", [["report", "Report"]]],
];

const SYSTEMATIC_STEP_CHANGES = {
  question: ["Research question", "PICO: what you want to find out"],
  extract: ["Extract data", "Fill in a form for each study", [["charting", "Extract data"]]],
  quality: ["Risk of bias", "How trustworthy each study is", [["appraisal", "Risk of bias"]]],
};

const SYSTEMATIC_STEPS = [
  ...SCOPING_STEPS.filter(([key]) => key !== "report").map(([key, title, hint, phase, tabs]) => {
    const [t, h, tb] = SYSTEMATIC_STEP_CHANGES[key] ?? [];
    return [key, t ?? title, h ?? hint, phase, tb ?? tabs];
  }),
  ["synthesis", "Synthesis", "Combine the results, rate the certainty", "Analyse", [["synthesis", "Synthesis"]]],
  ["report", "Report", "Flow diagram, checklist, exports", "Report", [["report", "Report"]]],
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

/** PRISMA 2020 (Page et al. 2021): 27 items, 42 with their sub-items. */
const PRISMA2020_CHECKLIST = [
  [1, "Title", "Identify the report as a systematic review."],
  [2, "Abstract", "See the PRISMA 2020 for Abstracts checklist."],
  [3, "Rationale", "The rationale for the review in the context of existing knowledge."],
  [4, "Objectives", "An explicit statement of the objective(s) or question(s) the review addresses."],
  [5, "Eligibility criteria", "Inclusion and exclusion criteria, and how studies were grouped for the syntheses."],
  [6, "Information sources", "All databases, registers, websites, organisations, reference lists and other sources; date each was last searched."],
  [7, "Search strategy", "Full search strategies for all databases, registers and websites, including filters and limits."],
  [8, "Selection process", "How it was decided whether a study met the criteria: how many reviewers, independently or not, automation tools."],
  [9, "Data collection process", "How data were collected from reports: how many reviewers, independently or not, confirming data with authors, automation tools."],
  ["10a", "Data items: outcomes", "The outcomes for which data were sought, and which results were collected for each."],
  ["10b", "Data items: other variables", "Other variables (participants, interventions, funding); assumptions about missing or unclear information."],
  [11, "Study risk of bias assessment", "Methods and tools used, how many reviewers, independently or not, automation tools."],
  [12, "Effect measures", "The effect measure(s) for each outcome (e.g. risk ratio, mean difference)."],
  ["13a", "Synthesis methods: eligibility", "How it was decided which studies were eligible for each synthesis."],
  ["13b", "Synthesis methods: data preparation", "Preparing data for presentation or synthesis (missing statistics, conversions)."],
  ["13c", "Synthesis methods: display", "Methods to tabulate or visually display results of studies and syntheses."],
  ["13d", "Synthesis methods: synthesis", "Methods used to synthesise results and why; for a meta-analysis the model, heterogeneity methods and software."],
  ["13e", "Synthesis methods: heterogeneity", "Methods to explore possible causes of heterogeneity (subgroups, meta-regression)."],
  ["13f", "Synthesis methods: sensitivity", "Sensitivity analyses to assess the robustness of the results."],
  [14, "Reporting bias assessment", "Methods to assess risk of bias due to missing results (reporting biases)."],
  [15, "Certainty assessment", "Methods to assess certainty (or confidence) in the body of evidence for each outcome."],
  ["16a", "Study selection", "Results of the search and selection, from records identified to studies included, ideally with a flow diagram."],
  ["16b", "Study selection: near misses", "Studies that seemed to meet the criteria but were excluded, and why."],
  [17, "Study characteristics", "Cite each included study and present its characteristics."],
  [18, "Risk of bias in studies", "Risk of bias assessments for each included study."],
  [19, "Results of individual studies", "For all outcomes, summary statistics per group and an effect estimate with its precision, ideally in tables or forest plots."],
  ["20a", "Results of syntheses: summary", "Characteristics and risk of bias of the studies contributing to each synthesis."],
  ["20b", "Results of syntheses: statistics", "Results of all statistical syntheses: summary estimate, its precision and heterogeneity."],
  ["20c", "Results of syntheses: heterogeneity", "Results of investigations of possible causes of heterogeneity."],
  ["20d", "Results of syntheses: sensitivity", "Results of sensitivity analyses."],
  [21, "Reporting biases", "Assessments of risk of bias due to missing results, for each synthesis."],
  [22, "Certainty of evidence", "Assessments of certainty (or confidence) in the body of evidence for each outcome."],
  ["23a", "Discussion: interpretation", "General interpretation of the results in the context of other evidence."],
  ["23b", "Discussion: limitations of evidence", "Limitations of the evidence included in the review."],
  ["23c", "Discussion: limitations of review", "Limitations of the review processes used."],
  ["23d", "Discussion: implications", "Implications for practice, policy and future research."],
  ["24a", "Registration", "Register name and registration number, or a statement that the review was not registered."],
  ["24b", "Protocol", "Where the protocol can be accessed, or a statement that no protocol was prepared."],
  ["24c", "Amendments", "Amendments to the registration or protocol, with reasons."],
  [25, "Support", "Sources of financial or non-financial support, and the role of funders or sponsors."],
  [26, "Competing interests", "Competing interests of the review authors."],
  [27, "Availability of data, code and other materials", "Which materials are publicly available and where (data, code, extraction forms)."],
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
    appraisalMethods: "12", flow: "14", charting: "15", appraisalData: "16" }),
  words: freeze({ unit: "source of evidence", units: "sources of evidence", chart: "chart", charting: "charting", charted: "charted", appraisal: "critical appraisal" }),
  /** the overall rating per source on the appraisal stage (methodological quality) */
  appraisalRatings: freeze(["high", "moderate", "low", "unclear"]),
});

/** Systematic review, reported to PRISMA 2020; methods from the Cochrane Handbook or the JBI Manual. */
const SYSTEMATIC = freeze({
  key: "systematic",
  label: "Systematic review",
  guideline: "PRISMA 2020",
  guidelineCitation: "Page et al. 2021, BMJ",
  methods: "Cochrane Handbook for Systematic Reviews of Interventions; JBI Manual for Evidence Synthesis",
  stages: freeze(SYSTEMATIC_STAGES.map(stage)),
  steps: freeze(SYSTEMATIC_STEPS.map(step)),
  checklist: freeze(PRISMA2020_CHECKLIST.map(item)),
  checklistKey: "checklist_prisma2020",
  checklistFile: "15 - PRISMA 2020 checklist.md",
  checklistParts: freeze([["Title & abstract", "1", "2"], ["Introduction", "3", "4"], ["Methods", "5", "15"], ["Results", "16a", "22"], ["Discussion", "23a", "23d"], ["Other information", "24a", "27"]]),
  question: freeze({ framework: "PICO", population: "Population", concept: "Intervention or exposure", context: "Comparator", outcome: "Outcomes" }),
  protocolSections: freeze([
    ["rationale", "Rationale (PRISMA 2020 item 3)"],
    ["eligibility", "Eligibility criteria (PRISMA 2020 item 5)"],
    ["sources", "Information sources (PRISMA 2020 item 6)"],
    ["selection", "Selection process (PRISMA 2020 item 8)"],
    ["charting", "Data collection process (PRISMA 2020 item 9)"],
    ["appraisal", "Study risk of bias assessment (PRISMA 2020 item 11)"],
    ["synthesis", "Effect measures and synthesis methods (PRISMA 2020 items 12–13)"],
    ["certainty", "Reporting bias and certainty assessment (PRISMA 2020 items 14–15)"],
    ["timeline", "Timeline and team"],
  ].map(freeze)),
  refs: freeze({ objectives: "PRISMA 2020 item 4", search: "PRISMA 2020 item 7", dataItems: "PRISMA 2020 item 10", flow: "PRISMA 2020 item 16a", sources: "PRISMA 2020 items 6–7", selection: "PRISMA 2020 item 8" }),
  evidence: freeze({ questions: "4", registration: "24a", criteria: "5", sources: "6", strings: "7", screening: "8", dataItems: "10b",
    appraisalMethods: "11", flow: "16a", charting: "17", appraisalData: "18", synthesis: "13d", certainty: "15" }),
  words: freeze({ unit: "study", units: "studies", chart: "extract", charting: "data extraction", charted: "extracted", appraisal: "risk of bias" }),
  /** the overall risk-of-bias judgement per study (RoB 2 wording; "unclear" when it cannot be judged) */
  appraisalRatings: freeze(["low", "some concerns", "high", "unclear"]),
});

export const REVIEW_TYPES = freeze({ scoping: SCOPING, systematic: SYSTEMATIC });
/** The type of a saved review that has none: reviews made before review types were scoping reviews. */
export const DEFAULT_REVIEW_TYPE = "scoping";
/** The type a new review starts as (the scoping type is still available under Settings → Review type). */
export const NEW_REVIEW_TYPE = "systematic";

/** The profile of a review state (scoping when the state has no type). */
export const reviewType = st => REVIEW_TYPES[st?.review_type] ?? SCOPING;

/** Every stage key used by any review type (the state keeps a status for each). */
export const ALL_STAGE_KEYS = Object.freeze([...new Set(Object.values(REVIEW_TYPES).flatMap(t => t.stages.map(s => s.key)))]);

/** Every protocol section key used by any review type. */
export const ALL_PROTOCOL_SECTIONS = Object.freeze([...new Set(Object.values(REVIEW_TYPES).flatMap(t => t.protocolSections.map(([k]) => k)))]);
