/**
 * Notes the tool generates in the review folder: screening guide, the Obsidian table of the records
 * (08 - Screening.base), the PRISMA flow report (14 - PRISMA flow.md) and rows of the review log.
 * Pure text builders: the services decide when to write them.
 * @module domain/notes
 */
import { REVIEW_TYPES } from "./review-types.js";
import * as frontmatter from "./frontmatter.js";
import { formatFixed, formatPercent } from "./text-rules.js";
import { DEFAULT_FT_REASONS, DEFAULT_TA_REASONS } from "./vocabulary.js";
import { RECORDS_DIR } from "./records.js";
import { fullName } from "./record-properties.js";

/**
 * How generated notes name the tool that wrote them.
 * @typedef {object} Generator
 * @property {string} path      written to `generated-by`
 * @property {string} rerun     how to regenerate the PRISMA flow note, e.g. "Scoping Review Workbench, 14 · Report"
 * @property {string} commands  last section of the screening guide (where the commands are)
 * @property {string} logBy     who writes the review log, e.g. "Scoping Review Workbench"
 * @property {string} stagesBy  `generated-by` of the protocol note
 */

/** @type {Generator} */
export const APP_GENERATOR = Object.freeze({
  path: "Scoping Review Workbench",
  rerun: "*Report* in Scoping Review Workbench",
  commands: "Use Scoping Review Workbench. After a screening session open *Report* to refresh [[14 - PRISMA flow]].",
  logBy: "Scoping Review Workbench",
  stagesBy: "Scoping Review Workbench",
});

export const FILES = Object.freeze({
  searches: "07 - Searches.csv",
  exports: "07 - Exports",
  guide: "08 - Screening guide.md",
  base: "08 - Screening.base",
  log: "00 - Review log.md",
  flow: "14 - PRISMA flow.md",
});

const guideBody = commands => `
# Screening guide

> [!warning] Replace the exclusion reasons in the properties above with the criteria of the registered protocol **before** screening starts. Changes after the pilot are protocol amendments: log them.

Screening happens in Scoping Review Workbench, or in [[08 - Screening.base]] by editing the properties in the table.

## Title and abstract — \`title_abstract_decision\`

| Value | Meaning |
|---|---|
| \`pending\` | not yet screened (set on import) |
| \`include\` | meets the criteria → goes to full text |
| \`unsure\` | cannot decide from title and abstract → goes to full text |
| \`exclude\` | fails a criterion → set \`title_abstract_reason\` to one of \`title_abstract_reasons\` (the code alone, e.g. \`E1\`, is enough) |

## Full text — \`full_text_decision\`

Set to \`pending\` automatically for every record marked include or unsure.

| Value | Meaning |
|---|---|
| \`include\` | included study |
| \`exclude\` | set \`full_text_reason\` to one of \`full_text_reasons\` — one reason per record |

\`full_text_status\`: \`found\` or \`not-retrieved\`. A missing full text is an access problem, not an exclusion: leave \`full_text_decision\` pending and the record is counted as "not retrieved".

Optional: \`screened_by\` (your initials), \`notes\` (free text). \`screened_on\` is filled automatically.

## Second reviewer

\`second_reviewer_title_abstract_sample\` / \`second_reviewer_full_text_sample\` are set when the sample is drawn in Scoping Review Workbench (Screen papers → Second reviewer); the second reviewer never sees this vault's decisions, only the blind CSV sheet. Do not edit the other \`second_reviewer_…\` properties by hand: they are imported from the returned sheet.

## Commands

${commands}
`;

/** The properties of the screening guide that hold the exclusion reasons (older guides: ta_reasons, ft_reasons). */
export const GUIDE_REASONS = Object.freeze({ ta: "title_abstract_reasons", ft: "full_text_reasons" });

