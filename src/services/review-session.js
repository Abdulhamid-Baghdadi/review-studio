/**
 * One open review and every action the reviewer can take on it (what each button in the app does).
 * A session holds the records and the review state in memory, and saves both after each action. Changes to protected parts of a locked protocol throw AmendmentRequired;
 * the UI asks for the reason and repeats the action with it.
 * @module services/review-session
 */
import { aiMode, setAiMode } from "../domain/ai-steps.js";
import { PROTOCOL_FILE } from "../domain/protocol.js";
import { buildQuery } from "../domain/queries.js";
import { compareCodePoints, splitWords, strip } from "../domain/text-rules.js";
import { amend, event, FULLTEXT_DIR, guardedChange, isLocked, needsAmendment, sameSession, sameValue, saveQuestions, setStatus, touch } from "../domain/stages.js";
import { checkScreening, importSearch, addPaper, removeSearch, writeReport, ReviewError } from "./review-commands.js";
import { fetchLibraryWorks, planLibraryCitations, writeLibraryCitations } from "./library-citations.js";
import { addKeptToLibrary, applyLibrarySync, emptyLibrary, planLibrarySync } from "./library.js";
import { loadState, saveState } from "./review-state.js";
import { HOW } from "../domain/decision-log.js";
import { writePackage } from "./review-package.js";
import { ReviewRepository } from "./review-repository.js";
import * as actions from "./stage-actions.js";
import * as screening from "./screening.js";
import { recordsWithoutFullText, scanForPdfs } from "./local-pdfs.js";

/** A protected part of a locked protocol was changed without giving the reason for the amendment. */
export class AmendmentRequired extends Error {
  /** @param {string} what e.g. "keyword blocks" */
  constructor(what) { super(`The protocol is locked: changing the ${what} is an amendment. Give the reason.`); this.what = what; }
}

/**
 * @typedef {object} SessionDeps
 * @property {import("../ports/folder.js").Clock} clock
 * @property {import("./review-repository.js").ReviewSettings} settings
 * @property {import("./library.js").Library} [library]
 * @property {import("./openalex-client.js").OpenAlexClient} [openalex]
 * @property {boolean} [devMode] protocol locks lifted (changes still logged)
 */

export class ReviewSession {
  /** @param {ReviewRepository} repo @param {object} st @param {SessionDeps} deps */
  constructor(repo, st, deps) {
    this.repo = repo;
    this.st = st;
    this.library = deps.library ?? emptyLibrary();
    this.openalex = deps.openalex ?? null;
    this.devMode = Boolean(deps.devMode);
  }

  /**
   * Opens a review folder. @param {import("../ports/folder.js").Folder} folder
   * @param {SessionDeps & {onProgress?: (done: number, total: number) => void}} deps
   */
  static async open(folder, deps) {
    const repo = await ReviewRepository.open(folder, deps.clock, deps.settings, { onProgress: deps.onProgress });
    await repo.logDecisions();          // decisions changed elsewhere since the last row (or the first rows of a new log)
    await repo.upgradeNotes();          // older record notes with short property names → full words
    await repo.upgradeBases();          // older .base files that only worked from the vault the review was made in
    return new ReviewSession(repo, await loadState(folder), deps);
  }

  /** Who the reviewer is in the decision log: the initials from the review settings. */
  get reviewer() { return this.repo.settings.reviewer || "reviewer"; }

  get now() { return this.repo.clock.now(); }
  get today() { return this.repo.clock.today(); }

  /** Saves the review state (and the notes written from it). */
  save() { return saveState(this.repo, this.st); }

  /** Re-reads the records from the folder (after changes made outside the session, e.g. in Obsidian). */
  async reload() {
    this.repo = await ReviewRepository.open(this.repo.folder, this.repo.clock, this.repo.settings);
    await this.repo.logDecisions();
    this.st = await loadState(this.repo.folder);
  }

