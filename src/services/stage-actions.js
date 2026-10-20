/**
 * Use cases of the stages around the records: protocol (write, lock, checks),
 * full-text retrieval, charting, checklist and exports. Each changes the state object it is
 * given; the caller saves it with review-state.saveState().
 * @module services/stage-actions
 */
import { DuplicateIndex, normalizeDoi, yearOf } from "../domain/matching.js";
import { parseExport } from "../domain/importers.js";
import { isIncluded } from "../domain/progress.js";
import { frozenProtocolName, integrityProblems, lockChecks, protocolMarkdown, PROTOCOL_FILE } from "../domain/protocol.js";
import { openalexQuery } from "../domain/queries.js";
import { chars, compareCodePoints, strip } from "../domain/text-rules.js";
import { checklistOf, event, FULLTEXT_DIR, isLocked, reviewType, touch } from "../domain/stages.js";
import { NO_ABSTRACT } from "../domain/vocabulary.js";
import { bibtex, zoteroRis, chartingBase, chartingCsv, checklistEvidence, checklistNote, STAGE_FILES } from "../domain/stage-notes.js";
import * as frontmatter from "../domain/frontmatter.js";
import { APP_GENERATOR, FILES, GUIDE_INCLUDE, GUIDE_REASONS, screeningGuide, upgradeGuide } from "../domain/notes.js";
import { decodeExport, ReviewError } from "./review-commands.js";
import { emptyLibrary } from "./library.js";
import { allWorks } from "./openalex-client.js";
import { STATE_FILE } from "./review-state.js";

const recordStem = r => r.file.split("/").pop().replace(/\.md$/, "");
const generatorOf = repo => repo.settings.generator ?? APP_GENERATOR;
const includedRecords = repo => [...repo.records.values()].filter(r => isIncluded(r.props)).sort((a, b) => compareCodePoints(String(a.props.record_id), String(b.props.record_id)));