/** An older screening guide with its reason lists renamed; null if it is current. */
export function upgradeGuide(text) {
  const next = text.replace(/^ta_reasons:/m, `${GUIDE_REASONS.ta}:`).replace(/^ft_reasons:/m, `${GUIDE_REASONS.ft}:`)
    .replace(/^## Title\/abstract stage — `ta_decision`[\s\S]*?(?=^## Commands)/m, () => guideBody("").split("\n## Commands")[0].replace(/^[\s\S]*?(?=## Title and abstract)/, "") + "\n");
  return next === text ? null : next;
}

/** 08 - Screening guide.md with the default exclusion reasons. */
export const screeningGuide = (reviewLink, generator = APP_GENERATOR) =>
  frontmatter.serialize({ type: "screening-guide", review: reviewLink, [GUIDE_REASONS.ta]: [...DEFAULT_TA_REASONS], [GUIDE_REASONS.ft]: [...DEFAULT_FT_REASONS] })
  + guideBody(generator.commands);

/**
 * Filters that find this review's records wherever its folder sits: in a larger vault, or opened as a vault of its
 * own (as a saved copy of the example is). `this` is the .base file, which lives in the review folder; at the vault
 * root its folder is "/" (or empty), and then every record folder of the vault is this review's.
 */
export const RECORD_FILTERS = Object.freeze([
  `file.folder.endsWith("${RECORDS_DIR}")`,
  'if(this.file.folder == "/" || this.file.folder == "", true, file.inFolder(this.file.folder))',
]);

/** The generated filter line of older .base files, which only worked from the vault the review was made in. */
export const oldRecordFilter = recordsPath => `        - file.inFolder("${recordsPath}")\n`;

/**
 * An older generated .base file brought up to date; null if it is current or not one of ours (left as it is).
 * Its folder filter is replaced, and short property names (ta_decision, chart_…) become the full words the notes use.
 */
export function upgradeBase(text, recordsPath) {
  const old = oldRecordFilter(recordsPath);
  let next = text.replaceAll(old, RECORD_FILTERS.map(f => `        - ${f}\n`).join(""));
  next = next.replace(/\b(chart_[a-z0-9_]+|ta_decision|ta_reason|ft_decision|ft_reason|pdf_status|oa_url|sample_ta|sample_ft|r2_ta_decision|r2_ta_reason|r2_ft_decision|r2_ft_reason)\b/g, k => fullName(k));
  return next === text ? null : next;
}

/** 08 - Screening.base: the Obsidian Bases table over the records. */
export function screeningBase() {
  const n = fullName;                                     // property names as written in the notes
  const view = (name, extra, order) => {
    const filters = [...RECORD_FILTERS, 'type == "review-record"', ...extra].map(x => `        - ${x}`).join("\n");
    const columns = order.map(x => `      - ${n(x)}`).join("\n");
    return `  - type: table
    name: ${name}
    filters:
      and:
${filters}
    order:
${columns}
    sort:
      - property: file.name
        direction: ASC
    columnSize:
      file.name: 420
`;
  };
  const ta = ["file.name", "year", "journal", "ta_decision", "ta_reason", "notes", "sources"];
  const ft = ["file.name", "year", "publication", "pdf_status", "ft_decision", "ft_reason", "notes"];
  return "views:\n" + [                                 // "All records" first: the base never opens on an empty to-do list
    view("All records", [], ["file.name", "year", "journal", "doi", "sources", "publication", "ta_decision", "ft_decision", "screened_on"]),
    view("1 · Title-abstract to screen", [`${n("ta_decision")} == "pending"`], ta),
    view("2 · Full text to screen", [`${n("ft_decision")} == "pending"`], ft),
    view("Unsure at title-abstract", [`${n("ta_decision")} == "unsure"`], [...ta, "ft_decision"]),
    view("Included", [`${n("ft_decision")} == "include"`], ["file.name", "year", "journal", "publication", "sources"]),
    view("Excluded", [`${n("ta_decision")} == "exclude" || ${n("ft_decision")} == "exclude"`], ["file.name", "year", "ta_decision", "ta_reason", "ft_decision", "ft_reason"]),
    view("Second-reviewer sample", [`${n("sample_ta")} == true || ${n("sample_ft")} == true`], ["file.name", "ta_decision", "r2_ta_decision", "ft_decision", "r2_ft_decision"]),
  ].join("");
}

/** Header of 00 - Review log.md. */
export const logHeader = (reviewName, reviewLink, generator = APP_GENERATOR) =>
  frontmatter.serialize({ type: "review-log", review: reviewLink }) +
  `# ${reviewName} — log\n\nWritten by ${generator.logBy}; one row per command that changed something.\n\n| Date | Command | Details |\n|---|---|---|\n`;

/** One row of the review log. */
export const logRow = (today, command, details) => `| ${today} | ${command} | ${String(details).replaceAll("|", "/")} |\n`;

const stem = file => file.split("/").pop().replace(/\.md$/, "");

/**
 * 14 - PRISMA flow.md
 * @param {object} p
 * @param {string} p.reviewName @param {string} p.reviewLink @param {string} p.today
 * @param {ReturnType<typeof import("./flow.js").flowCounts>} p.counts
 * @param {import("./flow.js").SearchRow[]} p.searches
 * @param {{label: string, sampled: number, pairs: [string,string][], disagreements: object[], observed: number|null, kappa: number|null}[]} p.agreement
 * @param {string[]} p.testSet test-set publication names, sorted
 * @param {string[]} p.missed test-set papers the searches did not find
 * @param {{record: import("./records.js").ReviewRecord, text: string}[]} p.problems
 * @param {Generator} [p.generator]
 */
export function prismaFlowNote({ reviewName, reviewLink, today, counts: c, searches, agreement, testSet, missed, problems, generator = APP_GENERATOR, type = REVIEW_TYPES.scoping }) {
  const included = "Sources included";
  const br = rows => rows.map(s => `<br/>${s.database} (n = ${s.records})`).join("");
  const mermaid = `\`\`\`mermaid
flowchart TD
    A["Records identified from databases (n = ${c.identifiedDb})${br(c.db)}"] --> C
    B["Records from other sources (n = ${c.identifiedOther})${br(c.other)}"] --> C
    C["Duplicates removed (n = ${c.duplicates})"] --> S
    S["Records screened, title/abstract (n = ${c.unique})<br/>awaiting decision: ${c.taPending}"] --> SX["Records excluded (n = ${c.taExcluded})"]
    S --> R["Reports sought for retrieval (n = ${c.sought})"]
    R --> RN["Reports not retrieved (n = ${c.notRetrieved})"]
    R --> E["Reports assessed for eligibility (n = ${c.assessed})<br/>awaiting decision: ${c.ftPending}"]
    E --> EX["Reports excluded (n = ${c.ftExcluded})${c.ftReasons.map(([k, v]) => `<br/>${k}: ${v}`).join("")}"]
    E --> I["${included} (n = ${c.included})"]
\`\`\``;
  const agreeRows = agreement.map(a => `| ${a.label} | ${a.sampled} | ${a.pairs.length} | ` +
    `${a.observed === null ? "" : formatPercent(a.observed)} | ${a.kappa === null ? "" : formatFixed(a.kappa, 2)} |`);
  const disagreements = agreement.flatMap(a => a.disagreements.map(d =>
    `- ${a.label}: [[${stem(d.record.file)}|${d.record.id}]] — you: ${d.mine}, second reviewer: ${d.theirs} (${d.reason || "no reason"})`));
  const lines = [
    frontmatter.serialize({ type: "prisma-flow", review: reviewLink, "generated-by": generator.path, generated: today }),
    `# ${reviewName} — PRISMA flow\n`,
    `> [!info] Generated — rerunning ${generator.rerun} overwrites this note.`,
    "> Screening happens in [[08 - Screening.base]]; allowed values are in [[08 - Screening guide]].\n",
    "## Flow diagram (PRISMA-ScR item 14)\n", mermaid, "",
    "## Counts\n", "| Stage | Count |", "|---|---:|",
    `| Records identified — databases | ${c.identifiedDb} |`, `| Records identified — other sources | ${c.identifiedOther} |`,
    `| Duplicates removed | ${c.duplicates} |`, `| Records screened (title/abstract) | ${c.unique} |`,
    `| — awaiting decision | ${c.taPending} |`, `| Records excluded | ${c.taExcluded} |`,
    `| Reports sought (include + unsure) | ${c.sought} |`, `| Reports not retrieved | ${c.notRetrieved} |`,
    `| Reports assessed (full text) | ${c.assessed} |`, `| — awaiting decision | ${c.ftPending} |`,
    `| Reports excluded | ${c.ftExcluded} |`, `| ${included} | ${c.included} |`, "",
    "## Exclusion reasons\n", "| Stage | Reason | Count |", "|---|---|---:|",
    ...c.taReasons.map(([k, v]) => `| Title/abstract | ${k} | ${v} |`),
    ...c.ftReasons.map(([k, v]) => `| Full text | ${k} | ${v} |`),
    "", "## Searches and other sources (PRISMA-ScR items 7–8)\n",
    "| ID | Kind | Database / source | Date | Query | Filters | Records | New | Duplicates |",
    "|---|---|---|---|---|---|---:|---:|---:|",
    ...searches.map(s => `| ${s.id} | ${s.kind} | ${s.database} | ${s.date} | \`${String(s.query).replaceAll("|", "/")}\` | ${s.filters} | ${s.records} | ${s.new} | ${s.duplicates} |`),
    "", "## Agreement with the second reviewer\n",
    "Cohen's κ is computed only from sampled records that both reviewers decided. Target κ ≥ 0.6.\n",
    "| Stage | Sampled | Both decided | % agreement | Cohen's κ |", "|---|---:|---:|---:|---:|", ...agreeRows, "",
    "### Disagreements to resolve\n", ...(disagreements.length ? disagreements : ["- none"]), "",
    "## Search validation (test set)\n",
    `Test set = publications with \`test_in: ${reviewLink}\` (or, if none, \`candidate_in\`). ` +
    `Retrieved by the searches: **${testSet.length - missed.length} of ${testSet.length}**.\n`,
  ];
  if (searches.length && missed.length) lines.push("<details><summary>Missed test-set papers</summary>\n", ...missed.map(m => `- ${m}`), "\n</details>");
  lines.push("", "## Open problems\n");
  lines.push(...(problems.length ? problems.map(p => `- [[${stem(p.record.file)}|${p.record.id}]]: ${p.text}`) : ["- none"]));
  return lines.join("\n") + "\n";
}
