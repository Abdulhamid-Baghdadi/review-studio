/**
 * Use cases on a review's records: import a search, add a paper found another way, check the screening,
 * and write the PRISMA flow report.
 * Each takes a ReviewRepository (and the library where it matters) and returns a short message.
 * @module services/review-commands
 */
import * as csv from "../domain/csv.js";
import { flowCounts } from "../domain/flow.js";
import { makeEntry, parseExport } from "../domain/importers.js";
import { DuplicateIndex, yearOf } from "../domain/matching.js";
import { FILES, prismaFlowNote } from "../domain/notes.js";
import { HOW } from "../domain/decision-log.js";
import { compareCodePoints, formatPercent, normalizeNewlines, strip } from "../domain/text-rules.js";
import { createRecord, mergeDuplicate, nextRecordId } from "../domain/records.js";
import { checkRecord } from "../domain/screening.js";
import { emptyLibrary } from "./library.js";
import { loadState } from "./review-state.js";
import { reviewType } from "../domain/review-types.js";

/** A command that cannot run; the message is meant for the reviewer. */
export class ReviewError extends Error {}

/** A seed from 0 to 999 999 from the system's secure random source . */
const secureSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;

// the next search id: one above every id used so far, in the table or by an export kept in 07 - Exports (an undone
// import keeps its file), so no id is ever given twice
async function sourceId(repo, rows) {
  const used = [...rows.map(r => r.id), ...(await repo.folder.list(FILES.exports))].map(x => Number(/^S(\d+)\b/.exec(String(x))?.[1] ?? 0));
  return `S${String(Math.max(0, ...used) + 1).padStart(2, "0")}`;
}

/** Text of an uploaded export as it is read: UTF-8 with or without BOM, bad bytes replaced. */
export const decodeExport = bytes => normalizeNewlines(new TextDecoder("utf-8").decode(bytes)).replace(/^﻿/, "");

/**
 * Adds export entries to the review: duplicates are merged into the existing record, new papers become
 * records (linked to the library note when the paper is already in the library).
 * @returns {Promise<{added: number, duplicates: number}>}
 */
export async function addEntries(repo, entries, source, library = emptyLibrary()) {
  await repo.ensureScreeningFiles();
  const index = new DuplicateIndex();
  for (const r of repo.records.values()) index.add(r.id, r.props.doi, r.props.title, yearOf(r.props.year));
  let added = 0, duplicates = 0;
  for (const e of entries) {
    if (!e.title) continue;
    const existing = index.find(e.doi, e.title, e.year);
    if (existing) {
      repo.put(mergeDuplicate(repo.records.get(existing), e, source));
      duplicates++;
      continue;
    }
    const id = nextRecordId(new Set(repo.records.keys()));
    const record = createRecord({ id, entry: e, reviewLink: repo.link, sourceId: source,
      publication: library.index.find(e.doi, e.title, e.year), template: repo.settings.template });
    repo.put(record);
    index.add(id, e.doi, e.title, e.year);
    added++;
  }
  await repo.save();
  return { added, duplicates };
}

/**
 * Imports one database export (or another source with `other`), keeps a copy of the file, records the
 * search in 07 - Searches.csv and refreshes the PRISMA flow.
 * @param {object} search
 * @param {string} search.fileName @param {Uint8Array} search.bytes @param {string} search.database
 * @param {string} search.query the exact search string as run @param {string} [search.date] @param {string} [search.filters]
 * @param {boolean} [search.other] count as "other sources", not a database search
 */
export async function importSearch(repo, { fileName, bytes, database, query, date, filters = "", other = false }, library) {
  const entries = parseExport(fileName, decodeExport(bytes));
  if (!entries.length) throw new ReviewError(`No papers found in "${fileName}". Check that it is the export file from the database (CSV, RIS, BibTeX or Web of Science plain text), then try again. Nothing was imported.`);
  const rows = await repo.searches();
  const id = await sourceId(repo, rows);
  const kept = `${id} - ${fileName}`;
  await repo.folder.writeBytes(`${FILES.exports}/${kept}`, bytes);
  const { added, duplicates } = await addEntries(repo, entries, id, library);
  rows.push({ id, kind: other ? "other" : "database", database, date: date || repo.clock.today(), query, filters,
    export: kept, records: entries.length, new: added, duplicates });
  await repo.writeSearches(rows);
  await repo.log("import", `${id} ${database}: ${entries.length} records, ${added} new, ${duplicates} duplicates`);
  const report = await writeReport(repo, library);
  return `${id} ${database}: ${entries.length} records → ${added} new, ${duplicates} duplicate${duplicates === 1 ? "" : "s"} merged (export kept as ${kept})\n${report}`;
}

