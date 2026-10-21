/**
 * Use cases of screening: one decision, confirming rule-based pre-sorts, saving reviewed AI suggestions, and
 * returning pre-sorted records to the queue. Each changes the records in the repository and returns the ids it
 * changed; the session then checks the screening, logs the decisions and saves.
 * @module services/screening
 */
import { strip } from "../domain/text-rules.js";

const KEYS = { ta: ["ta_decision", "ta_reason", "ai_"], ft: ["ft_decision", "ft_reason", "ai_ft_"] };

/**
 * One decision at title/abstract ("ta") or full-text ("ft") stage; the reason is kept only for an exclusion.
 * @param {import("./review-repository.js").ReviewRepository} repo
 * @returns {Set<string>} the record changed
 */
export function decide(repo, recordId, stage, decision, { reason = "", notes } = {}) {
  const r = repo.records.get(recordId);
  const [dkey, rkey] = KEYS[stage === "ta" ? "ta" : "ft"];
  const props = { ...r.props, [dkey]: decision, [rkey]: decision === "exclude" ? reason : "" };
  if (notes !== undefined && notes !== null) props.notes = notes;
  repo.put({ ...r, props });
  return new Set([recordId]);
}

/** Confirms rule-based pre-sorted records still pending as excluded, each with its pre-sort code (else `reason`). */
export function confirmPresorted(repo, ids, reason = "") {
  const changed = new Set();
  for (const id of ids) {
    const r = repo.records.get(id);
    if (!r || r.props.ta_decision !== "pending") continue;
    repo.put({ ...r, props: { ...r.props, ta_decision: "exclude", ta_reason: r.props.presort || reason,
      notes: (r.props.notes || "") + " [pre-sorted by rule, confirmed by reviewer]" } });
    changed.add(id);
  }
  return changed;
}

/**
 * A reviewed batch of AI-suggested decisions, saved as the reviewer's: only records still open at that stage, and
 * each record notes whether the reviewer kept the suggestion or changed it.
 * @param {{id: string, decision: string, reason?: string}[]} items
 */
export function applySuggestions(repo, items, stage = "ta") {
  const ft = stage === "ft";
  const [dkey, rkey, ai] = KEYS[ft ? "ft" : "ta"];
  const changed = new Set(), kept = new Set();         // kept: the reviewer chose what the AI suggested
  for (const it of items) {
    const r = repo.records.get(it.id);
    if (!r) continue;
    const f = { ...r.props };
    if ((f[dkey] || "pending") !== "pending" || (ft && !["include", "unsure"].includes(f.ta_decision))) continue;
    if (ft && !["include", "exclude"].includes(it.decision)) continue;          // full text has no "unsure"
    f[dkey] = it.decision;
    f[rkey] = it.decision === "exclude" ? (it.reason ?? "") : "";
    const agreed = it.decision === f[ai + "decision"] && f[rkey] === (f[ai + "reason"] || "");
    const what = ft ? "full-text " : "";
    f.notes = strip((f.notes || "") + (agreed ? ` [AI ${what}suggestion confirmed by reviewer]` : ` [reviewer changed AI ${what}suggestion]`));
    repo.put({ ...r, props: f });
    changed.add(it.id);
    if (agreed) kept.add(it.id);
  }
  return Object.assign(changed, { kept });
}

/** Returns pre-sorted records to the normal screening queue. */
export function clearPresort(repo, ids) {
  for (const id of ids) {
    const r = repo.records.get(id);
    if (r?.props.presort) repo.put({ ...r, props: { ...r.props, presort: "", presort_reason: "" } });
  }
}