/** SHA-256 of bytes as hex (Web Crypto: browsers and Node). */
async function sha256(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** The test set as {note name: properties}. */

// ---------------------------------------------------------------- protocol

/** Writes 05 - Protocol.md from the stages. */
export async function writeProtocol(repo, st) {
  const reasons = await repo.reasons();
  await repo.folder.writeText(PROTOCOL_FILE, protocolMarkdown({ reviewName: repo.name, reviewLink: repo.link, st, ftReasons: reasons.ft, include: reasons.include, generatedBy: generatorOf(repo).stagesBy }));
  touch(st, "methods", repo.clock.now());
  event(st, "methods", "protocol draft regenerated", repo.clock.now());
}

/** Writes the inclusion criteria and exclusion reasons into the screening guide (created when missing; an older guide is upgraded first). */
export async function writeExclusionReasons(repo, ta, ft, include) {
  const folder = repo.folder;
  if (!(await folder.exists(FILES.guide))) await folder.writeText(FILES.guide, screeningGuide(repo.link, repo.settings.generator));
  const text = await folder.readText(FILES.guide);
  let next = frontmatter.replaceList(frontmatter.replaceList(upgradeGuide(text) ?? text, GUIDE_REASONS.ta, ta), GUIDE_REASONS.ft, ft);
  if (include) next = frontmatter.replaceList(next, GUIDE_INCLUDE, include);
  await folder.writeText(FILES.guide, next);
}

/** Freezes the protocol: a registered copy with its checksum; later changes to protected parts are amendments. */
export async function lockProtocol(repo, st, { registration = "" } = {}) {
  if (isLocked(st)) throw new ReviewError(`The protocol is already locked (${st.protocol.locked}).`);
  const day = repo.clock.today(), name = frozenProtocolName(day), reasons = await repo.reasons();
  await repo.folder.writeText(name, protocolMarkdown({ reviewName: repo.name, reviewLink: repo.link, st, ftReasons: reasons.ft, include: reasons.include, frozen: day, generatedBy: generatorOf(repo).stagesBy }));
  Object.assign(st.protocol, { locked: day, file: name, sha256: await sha256(await repo.folder.readBytes(name)),
    registration: strip(registration), snapshot: { ta_reasons: [...reasons.ta], ft_reasons: [...reasons.ft], inclusion_criteria: [...reasons.include] } });
  st.stages.registration = { status: "done", reason: "", updated: repo.clock.now() };
  event(st, "registration", `protocol locked (${name})` + (registration ? `, registration ${registration}` : "")
    + (st.protocol.commit ? `, commit ${chars(st.protocol.commit).slice(0, 10).join("")}` : ""), repo.clock.now());
}

/** What must be in order before locking. */
export const protocolLockChecks = async (repo, st) => lockChecks(st, await repo.reasons());

/** Changes after locking that bypassed the amendment log. */
export async function protocolIntegrity(repo, st) {
  const file = st.protocol.file;
  const hash = isLocked(st) && file && (await repo.folder.exists(file)) ? await sha256(await repo.folder.readBytes(file)) : null;
  return integrityProblems(st, await repo.reasons(), hash);
}

// ---------------------------------------------------------------- retrieval

/** Records waiting for a full text. */
export const retrievalQueue = repo => [...repo.records.values()].filter(r => r.props.ft_decision === "pending" && r.props.pdf_status !== "not-retrieved");

/** Looks up open-access links in OpenAlex for queued records with a DOI. @returns {Promise<number>} links found */
export async function findOpenAccess(repo, st, openalex) {
  const todo = retrievalQueue(repo).filter(r => r.props.doi && !r.props.oa_url);
  const byDoi = new Map(todo.map(r => [normalizeDoi(r.props.doi), r]));
  const dois = [...byDoi.keys()];
  let hits = 0;
  for (let i = 0; i < dois.length; i += 50) {
    for (const w of await allWorks(openalex, { filter: "doi:" + dois.slice(i, i + 50).join("|"), select: "doi,open_access" })) {
      const url = (w.open_access ?? {}).oa_url;
      const r = byDoi.get(normalizeDoi(w.doi));
      const current = r && repo.records.get(r.id);
      if (current && url && !current.props.oa_url) {   // two works with one DOI: the first link counts
        repo.put({ ...current, props: { ...current.props, oa_url: url } });
        hits++;
      }
    }
  }
  await repo.save();
  touch(st, "retrieval", repo.clock.now());
  event(st, "retrieval", `open-access links found for ${hits} of ${todo.length} records`, repo.clock.now());
  return hits;
}

/** Stores a full text under the record's name in 10 - Full texts and marks it found. */
export async function attachPdf(repo, st, recordId, bytes) {
  const r = repo.records.get(recordId);
  const name = `${recordStem(r)}.pdf`;
  await repo.folder.writeBytes(`${FULLTEXT_DIR}/${name}`, bytes);
  repo.put({ ...r, props: { ...r.props, pdf_status: "found", pdf: `[[${name}]]` } });
  await repo.save();
  touch(st, "retrieval", repo.clock.now());
  event(st, "retrieval", `${recordId}: full text attached`, repo.clock.now());
}

/** Sets a record's pdf_status ("found", "not-retrieved" or ""). */
export async function markPdf(repo, st, recordId, status) {
  const r = repo.records.get(recordId);
  repo.put({ ...r, props: { ...r.props, pdf_status: status } });
  await repo.save();
  touch(st, "retrieval", repo.clock.now());
  event(st, "retrieval", `${recordId}: pdf_status ${status}`, repo.clock.now());
}

// ---------------------------------------------------------------- charting, checklist, exports

/** Adds the charting columns to every included record and writes 12 - Charting.base. */
export async function prepareCharting(repo, st) {
  const keys = st.charting.fields.map(f => `chart_${f.name}`);
  let n = 0;
  for (const r of [...repo.records.values()].filter(x => isIncluded(x.props))) {
    const missing = keys.filter(k => !(k in r.props));
    if (!missing.length) continue;
    repo.put({ ...r, props: { ...r.props, ...Object.fromEntries(missing.map(k => [k, ""])) } });
    n++;
  }
  await repo.save();
  await writeChartingBase(repo, st);
  touch(st, "charting", repo.clock.now());
  event(st, "charting", `charting columns added to ${n} included records`, repo.clock.now());
  return n;
}

export const writeChartingBase = (repo, st) => repo.folder.writeText(STAGE_FILES.chartingBase, chartingBase(st, false));

/** Charting table of the included records as CSV in 07 - Exports. @returns {Promise<string>} path */
export async function exportCharting(repo, st) {
  const path = `${FILES.exports}/charting ${repo.clock.today()}.csv`;
  await repo.folder.writeText(path, chartingCsv(st, includedRecords(repo).map(r => r.props)));
  event(st, "report", `charting table exported (${path.split("/").pop()})`, repo.clock.now());
  return path;
}

/** A record's properties with the abstract and keywords from its note body (for reference managers). */
function withAbstract(r) {
  const section = name => {
    const at = r.body.indexOf(`## ${name}`);
    if (at < 0) return "";
    const rest = r.body.slice(at + name.length + 3);
    return strip(rest.slice(0, rest.search(/\n#{1,2} |$/)));
  };
  const abstract = section("Abstract");
  return { ...r.props, abstract: abstract === NO_ABSTRACT ? "" : abstract,
    keywords: section("Keywords").split(/\s*;\s*/).filter(Boolean).join("; ") };
}

/** The included records as BibTeX in 07 - Exports. @returns {Promise<string>} path */
export async function exportBibtex(repo, st) {
  const path = `${FILES.exports}/included ${repo.clock.today()}.bib`;
  const records = includedRecords(repo).map(withAbstract);
  await repo.folder.writeText(path, bibtex(records));
  event(st, "report", `BibTeX of ${records.length} included sources exported (${path.split("/").pop()})`, repo.clock.now());
  return path;
}

/** The included records as RIS for Zotero (tags, citation keys, linked full texts) in 07 - Exports. @returns {Promise<string>} path */
export async function exportZotero(repo, st) {
  const path = `${FILES.exports}/included for Zotero ${repo.clock.today()}.ris`;
  const records = includedRecords(repo).map(withAbstract);
  await repo.folder.writeText(path, zoteroRis(records, repo.name));
  event(st, "report", `RIS for Zotero of ${records.length} included sources exported (${path.split("/").pop()})`, repo.clock.now());
  return path;
}

/** Ticks an item of the review's checklist (PRISMA-ScR) and records where the manuscript reports it. */
export function setChecklist(st, item, location, done, now) {
  checklistOf(st)[String(item)] = { location: strip(location), done: Boolean(done) };
  touch(st, "report", now);
}

/** Evidence the tool sees for each checklist item. */
export async function checklistAuto(repo, st) {
  return checklistEvidence({ st, searches: await repo.searches(), records: [...repo.records.values()].map(r => r.props),
    guideExists: await repo.folder.exists(FILES.guide), flowExists: await repo.folder.exists(FILES.flow) });
}

/** Writes the review's checklist note (14 - PRISMA-ScR checklist.md). */
export async function writeChecklist(repo, st) {
  const evidence = await checklistAuto(repo, st);
  await repo.folder.writeText(reviewType(st).checklistFile, checklistNote({ reviewName: repo.name, reviewLink: repo.link, st, today: repo.clock.today(), evidence }));
}

export { STATE_FILE };
