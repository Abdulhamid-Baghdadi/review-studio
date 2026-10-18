/**
 * The review package: everything a reader, examiner or journal needs to check how the review was done,
 * copied into one folder of 07 - Exports (and the same as a ZIP), with a manifest that gives the SHA-256 of
 * every file, so a copy deposited on OSF or Zenodo can be shown to be unchanged.
 * @module services/review-package
 */
import { fullName, toNote } from "../domain/record-properties.js";
import { AI_STEPS, aiMode } from "../domain/ai-steps.js";
import * as csv from "../domain/csv.js";
import { DECISION_LOG_FILE, HOW } from "../domain/decision-log.js";
import { FILES } from "../domain/notes.js";
import { isIncluded } from "../domain/progress.js";
import { PROTOCOL_FILE } from "../domain/protocol.js";
import { SECOND_REVIEWER_DIR } from "../domain/sampling.js";
import { chartingCsv, STAGE_FILES } from "../domain/stage-notes.js";
import { reviewType } from "../domain/stages.js";
import { compareCodePoints } from "../domain/text-rules.js";
import { zip } from "../domain/zip.js";

export const PACKAGE_PREFIX = "Review package";

/** SHA-256 of bytes as hex (Web Crypto: browsers and Node). */
async function sha256(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

const DECISION_COLUMNS = ["record_id", "title", "year", "doi", "sources", "ta_decision", "ta_reason", "ft_decision", "ft_reason",
  "pdf_status", "r2_ta_decision", "r2_ta_reason", "r2_ft_decision", "r2_ft_reason", "screened_on"];

/** What the AI did in this review, from the review state, the records and the decision log. */
function aiUse(st, records, logRows, type) {
  const steps = Object.keys(AI_STEPS).map(k => [type.stages.find(s => s.key === k)?.title ?? k, aiMode(st, k)]);
  const notes = records.map(r => String(r.props.notes ?? ""));
  const count = text => notes.filter(n => n.includes(text)).length;
  const aiEvents = st.events.filter(e => /\bAI\b/.test(String(e.text)));
  return [
    "# Use of AI assistance\n",
    "Every AI step in Systematic Review Workbench only suggests; the reviewer confirms or changes each suggestion. This file lists what was switched on and what the AI did.\n",
    "## Modes chosen per stage\n", "| Stage | Mode |", "|---|---|", ...steps.map(([s, m]) => `| ${s} | ${m} |`), "",
    "## Outcome of AI suggestions\n",
    `- Screening suggestions confirmed unchanged by the reviewer: ${count("suggestion confirmed by reviewer")}`,
    `- Screening suggestions changed by the reviewer: ${count("reviewer changed AI")}`,
    `- Decisions in the decision log made through reviewed AI suggestions: ${logRows.filter(r => r.how === HOW.ai).length}`,
    `- Charting prefilled by AI and not yet checked by the reviewer: ${records.filter(r => isIncluded(r.props) && r.props.chart_checked_by === "AI").length}`,
    `- Appraisal ratings suggested by AI and not yet confirmed: ${records.filter(r => r.props.appraisal_by === "AI").length}`,
    ...Object.entries(st.reviewer_ai ?? {}).map(([stage, r]) => `- Second reviewer (${stage === "ta" ? "title/abstract" : "full text"}) was an AI: ${r.model}, ${r.when}, sheet ${r.sheet}`),
    "", "## Every AI event in the timeline\n", "| When | Stage | What |", "|---|---|---|",
    ...(aiEvents.length ? aiEvents.map(e => `| ${e.when} | ${e.stage} | ${String(e.text).replaceAll("|", "/")} |`) : ["| — | | none |"]), "",
  ].join("\n");
}

/**
 * Writes the package folder and its ZIP. The notes it copies (flow, checklist, protocol, timeline) should be
 * current: the caller refreshes them first.
 * @param {import("./review-repository.js").ReviewRepository} repo @param {object} st
 * @returns {Promise<{dir: string, zipPath: string, files: number, log: {rows: number, intact: boolean, brokenAt: string, last: string}}>}
 */
export async function writePackage(repo, st) {
  const today = repo.clock.today(), type = reviewType(st), folder = repo.folder;
  const dir = `${FILES.exports}/${PACKAGE_PREFIX} ${today}`;
  /** @type {{path: string, bytes: Uint8Array, what: string}[]} */
  const files = [];
  const enc = new TextEncoder();
  const add = (path, text, what) => files.push({ path, bytes: enc.encode(text), what });
  const copy = async (from, path, what) => { if (await folder.exists(from) && !(await folder.isDirectory(from))) files.push({ path, bytes: await folder.readBytes(from), what }); };
  const records = repo.sortedRecords();

  if (st.protocol.file) await copy(st.protocol.file, `01 Protocol/${st.protocol.file}`, "the protocol as registered (frozen)");
  await copy(PROTOCOL_FILE, `01 Protocol/${PROTOCOL_FILE}`, "the protocol as it stands now, with amendments");
  await copy(STAGE_FILES.timeline, `01 Protocol/${STAGE_FILES.timeline}`, "stages, amendments and every dated event");

  await copy(STAGE_FILES.strategy, `02 Searches/${STAGE_FILES.strategy}`, "questions, concepts, search strings and pilot runs");
  await copy(FILES.searches, `02 Searches/${FILES.searches}`, "every search run: database, date, exact string, records");
  for (const name of await folder.list(FILES.exports)) {
    if (name.startsWith(PACKAGE_PREFIX) || await folder.isDirectory(`${FILES.exports}/${name}`)) continue;
    await copy(`${FILES.exports}/${name}`, `02 Searches/Exports/${name}`, "export file as downloaded, or an export made by the app");
  }

  add("03 Screening/Screening decisions.csv", "﻿" + csv.writeRecords(DECISION_COLUMNS.map(fullName), records.map(r => toNote(r.props))),
    "every record with its title/abstract, full-text and second-reviewer decisions and reasons");
  await copy(FILES.guide, `03 Screening/${FILES.guide}`, "the exclusion reasons used");
  await copy(DECISION_LOG_FILE, `03 Screening/${DECISION_LOG_FILE}`, "every change of every decision: when, who, how (hash-chained)");

  for (const name of await folder.list(SECOND_REVIEWER_DIR)) {
    await copy(`${SECOND_REVIEWER_DIR}/${name}`, `04 Second reviewer/${name}`, "blind second-reviewer sheet");
  }

  const charting = "Data charting";
  add(`05 ${charting}/${charting} and appraisal.csv`, chartingCsv(st, records.filter(r => isIncluded(r.props)).map(r => r.props)),
    `the ${type.words.charting} values and ${type.words.appraisal} ratings of every included ${type.words.unit}`);


  await copy(FILES.flow, `07 Report/${FILES.flow}`, "PRISMA flow diagram and counts, exclusion reasons, agreement");
  await copy(type.checklistFile, `07 Report/${type.checklistFile}`, `${type.guideline} checklist with locations`);

  const logRows = await repo.decisionLog.read();
  add("08 AI use.md", aiUse(st, records, logRows, type), "which AI steps were on, and what came of their suggestions");

  const log = await repo.decisionLog.verify();
  const rows = [];
  for (const f of files.sort((a, b) => compareCodePoints(a.path, b.path))) rows.push(`| ${f.path} | ${f.what} | ${f.bytes.length} | \`${await sha256(f.bytes)}\` |`);
  const manifest = [
    `# ${repo.name} — review package\n`,
    `- Review type: ${type.label}, reported to ${type.guideline} (${type.guidelineCitation})`,
    `- Made on: ${today}, by ${repo.settings.generator?.path ?? "Systematic Review Workbench"}`,
    `- Protocol registered: ${st.protocol.locked || "no"}${st.protocol.registration ? ` (${st.protocol.registration})` : ""}` +
      (st.protocol.sha256 ? `; SHA-256 at registration \`${st.protocol.sha256}\`` : ""),
    `- Records: ${records.length}; included: ${records.filter(r => isIncluded(r.props)).length}`,
    `- Decision log: ${log.rows} rows, chain ${log.intact ? "intact" : `BROKEN at row ${log.brokenAt}`}${log.last ? `; last hash \`${log.last}\`` : ""}`, "",
    "## Files\n",
    "Check a file with `sha256sum <file>` (Linux), `shasum -a 256 <file>` (Mac) or `Get-FileHash <file>` (Windows PowerShell); the result must equal the hash below.\n",
    "| File | What it is | Bytes | SHA-256 |", "|---|---|---:|---|", ...rows, "",
  ].join("\n");
  files.push({ path: "MANIFEST.md", bytes: enc.encode(manifest), what: "this list" });

  for (const f of files) await folder.writeBytes(`${dir}/${f.path}`, f.bytes);
  const [year, month, day] = today.split("-").map(Number);
  const zipPath = `${dir}.zip`;
  await folder.writeBytes(zipPath, zip(files.map(f => ({ path: `${PACKAGE_PREFIX} ${today}/${f.path}`, bytes: f.bytes })), { year, month, day }));
  return { dir, zipPath, files: files.length, log };
}