  #protected() { return needsAmendment(this.st, this.devMode); }

  /** Replaces a protected part of the state, asking for an amendment reason when the protocol is locked. */
  #guarded(key, value, amendment, what) {
    if (this.#protected() && !sameValue(this.st[key], value) && !strip(amendment ?? "")) throw new AmendmentRequired(what);
    return guardedChange(this.st, key, value, { reason: amendment ?? "", devMode: this.devMode, now: this.now });
  }

  #requireOpenalex() {
    if (!this.openalex) throw new ReviewError("OpenAlex is not available in this session.");
    return this.openalex;
  }

  /** After decisions changed: save the records, check the screening, and log the changed decisions (who and how). */
  async #afterScreeningChange(changed, how) {
    await this.repo.save();
    await checkScreening(this.repo);
    touch(this.st, "screening", this.now);
    await this.repo.logDecisions({ ids: changed, by: this.reviewer, how });
  }

  // ------------------------------------------------------------ settings and stages

  /** Developer mode lifts the protocol locks for this session; every change is still logged. */
  async setDevMode(on) {
    this.devMode = Boolean(on);
    event(this.st, "protocol", "developer mode " + (on ? "switched on: locks lifted" : "switched off"), this.now);
    await this.save();
    return "Developer mode " + (on ? "on — locked parts can be edited without amendments." : "off.");
  }

  async setAiMode(step, mode, amendment = "") {
    if (this.#protected() && aiMode(this.st, step) !== mode && !strip(amendment)) throw new AmendmentRequired("AI assistance");
    const changed = setAiMode(this.st, step, mode, { reason: amendment, devMode: this.devMode, now: this.now });
    if (changed && (await this.repo.folder.exists(PROTOCOL_FILE))) await actions.writeProtocol(this.repo, this.st);
    await this.save();
  }

  async setStageStatus(stage, status, reason = "") {
    setStatus(this.st, stage, status, reason, this.now);
    await this.save();
  }

  /** @param {{population: string, concept: string, context: string, main: string, sub: string[]}} q */
  async saveQuestions(q, why = "", amendment = "") {
    if (this.#protected() && !amendment && ["population", "concept", "context", "main", "sub"].some(k => !sameValue(this.st.questions[k], q[k]))) {
      throw new AmendmentRequired("review questions");
    }
    const changed = saveQuestions(this.st, { ...q, why, amendment }, { devMode: this.devMode, now: this.now });
    await this.save();
    return changed ? "New version saved." : "Nothing changed.";
  }

  // ------------------------------------------------------------ concepts and search strings

  /** @param {{name: string, role?: string, terms: string[]}[]} concepts */
  async saveConcepts(concepts, why = "", amendment = "") {
    const next = concepts.filter(c => strip(c.name)).map(c => ({ name: strip(c.name), role: c.role ?? "AND", terms: c.terms.map(strip).filter(Boolean) }));
    const old = this.st.concepts;
    if (this.#guarded("concepts", next, amendment, "keyword blocks")) {
      // saved while typing: a new version only when an editing session starts (or for an amendment)
      if (strip(amendment ?? "") || !sameSession(this.st.concepts_edited, this.now)) {
        if (old.length) (this.st.concepts_history ??= []).push({ when: this.now, why: strip(why || amendment || ""), concepts: old });
        event(this.st, "concepts", `keyword blocks saved` + (strip(why || "") ? ` — ${strip(why)}` : ""), this.now);
      }
      this.st.concepts_edited = this.now;
      touch(this.st, "concepts", this.now);
    }
    await this.save();
    return "Concepts saved.";
  }

  /** Search strings for a concept table that is not saved yet. */
  previewQueries(concepts) {
    const draft = { ...this.st, concepts };
    return Object.fromEntries(this.st.queries.databases.map(db => [db, buildQuery(draft, db)]));
  }

  async saveDatabases(databases, amendment = "") {
    const next = { ...this.st.queries, databases: databases.map(strip).filter(Boolean) };
    if (this.#guarded("queries", next, amendment, "list of databases")) {
      touch(this.st, "concepts", this.now);
      event(this.st, "concepts", "databases: " + next.databases.join(", "), this.now);
    }
    await this.save();
  }

  /** A search string edited by hand; `text` null returns to the generated string. */
  async saveManualQuery(database, text, amendment = "") {
    const manual = { ...this.st.queries.manual };
    if (text === null || text === undefined) delete manual[database];
    else manual[database] = text;
    if (this.#guarded("queries", { ...this.st.queries, manual }, amendment, `${database} search string`)) {
      touch(this.st, "concepts", this.now);
      event(this.st, "concepts", `${database} string ` + (text !== null && text !== undefined ? "edited by hand" : "reset to generated"), this.now);
    }
    await this.save();
  }

  // ------------------------------------------------------------ protocol

  /** @param {Record<string, string>} text sections by key @param {{author?: string, generate?: boolean, amendment?: string}} options */
  async saveProtocolText(text, { author = "user", generate = false, amendment = "" } = {}) {
    const before = { ...this.st.protocol_text };
    const meta = (this.st.protocol_meta ??= {});
    for (const [k, v] of Object.entries(text)) if ((v || "") !== (before[k] || "")) meta[k] = { by: author, when: this.now };
    if (this.#guarded("protocol_text", text, amendment, "protocol text")) {
      const where = Object.keys(text).some(k => k !== "eligibility" && (text[k] || "") !== (before[k] || "")) ? "methods" : "protocol";   // the rationale is on Inclusion rules
      touch(this.st, where, this.now);
      event(this.st, where, "protocol sections saved", this.now);
    }
    let msg = "";
    if (generate) { await actions.writeProtocol(this.repo, this.st); msg = "Protocol.md generated."; }
    await this.save();
    return msg;
  }

  async approveSection(key) {
    (this.st.protocol_meta ??= {})[key] = { by: "approved", when: this.now };
    event(this.st, "protocol", `section '${key}' approved by the reviewer`, this.now);
    await actions.writeProtocol(this.repo, this.st);
    await this.save();
  }

  async supervisorReview(by, when = "") {
    const name = strip(by ?? "");
    this.st.supervisor_review = name ? { by: name, when: when || this.today } : {};
    event(this.st, "protocol", name ? `protocol reviewed by ${name}` : "supervisor review removed", this.now);
    await this.save();
  }

  /**
   * Saves the inclusion criteria and exclusion reasons in the screening guide (an amendment of the criteria once
   * locked). `include` undefined keeps the inclusion criteria as they are.
   */
  async saveReasons(ta, ft, amendment = "", include) {
    const nextTa = ta.map(strip).filter(Boolean), nextFt = ft.map(strip).filter(Boolean);
    const current = await this.repo.reasons();
    const nextInc = include === undefined ? [...current.include] : include.map(strip).filter(Boolean);
    if (!sameValue([[...current.ta], [...current.ft], [...current.include]], [nextTa, nextFt, nextInc])) {
      if (this.#protected()) {
        if (!strip(amendment)) throw new AmendmentRequired("inclusion and exclusion rules");
        amend(this.st, "criteria", amendment, this.now);
      } else if (isLocked(this.st) && this.devMode) {
        event(this.st, "protocol", "developer mode: inclusion and exclusion rules changed without an amendment", this.now);
      }
      await actions.writeExclusionReasons(this.repo, nextTa, nextFt, nextInc);
      event(this.st, "protocol", "inclusion and exclusion rules edited", this.now);
    }
    await this.save();
    return "Inclusion and exclusion rules saved.";
  }

  /** What must be in order before locking. */
  lockChecks() { return actions.protocolLockChecks(this.repo, this.st); }

  /** Changes after locking that bypassed the amendment log. */
  integrityProblems() { return actions.protocolIntegrity(this.repo, this.st); }

  async lockProtocol(registration = "") {
    await actions.writeProtocol(this.repo, this.st);
    await actions.lockProtocol(this.repo, this.st, { registration });
    await this.save();
    return "Protocol locked.";
  }

  // ------------------------------------------------------------ searches and screening

  /** Imports a database export; before the protocol is locked (or registration skipped) only with `force`. */
  async importSearch(search, { force = false } = {}) {
    if (!isLocked(this.st) && this.st.stages.registration.status !== "skipped" && !force) throw new ReviewError("NOT_LOCKED");
    const msg = await importSearch(this.repo, search, this.library);
    touch(this.st, "searches", this.now);
    event(this.st, "searches", `${search.database} export imported`, this.now);
    await this.save();
    return msg;
  }

  addPaper(paper) { return addPaper(this.repo, paper, this.library); }

  /** Undoes an import that added no paper of its own (see review-commands removeSearch); noted in the timeline. */
  async removeSearch(id) {
    const msg = await removeSearch(this.repo, id, this.library);
    event(this.st, "searches", `import ${id} undone`, this.now);
    await this.save();
    return msg;
  }

  /**
   * One screening decision (with the reason when excluding, and optionally the notes). With `undo`, it puts back the
   * decision a record had before the reviewer's last one, and the decision log says so.
   */
  async decide(recordId, stage, decision, { reason = "", notes, undo = false } = {}) {
    const changed = screening.decide(this.repo, recordId, stage, decision, { reason, notes });
    await this.#afterScreeningChange(changed, undo ? HOW.undo : HOW.hand);
    await this.save();
  }

  /** Confirms rule-based pre-sorted records as excluded (each with its pre-sort code, else `reason`). */
  async bulkDecide(ids, reason = "") {
    const changed = screening.confirmPresorted(this.repo, ids, reason);
    await this.#afterScreeningChange(changed, HOW.rule);
    event(this.st, "screening", `${changed.size} rule-based pre-sorted records confirmed as excluded by the reviewer`, this.now);
    await this.save();
    return `${changed.size} record(s) excluded.`;
  }

  /** Saves a reviewed batch of AI-suggested decisions as the reviewer's; each record notes whether it was changed. */
  async applyDecisions(items, stage = "ta") {
    const changed = screening.applySuggestions(this.repo, items, stage);
    await this.#afterScreeningChange(changed, HOW.ai);
    event(this.st, "screening", `batch of ${changed.size} AI-suggested ${stage === "ft" ? "full-text" : "title/abstract"} decisions reviewed and confirmed by the reviewer`, this.now);
    await this.save();
    return `${changed.size} decision(s) saved.`;
  }

  /** Returns pre-sorted records to the normal screening queue. */
  async clearPresort(ids) {
    screening.clearPresort(this.repo, ids);
    await this.repo.save();
    event(this.st, "screening", `${ids.length} pre-sorted record(s) returned to manual screening`, this.now);
    await this.save();
    return `${ids.length} record(s) back in the normal queue.`;
  }

  /** Edits the fields a reviewer may set directly: charting values, notes, appraisal, PDF status, open-access link. */
  async setRecord(recordId, fields) {
    const r = this.repo.records.get(recordId);
    const allowed = Object.entries(fields).filter(([k]) => k.startsWith("chart_") || ["notes", "appraisal", "appraisal_note", "appraisal_by", "pdf_status", "oa_url"].includes(k));
    this.repo.put({ ...r, props: { ...r.props, ...Object.fromEntries(allowed) } });
    await this.repo.save();
    if (Object.keys(fields).some(k => k.startsWith("chart_"))) touch(this.st, "charting", this.now);
    await this.save();
  }

  async check() {
    const { problems, updated } = await checkScreening(this.repo);
    return `${this.repo.records.size} records checked, ${updated} updated (full-text queue / screening date).` +
      problems.map(p => `\n  ${p.record.id}: ${p.text}`).join("") + "\n" +
      (problems.length ? `${problems.length} problem(s) to fix in Obsidian.` : "No problems.");
  }

  report() { return writeReport(this.repo, this.library); }

  // ------------------------------------------------------------ retrieval

  async findOpenAccess() {
    const n = await actions.findOpenAccess(this.repo, this.st, this.#requireOpenalex());
    await this.save();
    return `Open-access links found for ${n} record(s).`;
  }

  async attachPdf(recordId, bytes) {
    await actions.attachPdf(this.repo, this.st, recordId, bytes);
    await this.save();
  }

  /**
   * Looks for full texts already on the PC: matches the PDFs in a folder (and its subfolders) to records
   * waiting for one. Nothing is copied until the reviewer confirms (attachFound).
   * @param {import("../ports/folder.js").Folder} pdfFolder @param {import("../ports/pdf-text.js").PdfText} pdfText
   * @param {{cache?: Map<string, object>, onProgress?: (done: number, total: number) => void}} [options]
   */
  async scanPdfs(pdfFolder, pdfText, options = {}) {
    const need = await recordsWithoutFullText(this.repo);
    const result = await scanForPdfs(pdfFolder, need, pdfText, options);
    for (const m of result.matches) Object.assign(m, { title: need.get(m.record_id).title, year: need.get(m.record_id).year });
    this.st.pdf_folders = [pdfFolder.name, ...(this.st.pdf_folders ?? []).filter(f => f !== pdfFolder.name)].slice(0, 5);
    await this.save();
    return { ...result, message: `${result.pdfs} PDF(s) read: ${result.matches.length} match(es) for ${result.records} record(s) without a full text.` };
  }

  /** Copies the confirmed matches into the review under each record's name. @param {{record_id: string, pdf: string}[]} items */
  async attachFound(items, pdfFolder) {
    let n = 0;
    for (const it of items) {
      if (!this.repo.records.has(it.record_id) || !(await pdfFolder.exists(it.pdf))) continue;
      await actions.attachPdf(this.repo, this.st, it.record_id, await pdfFolder.readBytes(it.pdf));
      n++;
    }
    event(this.st, "retrieval", `${n} full text(s) attached from a local folder (${pdfFolder.name}), each match confirmed by the reviewer`, this.now);
    await this.save();
    return `${n} PDF(s) copied into ${FULLTEXT_DIR}.`;
  }

  async markPdf(recordId, status) {
    await actions.markPdf(this.repo, this.st, recordId, status);
    await this.save();
  }

  // ------------------------------------------------------------ charting, report

  /** @param {{name: string, description?: string}[]} fields */
  async saveFields(fields, amendment = "") {
    const next = fields.filter(f => strip(f.name)).map(f => ({ name: splitWords(strip(f.name).toLowerCase()).join("_"), description: f.description ?? "" }));
    if (this.#guarded("charting", { ...this.st.charting, fields: next }, amendment, "charting form")) {
      touch(this.st, "charting", this.now);
      event(this.st, "charting", `charting form saved (${next.length} fields)`, this.now);
    }
    await this.save();
  }

  async prepareCharting() {
    const n = await actions.prepareCharting(this.repo, this.st);
    await this.save();
    return `Columns added to ${n} included record(s).`;
  }

  async setChecklistItem(n, location = "", done = false) {
    actions.setChecklist(this.st, n, location, done, this.now);
    await actions.writeChecklist(this.repo, this.st);
    await this.save();
  }

  async writeChecklist() {
    await actions.writeChecklist(this.repo, this.st);
    await this.save();
    return "Checklist note written.";
  }

  /** @param {"bib"|"ris"|"csv"} kind @returns {Promise<{message: string, path: string}>} */
  async export(kind) {
    const path = kind === "bib" ? await actions.exportBibtex(this.repo, this.st)
      : kind === "ris" ? await actions.exportZotero(this.repo, this.st)
      : await actions.exportCharting(this.repo, this.st);
    await this.save();
    return { message: `Exported ${path.split("/").pop()}`, path };
  }

  /**
   * Export to the Obsidian library: the included papers become publication notes (from the template; a paper
   * already there only gets this review in `included_in`), then the citations between library papers are updated
   * (`cites`). Without OpenAlex the export still happens and the message says so.
   */
  async exportToLibrary(template, { status = "" } = {}) {
    const added = await this.addToLibrary(template, { status });
    try {
      const c = await this.libraryCitations({ apply: true });
      return `${added} Citations: ${c.links} links between ${c.found} library papers, ${c.written} note(s) updated.`;
    } catch (e) {
      return `${added} Citations not updated (${e.message}); use “Check citations” later.`;
    }
  }

  /** Copies the included papers to the library (publication template text needed for new notes). */
  async addToLibrary(template, { status = "" } = {}) {
    const done = await addKeptToLibrary(this.repo, this.st, this.library, { template, status });
    await this.save();
    return "Library: " + ([...done].map(([k, v]) => `${v} ${k}`).join(", ") || "nothing to add") + ".";
  }

  /**
   * Citations of the library's papers (`cites` with links and DOIs; an old `cited_by` is removed). Without `apply` it only asks OpenAlex and says what would change; with `apply` it writes those notes
   * (from the reference lists fetched for the preview, so a second click costs no OpenAlex requests).
   */
  async libraryCitations({ apply = false, onProgress } = {}) {
    if (!this.library.folder) throw new ReviewError("Choose a library folder first.");
    if (!apply || !this.#citationWorks) this.#citationWorks = await fetchLibraryWorks(this.library, this.#requireOpenalex(), onProgress);
    const { summary, changes } = await planLibraryCitations(this.library, this.#citationWorks);
    if (!apply) return { ...summary, changed: changes.length, written: 0 };
    const written = await writeLibraryCitations(this.library, changes);
    event(this.st, "report", `library citations updated from OpenAlex: ${summary.links} links between ${summary.found} of ${summary.publications} papers, ${written} note(s) written`, this.now);
    this.#citationWorks = null;
    await this.save();
    return { ...summary, changed: changes.length, written };
  }

  #citationWorks = null;

  /** Marks in the library which publications this review considered and included. */
  async sync(apply = false) {
    const plan = planLibrarySync(this.repo, this.library);
    if (apply) await applyLibrarySync(this.library, this.repo, plan);
    return plan;
  }

  /** The logged decisions of one record, oldest first. */
  decisionHistory(recordId) { return this.repo.decisionLog.history(recordId); }

  /** Checks the decision log's hash chain. */
  verifyDecisionLog() { return this.repo.decisionLog.verify(); }

  /**
   * Writes the review package (07 - Exports/Review package <date>/ and its ZIP), after refreshing the flow,
   * the checklist and the protocol so that it holds their current versions.
   */
  async reviewPackage() {
    await writeReport(this.repo, this.library);
    await actions.writeChecklist(this.repo, this.st);
    if (await this.repo.folder.exists(PROTOCOL_FILE)) await actions.writeProtocol(this.repo, this.st);
    await this.save();
    const p = await writePackage(this.repo, this.st);
    event(this.st, "report", `review package made: ${p.files} files, decision log ${p.log.rows} rows (${p.log.intact ? "chain intact" : "chain broken at row " + p.log.brokenAt})`, this.now);
    await this.save();
    return { message: `Review package written to ${p.dir}: ${p.files} files with their SHA-256 in MANIFEST.md.` +
      (p.log.intact ? "" : ` Warning: the decision log's chain is broken at row ${p.log.brokenAt}.`), path: p.zipPath };
  }

  /** Records sorted by id, for the UI. */
  records() { return [...this.repo.records.values()].sort((a, b) => compareCodePoints(a.id, b.id)); }
}
