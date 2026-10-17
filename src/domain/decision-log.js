/**
 * The decision log (08 - Decision log.csv): one append-only row per change of a screening decision, with
 * who made it and how, so every decision in the review can be traced back. Rows are chained: each row's
 * hash covers the previous row's hash, so an edited or deleted row shows up as a broken chain.
 * This module has the rules (which properties are decisions, what changed, how a row reads); hashing and
 * the file itself are in services/decision-log.js.
 * @module domain/decision-log
 */
import { writeRows } from "./csv.js";
import { strip } from "./text-rules.js";

export const DECISION_LOG_FILE = "08 - Decision log.csv";
export const DECISION_LOG_COLUMNS = Object.freeze(["seq", "when", "record_id", "stage", "from", "to", "reason", "by", "how", "hash"]);

/** The decisions that are logged: [stage, decision property, reason property]. */
export const LOGGED_DECISIONS = Object.freeze([
  ["title/abstract", "ta_decision", "ta_reason"],
  ["full text", "ft_decision", "ft_reason"],
  ["second reviewer, title/abstract", "r2_ta_decision", "r2_ta_reason"],
  ["second reviewer, full text", "r2_ft_decision", "r2_ft_reason"],
]);

/** How a decision came about (the `how` column). */
export const HOW = Object.freeze({
  hand: "by hand",
  undo: "undone by the reviewer (the decision before is restored)",
  rule: "rule-based pre-sort, confirmed by the reviewer",
  ai: "AI suggestion, reviewed by the reviewer",
  sheet: "second-reviewer sheet imported",
  outside: "changed outside the app (e.g. Obsidian)",
  baseline: "state when the decision log started",
});

const PENDING = "pending";
const decisionOf = (props, key) => strip(String(props[key] ?? "")) || PENDING;
const reasonOf = (props, key) => strip(String(props[key] ?? ""));
export const keyOf = (id, stage) => `${id}\u0000${stage}`;

/**
 * The last logged decision per record and stage. @param {Record<string, string>[]} rows log rows in order
 * @returns {Map<string, {to: string, reason: string}>}
 */
export function lastDecisions(rows) {
  const last = new Map();
  for (const r of rows) last.set(keyOf(r.record_id, r.stage), { to: r.to, reason: r.reason ?? "" });
  return last;
}

/**
 * What changed since the log's last rows: one change per record and stage whose decision or reason differs.
 * A record never logged counts as pending, so undecided records add nothing.
 * @param {{id: string, props: Record<string, unknown>}[]} records
 * @param {Map<string, {to: string, reason: string}>} last from lastDecisions
 * @returns {{record_id: string, stage: string, from: string, to: string, reason: string}[]}
 */
export function decisionChanges(records, last) {
  const out = [];
  for (const r of records) {
    for (const [stage, dkey, rkey] of LOGGED_DECISIONS) {
      if (!(dkey in r.props) && !last.has(keyOf(r.id, stage))) continue;      // a property this record never had
      const to = decisionOf(r.props, dkey), reason = to === PENDING ? "" : reasonOf(r.props, rkey);
      const before = last.get(keyOf(r.id, stage)) ?? { to: PENDING, reason: "" };
      if (before.to === to && before.reason === reason) continue;
      out.push({ record_id: r.id, stage, from: before.to, to, reason });
    }
  }
  return out;
}

/** The text a row's hash covers: the previous hash and every column but the hash itself. */
export const chainText = (previousHash, row) =>
  previousHash + "\n" + writeRows([DECISION_LOG_COLUMNS.slice(0, -1).map(c => String(row[c] ?? ""))]);

/** The decisions of one record, oldest first. */
export const historyOf = (rows, recordId) => rows.filter(r => r.record_id === recordId);
