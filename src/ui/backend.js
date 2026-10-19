/**
 * The page's backend in the browser: answers the requests the Scoping Review Workbench page makes (state, help,
 * actions, uploads, downloads, folders) with a ReviewSession on a folder the user picked. Replaces a
 * server; the page itself is unchanged apart from calling this object instead of fetch().
 * @module ui/backend
 */
import { browserFolder, requestAccess } from "../adapters/browser-folder.js";
import { fixedSettings, forgetReview, recentReviews, rememberFixedSettings, rememberReview } from "../adapters/browser-store.js";
import { fetchHttp } from "../adapters/fetch-http.js";
import { pdfjsText } from "../adapters/pdfjs-text.js";
import { AmendmentRequired, emptyLibrary, openLibrary, OpenAlexClient, ReviewSession } from "../index.js";
import { recordView, snapshot } from "./view-model.js";

/** What makes a folder a review folder (any of these). */
const REVIEW_MARKERS = ["review_state.json", "08 - Records", "07 - Searches.csv"];

const DRAFT_DIR = "Draft review records";
const EXAMPLE_DIR = "Example review records";

/** Copies every file and folder of `from` into `to` (directory handles). */
async function copyFolder(from, to) {
  for await (const [name, item] of from.entries()) {
    if (item.kind === "directory") await copyFolder(item, await to.getDirectoryHandle(name, { create: true }));
    else {
      const out = await (await to.getFileHandle(name, { create: true })).createWritable();
      await out.write(await item.getFile());
      await out.close();
    }
  }
}

const extension = path => (/\.[^./]+$/.exec(path)?.[0] ?? "").toLowerCase();

/** A JSON answer as the page expects from the server. */
const answer = (status, body) => ({ status, ok: status < 400, body });

/** Read access to a file the user chose (asks once per visit when needed). */
async function readAccess(handle) {
  if (typeof handle.queryPermission !== "function") return true;
  return (await handle.queryPermission({ mode: "read" })) === "granted" || (await handle.requestPermission({ mode: "read" })) === "granted";
}

/**
 * Access to a folder or file chosen in Review settings, without failing: when the review opens straight from the
 * address bar there was no click yet, and Chrome only asks for a permission after one ("user activation").
 */
const optional = async ask => { try { return await ask(); } catch { return false; } };

export class Backend {
  /** @type {ReviewSession|null} */ session = null;
  /** @type {import("../adapters/browser-store.js").SavedReview|null} */ entry = null;
  #uploads = new Map();       // upload token -> File
  #pdfFolders = new Map();    // folder name -> handle (folders scanned for PDFs in this visit)
  #lastPdfFolder = null;
  #stamp = null;              // when review_state.json was last written by this app (or read)
  #busy = 0;                  // actions running (no re-reading meanwhile)

  /**
   * @param {object} p
   * @param {object} p.help help texts (web/help.json) @param {{record: string, publication: string}} p.templates note templates
   * @param {object} p.pdfjs the pdf.js module
   * @param {() => Promise<{files: Record<string, string>, binary: Record<string, string>}>} [p.example] loads the finished example review
   */
  constructor({ help, templates, pdfjs, example }) {
    this.help = help;
    this.loadExample = example;
    this.templates = templates;
    this.pdfText = pdfjsText(pdfjs);
    this.openalex = new OpenAlexClient({ http: fetchHttp() });
  }

  // ------------------------------------------------------------ reviews

  /** Is this folder a review folder? */
  static async isReviewFolder(handle) {
    const folder = browserFolder(handle);
    for (const m of REVIEW_MARKERS) if (await folder.exists(m)) return true;
    return false;
  }

  /**
   * Opens a remembered review (asks for access; needs a click).
   * @param {{onProgress?: (done: number, total: number) => void}} [options]
   */
  async open(entry, { onProgress } = {}) {
    if (!(await requestAccess(entry.handle))) {
      throw new Error("Chrome did not allow the app to edit files in this folder. Click the folder icon in the address bar (or Site settings → File editing) and allow it, then try again.");
    }
    const s = entry.settings ?? {};
    const library = await this.#library(s);
    this.#settingsConnected = Boolean(library.folder || !s.library);
    const clock = { today: () => new Date().toLocaleDateString("sv"), now: () => new Date().toLocaleString("sv").slice(0, 16) };
    this.session = await ReviewSession.open(browserFolder(entry.handle), {
      clock, library, openalex: this.openalex, devMode: false, onProgress,
      settings: { name: s.name || entry.name.replace(/ records$/, ""), recordsPath: s.recordsPath || `${entry.name}/08 - Records`, template: this.templates.record,
        reviewer: s.reviewer || "" },
    });
    this.entry = entry.draft || entry.example ? entry : await rememberReview(entry.handle, s);
    if (!(await this.session.repo.folder.exists("review_state.json"))) {      // a new review: its first files
      await this.session.repo.log("init", "review workspace created");
      await this.session.save();
    }
    this.#stamp = await this.#stateStamp();
    return this.session;
  }