/** Adds one paper found another way (a reference list, a colleague…) under an "other" source named `via`. */
/**
 * Undoes an import that added no paper of its own (a wrong file, all duplicates): its row leaves 07 - Searches.csv
 * and the PRISMA flow, and the papers it matched lose its source id. Its export stays in 07 - Exports. An import
 * that added papers cannot be undone here: their notes may already hold decisions, and the app deletes no files.
 */
export async function removeSearch(repo, id, library) {
  const rows = await repo.searches();
  const row = rows.find(r => r.id === id);
  if (!row) throw new ReviewError(`There is no search ${id}.`);
  const added = Number(row.new) || 0;
  if (added) throw new ReviewError(`${id} added ${added} paper${added === 1 ? "" : "s"} of its own, so it cannot be undone here. Exclude them in screening if they do not belong, and say so in the report.`);
  let untagged = 0;
  for (const r of repo.records.values()) {
    if (!(r.props.sources ?? []).includes(id)) continue;
    repo.put({ ...r, props: { ...r.props, sources: r.props.sources.filter(s => s !== id) } });
    untagged++;
  }
  await repo.save();
  await repo.writeSearches(rows.filter(r => r.id !== id));
  await repo.log("import", `${id} ${row.database} undone (${row.records} records, none new; export kept as ${row.export})`);
  const report = await writeReport(repo, library);
  return `${id} ${row.database} undone: it no longer counts in the searches or the flow (${untagged} paper${untagged === 1 ? "" : "s"} it matched keep their other sources; the export file stays in 07 - Exports).\n${report}`;
}

export async function addPaper(repo, { title, authors = "", year = "", journal = "", doi = "", via, database = "Other source" }, library) {
  const rows = await repo.searches();
  let row = rows.find(r => r.kind === "other" && r.query === via);
  if (!row) {
    row = { id: await sourceId(repo, rows), kind: "other", database, date: repo.clock.today(), query: via, filters: "", export: "", records: 0, new: 0, duplicates: 0 };
    rows.push(row);
  }
  const { added, duplicates } = await addEntries(repo, [makeEntry({ title, authors, year, journal, doi })], row.id, library);
  for (const [k, v] of [["records", 1], ["new", added], ["duplicates", duplicates]]) row[k] = (parseInt(row[k] || 0, 10) || 0) + v;
  await repo.writeSearches(rows);
  await repo.log("add", `${row.id} (${via}): ${[...title].slice(0, 60).join("")} — ${added ? "new" : "duplicate"}`);
  return `${row.id}: ${added ? "new record" : "already present (source added)"}`;
}

const CHECKED = new WeakMap();   // record properties → result of checkRecord

/**
 * Checks every record (allowed values, reasons) and fills what follows from the decisions.
 * @returns {Promise<{problems: {record: object, text: string}[], updated: number}>}
 */
export async function checkScreening(repo, { write = true } = {}) {
  const reasons = await repo.reasons();
  const problems = [];
  const today = repo.clock.today(), key = `${today}\n${reasons.ta.join("\n")}\n\n${reasons.ft.join("\n")}`;
  for (const record of repo.records.values()) {
    // records are replaced, never changed in place: an unchanged record keeps its result (the page checks after every action)
    let checked = CHECKED.get(record.props);
    if (checked?.key !== key) CHECKED.set(record.props, checked = { key, ...checkRecord(record.props, reasons, today) });
    const { props, problems: found, changed } = checked;
    for (const text of found) problems.push({ record, text });
    if (!changed) continue;
    if (write) repo.put({ ...record, props });
    else repo.records.set(record.id, { ...record, props });
  }
  return { problems, updated: write ? await repo.save() : 0 };
}

/** Checks the screening and writes 14 - PRISMA flow.md. */
export async function writeReport(repo, library = emptyLibrary()) {
  const { problems } = await checkScreening(repo);
  const props = [...repo.records.values()].map(r => r.props);
  const searches = await repo.searches();
  const counts = flowCounts(props, searches);
  await repo.folder.writeText(FILES.flow, prismaFlowNote({ reviewName: repo.name, reviewLink: repo.link, today: repo.clock.today(),
    counts, searches, problems, generator: repo.settings.generator, type: reviewType(await loadState(repo.folder)) }));
  return `PRISMA flow written: ${counts.unique} records, ${counts.taPending} awaiting title/abstract, ` +
    `${counts.ftPending} awaiting full text, ${counts.included} included, ${problems.length} problem(s).`;
}
