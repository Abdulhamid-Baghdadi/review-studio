/**
 * The decision log file (08 - Decision log.csv): appends a chained row for every screening decision that
 * changed since the last row, and checks the chain. The rules are in domain/decision-log.js.
 * @module services/decision-log
 */
import * as csv from "../domain/csv.js";
import { chainText, DECISION_LOG_COLUMNS, DECISION_LOG_FILE, decisionChanges, historyOf, HOW, keyOf, lastDecisions } from "../domain/decision-log.js";
import { normalizeNewlines } from "../domain/text-rules.js";

/** SHA-256 of text as hex (Web Crypto: browsers and Node). */
async function sha256Text(text) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

export class DecisionLog {
  /** @param {import("../ports/folder.js").Folder} folder */
  constructor(folder) {
    this.folder = folder;
    /** @type {Record<string, string>[] | null} */
    this.rows = null;
    this.stamp = null;
    /** @type {Map<string, {to: string, reason: string}> | null} last decision per record and stage, kept with the rows */
    this.last = null;
  }

  /** The rows, re-read only when the file changed since the last read. */
  async read() {
    if (!(await this.folder.exists(DECISION_LOG_FILE))) { this.rows = []; this.stamp = null; this.last = null; return this.rows; }
    const stamp = await this.folder.lastModified(DECISION_LOG_FILE);
    if (this.rows && stamp === this.stamp) return this.rows;
    this.rows = csv.readRecords(normalizeNewlines(await this.folder.readText(DECISION_LOG_FILE)));
    this.stamp = stamp;
    this.last = null;
    return this.rows;
  }

  /**
   * Logs every decision that differs from the last logged one. Records in `ids` changed in this action and
   * get `by` and `how`; any other difference was made elsewhere (or predates the log, when it is new).
   * @param {{id: string, props: Record<string, unknown>}[]} records
   * @param {{now: string, by?: string, how?: string, ids?: Set<string>}} context
   * @returns {Promise<number>} rows added
   */
  async sync(records, { now, by = "", how = HOW.hand, ids = new Set() }) {
    const rows = await this.read();
    const isNew = !rows.length;
    this.last ??= lastDecisions(rows);
    const changes = decisionChanges(records, this.last);
    if (!changes.length) return 0;
    let previous = rows.at(-1)?.hash ?? "", seq = Number(rows.at(-1)?.seq ?? 0);
    const added = [];
    for (const c of changes) {
      const mine = ids.has(c.record_id);
      const row = { seq: String(++seq), when: now, ...c,
        by: mine ? by : "", how: mine ? how : isNew ? HOW.baseline : HOW.outside };
      row.hash = await sha256Text(chainText(previous, row));
      previous = row.hash;
      added.push(row);
    }
    const lines = csv.writeRows(added.map(r => DECISION_LOG_COLUMNS.map(k => r[k])));
    if (!(await this.folder.exists(DECISION_LOG_FILE))) await this.folder.writeText(DECISION_LOG_FILE, csv.writeRows([DECISION_LOG_COLUMNS]) + lines);
    else await this.folder.appendText(DECISION_LOG_FILE, lines);
    rows.push(...added);
    for (const r of added) this.last.set(keyOf(r.record_id, r.stage), { to: r.to, reason: r.reason });
    this.stamp = await this.folder.lastModified(DECISION_LOG_FILE);
    return added.length;
  }

  /** The logged decisions of one record, oldest first. */
  async history(recordId) { return historyOf(await this.read(), recordId); }

  /**
   * Re-computes the chain. @returns {Promise<{rows: number, intact: boolean, brokenAt: string, last: string}>}
   * brokenAt is the first row whose hash does not match (a row was edited, removed or inserted there).
   */
  async verify() {
    const rows = await this.read();
    let previous = "";
    for (const r of rows) {
      if ((await sha256Text(chainText(previous, r))) !== r.hash) return { rows: rows.length, intact: false, brokenAt: r.seq, last: rows.at(-1)?.hash ?? "" };
      previous = r.hash;
    }
    return { rows: rows.length, intact: true, brokenAt: "", last: previous };
  }
}