  /**
   * The library and the publication template chosen in Review settings, as far as the browser allows access now
   * (an empty library otherwise; they are asked for again on the next click, see #connectSettings).
   */
  async #library(s) {
    let library = emptyLibrary();
    if (s.library && (await optional(() => requestAccess(s.library)))) library = await openLibrary(browserFolder(s.library));
    if (library.folder && s.libraryPdfs && (await optional(() => requestAccess(s.libraryPdfs)))) library.pdfFolder = browserFolder(s.libraryPdfs);
    this.publicationTemplate = null;                    // the vault's own template, when one was chosen in the settings
    if (s.publicationTemplate && (await optional(() => readAccess(s.publicationTemplate)))) this.publicationTemplate = await (await s.publicationTemplate.getFile()).text();
    return library;
  }

  /** On the first action after opening without access (a click: Chrome may ask now), connects the library. */
  async #connectSettings() {
    if (this.#settingsConnected || !this.session) return;
    this.#settingsConnected = true;                     // asked once per opening; Review settings can choose again
    const library = await this.#library(this.entry?.settings ?? {});
    if (library.folder) this.session.library = library;
  }

  #settingsConnected = true;

  /** Lets the user pick a review folder (or an empty folder for a new review) and remembers it. */
  async pickFolder() {
    // read access first; editing is asked for separately (open), so each refusal gets its own message
    const handle = await window.showDirectoryPicker({ id: "review" });
    return rememberReview(handle);
  }

  /** A new review: a folder "<name> records" inside the folder the user picks, remembered. @returns {Promise<object>} its entry */
  async newReview(name) {
    const parent = await window.showDirectoryPicker({ id: "parent", mode: "readwrite" });
    const handle = await parent.getDirectoryHandle(`${name} records`, { create: true });
    return rememberReview(handle, { recordsPath: `${name} records/08 - Records` });
  }

  /** The review folders this browser opened before, most recent first. */
  recentReviews() { return recentReviews(); }

  /** Takes a review off the list of recent reviews (its folder stays as it is). */
  forgetReview(id) { return forgetReview(id); }

  /** Takes the review folder named `name` off this browser's list; the draft and the example stay. @returns {Promise<boolean>} */
  async forgetReviewNamed(name) {
    const entry = await this.#reviewByName(name);
    if (!entry || entry.draft || entry.example) return false;
    await forgetReview(entry.id);
    return true;
  }

  /**
   * Saves the Review settings of the open review and opens it again with them. The draft and the example have no
   * folder of their own: their settings are kept apart and the page stays as it is; a folder's settings are kept
   * with the folder, and the page is loaded again.
   * @returns {Promise<{reload: boolean}>}
   */
  async saveSettings(settings) {
    const entry = this.entry;
    if (entry.draft || entry.example) {
      await rememberFixedSettings(entry.id, settings);
      await this.open({ ...entry, settings });
      return { reload: false };
    }
    await this.open(await rememberReview(entry.handle, settings));
    return { reload: true };
  }

  /** Names for the review menu: the draft, then the folders opened before. */
  async reviewNames() {
    return [Backend.DRAFT, ...(this.loadExample ? [Backend.EXAMPLE] : []), ...(await recentReviews()).map(r => r.name)];
  }

  async #reviewByName(name) {
    if (name === Backend.DRAFT) return this.draftEntry();
    if (name === Backend.EXAMPLE) return this.exampleEntry();
    return (await recentReviews()).find(r => r.name === name) ?? null;
  }

  // ------------------------------------------------------------ the draft review

  /** The menu name of the draft: a review kept in the browser's own storage until it is saved to a folder. */
  static DRAFT = "✏️ Draft (in this browser)";

  /** The draft review: needs no folder and no permission, so the app can open on it straight away. */
  async draftEntry() {
    const handle = await (await navigator.storage.getDirectory()).getDirectoryHandle(DRAFT_DIR, { create: true });
    return { id: "draft", name: Backend.DRAFT, handle, draft: true, settings: { ...(await fixedSettings("draft")), name: "Draft review", recordsPath: `${DRAFT_DIR}/08 - Records` } };
  }

  // ------------------------------------------------------------ the finished example

  /** The menu name of the finished example review (web/example, built by scripts/build-example.js). */
  static EXAMPLE = "📘 Finished example";

  /**
   * The finished example: copied fresh into the browser's own storage each time it is opened, so whatever a
   * visitor changes in it is gone the next time.
   */
  async exampleEntry() {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(EXAMPLE_DIR, { recursive: true }).catch(() => {});
    const handle = await root.getDirectoryHandle(EXAMPLE_DIR, { create: true });
    const folder = browserFolder(handle), ex = await this.loadExample();
    for (const [path, text] of Object.entries(ex.files)) await folder.writeText(path, text);
    for (const [path, b64] of Object.entries(ex.binary ?? {})) await folder.writeBytes(path, Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    await Promise.all(Object.entries(ex.linked ?? {}).map(async ([path, file]) => folder.writeBytes(path, new Uint8Array(await ex.fetchLinked(file)))));
    return { id: "example", name: Backend.EXAMPLE, handle, example: true, settings: { reviewer: "EX", ...(await fixedSettings("example")), name: "Example review", recordsPath: `${EXAMPLE_DIR}/08 - Records` } };
  }

  /**
   * Copies the finished example into a folder the user picks ("Example review records"), e.g. to open it in
   * Obsidian, and opens that copy: from then on it is a review of their own.
   * @returns {Promise<object>} the copy's entry
   */
  async saveExampleCopy() {
    if (!this.entry?.example) throw new Error("Open the finished example first.");
    const parent = await window.showDirectoryPicker({ id: "parent", mode: "readwrite" });
    const handle = await parent.getDirectoryHandle(EXAMPLE_DIR, { create: true });
    for await (const _ of handle.keys()) throw new Error(`"${EXAMPLE_DIR}" already exists there and is not empty. Choose another place.`);
    await copyFolder(this.entry.handle, handle);
    const entry = await rememberReview(handle, { recordsPath: `${EXAMPLE_DIR}/08 - Records` });
    await this.open(entry);
    return this.entry;
  }

  /**
   * Saves the draft as "<name> records" in a folder the user picks, opens that folder and empties the draft.
   * @returns {Promise<object>} the saved review's entry
   */
  async saveDraft(name) {
    const parent = await window.showDirectoryPicker({ id: "parent", mode: "readwrite" });
    const handle = await parent.getDirectoryHandle(`${name} records`, { create: true });
    for await (const _ of handle.keys()) throw new Error(`"${name} records" already exists there and is not empty. Choose another name or place.`);
    const draft = await this.draftEntry();
    await copyFolder(draft.handle, handle);
    const entry = await rememberReview(handle, { recordsPath: `${name} records/08 - Records` });
    await this.open(entry);
    await this.session.save();                         // the notes written from the state, now with the review's name
    for await (const key of draft.handle.keys()) await draft.handle.removeEntry(key, { recursive: true });
    return this.entry;
  }

  // ------------------------------------------------------------ requests from the page

  /** GET /api/help, /api/state?review=…, /api/reviews */
  async get(url) {
    const u = new URL(url, "http://app.local/");          // only the path and query matter
    if (u.pathname.endsWith("/api/help")) return this.help;
    if (u.pathname.endsWith("/api/reviews")) return { reviews: await this.reviewNames() };
    if (u.pathname.endsWith("/api/state")) {
      const name = u.searchParams.get("review");
      if (name && name !== this.entry?.name) {
        const entry = await this.#reviewByName(name);
        if (!entry) throw new Error(`Review "${name}" is not open in this browser.`);
        await this.open(entry);
      }
      return this.snapshot();
    }
    throw new Error(`Unknown request ${u.pathname}`);
  }

  snapshot() {
    return snapshot(this.session, { review: this.entry.name, reviews: [], vault: this.entry.settings?.vault ?? "" })
      .then(async s => ({ ...s, reviews: await this.reviewNames(), publication_template: this.publicationTemplate ? this.entry.settings?.publicationTemplate?.name ?? "" : "" }));
  }

  /** A file the user chose for an action (export, sheet, PDF); returns the token the action refers to. */
  upload(file) {
    const token = `upload:${crypto.randomUUID()}`;
    this.#uploads.set(token, file);
    return token;
  }

  async #uploaded(token) {
    const file = this.#uploads.get(token);
    if (!file) throw new Error("The chosen file is no longer available; choose it again.");
    return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  /** Saves a file of the review folder to the user's downloads. */
  async download(path) {
    const bytes = await this.session.repo.folder.readBytes(path);
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = Object.assign(document.createElement("a"), { href: url, download: path.split("/").pop() });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async #stateStamp() {
    try { return await this.session.repo.folder.lastModified("review_state.json"); } catch { return null; }
  }

  /**
   * Re-reads the review when another program changed it since this app last wrote it (Claude through
   * bin/ai-assist.js always updates review_state.json). @returns {Promise<boolean>} whether it did
   */
  async refreshIfChanged() {
    if (!this.session || this.#busy) return false;
    const now = await this.#stateStamp();
    if (now === this.#stamp || this.#busy) return false;
    await this.session.reload();
    this.#stamp = now;
    return true;
  }

  /** POST /api/action: one action of the page. Answers like the server: {status, ok, body}. */
  async action(action, args = {}) {
    try {
      if (!action.startsWith("preview")) await this.refreshIfChanged();    // never save over changes made outside meanwhile
      await this.#connectSettings();
      this.#busy++;
      let result;
      try { result = await this.#run(action, args); } finally { this.#stamp = await this.#stateStamp(); this.#busy--; }
      if (result?.raw) return answer(200, result.raw);
      const body = { message: typeof result === "string" ? result : (result?.message ?? "") };
      if (result?.download) body.download = result.download;
      if (result?.scan) body.scan = result.scan;
      if (!action.startsWith("preview") && !action.startsWith("record_")) body.state = await this.snapshot();
      return answer(200, body);
    } catch (e) {
      if (e instanceof AmendmentRequired) return answer(409, { amendment: e.what });
      if (e?.name === "AbortError") return answer(400, { error: "cancelled" });
      console.error(e);
      return answer(400, { error: e.message });
    }
  }

  async #run(action, a) {
    const s = this.session;
    const amendment = a.amendment ?? "";
    switch (action) {
      case "dev_mode": return s.setDevMode(a.on);
      case "ai_mode": return s.setAiMode(a.stage, a.mode, amendment);
      case "stage_status": return s.setStageStatus(a.stage, a.status, a.reason ?? "");
      case "add_idea": return s.addIdea(a.text);
      case "save_questions": return s.saveQuestions(a.q, a.why ?? "", amendment);
      case "save_concepts": return s.saveConcepts(a.concepts, a.why ?? "", amendment);
      case "preview_queries": return { raw: { queries: s.previewQueries(a.concepts) } };
      case "save_databases": return s.saveDatabases(a.databases, amendment);
      case "save_manual_query": return s.saveManualQuery(a.db, a.text ?? null, amendment);
      case "pilot_openalex": return s.pilotOpenalex(a.note ?? "");
      case "pilot_file": { const f = await this.#uploaded(a.path); return s.pilotFile({ fileName: f.name, bytes: f.bytes, database: a.database, note: a.note ?? "" }); }
      case "pilot_manual": return s.pilotManual(a);
      case "save_protocol_text": return s.saveProtocolText(a.text, { author: a.author ?? "user", generate: a.generate, amendment });
      case "set_test_set": return s.setTestSet(a.stems);
      case "approve_section": return s.approveSection(a.key);
      case "supervisor_review": return s.supervisorReview(a.by ?? "", a.when ?? "");
      case "save_reasons": return s.saveReasons(a.ta, a.ft, amendment);
      case "lock_protocol": return s.lockProtocol(a.registration ?? "");
      case "import": {
        const f = await this.#uploaded(a.path);
        return s.importSearch({ fileName: f.name, bytes: f.bytes, database: a.database, query: a.query, date: a.date || undefined, filters: a.filters ?? "", other: Boolean(a.other) }, { force: Boolean(a.force) });
      }
      case "add_paper": return s.addPaper(a);
      case "decide": return s.decide(a.record_id, a.stage, a.decision, { reason: a.reason ?? "", notes: a.notes, undo: Boolean(a.undo) });
      case "bulk_decide": return s.bulkDecide(a.ids, a.reason ?? "");
      case "apply_decisions": return s.applyDecisions(a.items, a.stage ?? "ta");
      case "clear_presort": return s.clearPresort(a.ids);
      case "set_record": return s.setRecord(a.record_id, a.fields);
      case "check": return s.check();
      case "report": return s.report();
      case "sample": {
        const seed = String(a.seed ?? "").trim() ? Number(a.seed) : undefined;
        const r = await s.sample({ stage: a.stage, fraction: Number(a.fraction ?? 0.2), seed, redo: Boolean(a.redo) });
        return `Drew ${r.drawn} of ${r.pool} records (seed ${r.seed}). Blind sheet for the second reviewer: ${r.sheet}`;
      }
      case "import_r2": { const f = await this.#uploaded(a.path); return s.importSecondReviewer({ fileName: f.name, text: new TextDecoder().decode(f.bytes), stage: a.stage }); }
      case "find_oa": return s.findOpenAccess();
      case "scan_pdfs": {
        const handle = (a.folder && this.#pdfFolders.get(a.folder)) || (await window.showDirectoryPicker({ id: "pdfs", mode: "read" }));
        this.#pdfFolders.set(handle.name, handle);
        this.#lastPdfFolder = handle;
        const scan = await s.scanPdfs(browserFolder(handle), this.pdfText);
        return { message: scan.message, scan: { ...scan, folder: handle.name } };
      }
      case "attach_found": {
        const handle = this.#pdfFolders.get(a.folder) ?? this.#lastPdfFolder;
        if (!handle) throw new Error("Scan the folder again first.");
        return s.attachFound(a.items, browserFolder(handle));
      }
      case "attach_pdf": { const f = await this.#uploaded(a.path); return s.attachPdf(a.record_id, f.bytes); }
      case "mark_pdf": return s.markPdf(a.record_id, a.status);
      case "save_fields": return s.saveFields(a.fields, amendment);
      case "add_to_library":
        if (!this.session.library.folder) throw new Error("Choose a library folder in Settings first.");
        return s.exportToLibrary(this.publicationTemplate ?? this.templates.publication, { status: this.entry.settings?.exportStatus ?? "" });
      case "library_citations": {
        if (!this.session.library.folder) throw new Error("Choose a library folder in Settings first.");
        return { raw: await s.libraryCitations({ apply: Boolean(a.apply) }) };
      }
      case "prepare_charting": return s.prepareCharting();
      case "record_history": return { raw: { rows: await s.decisionHistory(a.record_id) } };
      case "verify_log": return { raw: await s.verifyDecisionLog() };
      case "review_package": { const r = await s.reviewPackage(); return { message: r.message, download: r.path }; }
      case "checklist": return s.setChecklistItem(a.n, a.location ?? "", a.done ?? false);
      case "write_checklist": return s.writeChecklist();
      case "export": { const r = await s.export(a.kind); return { message: r.message, download: r.path }; }
      case "sync": {
        const plan = await s.sync(Boolean(a.apply));
        return plan.changes.map(c => `${c.note}: ${c.add ? "add to" : "remove from"} ${c.key}`).join("\n") || "Publication notes already in sync.";
      }
      case "open_note": return this.#openNote(a.note);
      case "record_abstract": return { raw: { record: recordView(s.repo.records.get(a.record_id), true) } };
      default: throw new Error(`Unknown action ${action}`);
    }
  }

  /** Opens a note in Obsidian (when the vault is set in Settings) or shows the file in a new tab. */
  async #openNote(note) {
    const folder = this.session.repo.folder;
    if (note === "@library") throw new Error("Open the library folder in Obsidian or your file manager.");
    const path = note || "";
    if (!(await folder.exists(path))) throw new Error(`${path.split("/").pop()} does not exist yet — it is created when this stage first saves something.`);
    const vault = this.entry.settings?.vault;
    if (vault && [".md", ".base"].includes(extension(path))) {
      const inVault = `${(this.entry.settings.recordsPath || `${this.entry.name}/08 - Records`).replace(/\/08 - Records$/, "")}/${path}`;
      location.href = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(inVault)}`;
      return "";
    }
    if (await folder.isDirectory(path)) throw new Error("Open this folder in your file manager.");
    const type = extension(path) === ".pdf" ? "application/pdf" : "text/plain;charset=utf-8";
    window.open(URL.createObjectURL(new Blob([await folder.readBytes(path)], { type })), "_blank");
    return "";
  }
}

