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
  ["idea", "0 · Idea", true, "Write down, with dates, what you want to find out and why; how the idea changes."],
  ["questions", "1 · Research questions", false, "Population–Concept–Context and the review questions; every version is kept."],
  ["concepts", "2 · Concepts and terms", false, "One block per concept with all synonyms and spellings; blocks are combined with AND."],
  ["queries", "3 · Search strings", false, "Search strings generated per database from the concept table; edit by hand if needed."],
  ["pilot", "4 · Pilot and validation", true, "Trial runs: hit count and how many test-set papers the string retrieves."],
  ["protocol", "5 · Protocol", false, "The protocol text, generated from stages 1–4 plus the method sections."],
  ["registration", "6 · Registration", true, "Freeze the protocol (git commit and/or OSF) before searching."],
  ["searches", "7 · Database searches", false, "Import every final database export with the exact string and date."],
  ["screening", "8 · Screening", false, "Title/abstract, then full text, in Screening.base."],
  ["reviewer", "9 · Second reviewer", true, "Independent screening of a ≥ 20 % sample; Cohen's κ."],
  ["retrieval", "10 · Full-text retrieval", false, "Find, attach or mark as not retrieved the full texts to assess."],
  ["snowballing", "11 · Snowballing", true, "Citation rounds from the full-text includes; new records go through screening and retrieval again, until a round adds no new included study."],
  ["charting", "12 · Data charting", false, "Fill the charting form for every included source, with page locators."],
  ["appraisal", "13 · Critical appraisal", true, "Optional in scoping reviews; appraise each included source."],
  ["report", "14 · Report", false, "PRISMA flow, PRISMA-ScR checklist, exports for writing."],
];

const SYSTEMATIC_CHANGES = {
  questions: ["1 · Review question", false, "PICO (Population, Intervention or exposure, Comparator, Outcomes) and the review questions; every version is kept."],
  registration: ["6 · Registration", true, "Strongly recommended for systematic reviews: register the protocol (PROSPERO for health topics, otherwise OSF) before searching."],
  reviewer: ["9 · Second reviewer", false, "Independent screening by a second reviewer: all records is the standard; a sample must be justified. Cohen's κ."],
  snowballing: ["11 · Snowballing", true, "Citation rounds from the full-text includes; new records go through screening and retrieval again, until a round adds no new included study."],
  charting: ["12 · Data extraction", false, "Fill the extraction form for every included study (outcomes and other variables), with page locators."],
  appraisal: ["13 · Risk of bias", false, "Assess the risk of bias of every included study with a suitable tool (e.g. RoB 2, ROBINS-I, a JBI checklist)."],
};

const SYSTEMATIC_STAGES = [
  ...SCOPING_STAGES.filter(([key]) => key !== "report").map(([key, ...rest]) => [key, ...(SYSTEMATIC_CHANGES[key] ?? rest)]),
  ["synthesis", "14 · Synthesis and certainty", false, "Record how the results were synthesised (narrative or meta-analysis: method, software, results file), heterogeneity, reporting bias and the certainty of the evidence (e.g. GRADE)."],
  ["report", "15 · Report", false, "PRISMA flow, PRISMA 2020 checklist, exports for writing."],
];

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
});

/** Systematic review, reported to PRISMA 2020; methods from the Cochrane Handbook or the JBI Manual. */
const SYSTEMATIC = freeze({
  key: "systematic",
  label: "Systematic review",
  guideline: "PRISMA 2020",
  guidelineCitation: "Page et al. 2021, BMJ",
  methods: "Cochrane Handbook for Systematic Reviews of Interventions; JBI Manual for Evidence Synthesis",
  stages: freeze(SYSTEMATIC_STAGES.map(stage)),
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
});

export const REVIEW_TYPES = freeze({ scoping: SCOPING, systematic: SYSTEMATIC });
export const DEFAULT_REVIEW_TYPE = "scoping";

/** The profile of a review state (scoping when the state has no type). */
export const reviewType = st => REVIEW_TYPES[st?.review_type] ?? SCOPING;

/** Every stage key used by any review type (the state keeps a status for each). */
export const ALL_STAGE_KEYS = Object.freeze([...new Set(Object.values(REVIEW_TYPES).flatMap(t => t.stages.map(s => s.key)))]);

/** Every protocol section key used by any review type. */
export const ALL_PROTOCOL_SECTIONS = Object.freeze([...new Set(Object.values(REVIEW_TYPES).flatMap(t => t.protocolSections.map(([k]) => k)))]);
