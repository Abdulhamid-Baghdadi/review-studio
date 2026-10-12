/**
 * Use cases of the synthesis stage (systematic reviews): the outcomes with their study data, the
 * meta-analysis and GRADE of each, and the notes, plots, data and R scripts written to 14 - Synthesis.
 * Outcomes live in review_state.json (synthesis.outcomes); every save rewrites the files.
 * @module services/synthesis
 */
import { analyseOutcome, MEASURES, OUTCOME_TYPES } from "../domain/meta-analysis.js";
import { certainty, GRADE_DOMAINS, suggestGrade } from "../domain/grade.js";
import { isIncluded } from "../domain/progress.js";
import { event, touch } from "../domain/stages.js";
import { forestSvg, funnelSvg, outcomeCsv, outcomeNote, outcomeR, outcomeStem, SOF_FILE, summaryOfFindings, SYNTHESIS_DIR } from "../domain/synthesis-notes.js";
import { strip } from "../domain/text-rules.js";
import { APP_GENERATOR } from "../domain/notes.js";

/** "Liu 2024" for each included record (first author's surname and year). */
export function studyLabels(repo) {
  const labels = new Map();
  for (const r of repo.records.values()) {
    const first = String(r.props.authors ?? "").split(";")[0].split(",")[0].trim();
    labels.set(r.id, `${first || r.id}${r.props.year ? " " + r.props.year : ""}`);
  }
  return labels;
}

/** Overall risk-of-bias rating per record id. */
const ratingsOf = repo => new Map([...repo.records.values()].map(r => [r.id, String(r.props.appraisal ?? "")]));

/** An outcome as sent by the page, checked and normalised. */
export function cleanOutcome(o, existingIds = new Set()) {
  const type = OUTCOME_TYPES[o?.type] ? o.type : "binary";
  const measure = OUTCOME_TYPES[type].measures.includes(o?.measure) ? o.measure : OUTCOME_TYPES[type].measures[0];
  const name = strip(String(o?.name ?? ""));
  if (!name) throw new Error("Give the outcome a name.");
  let id = strip(String(o?.id ?? ""));
  if (!id) { let n = 1; while (existingIds.has(`O${n}`)) n++; id = `O${n}`; }
  const cols = OUTCOME_TYPES[type].columns;
  const rows = (Array.isArray(o?.rows) ? o.rows : []).filter(r => r && r.record_id)
    .map(r => ({ record_id: String(r.record_id), ...Object.fromEntries(cols.map(c => [c, strip(String(r[c] ?? ""))])) }));
  const grade = Object.fromEntries(GRADE_DOMAINS.map(([k]) => [k, o?.grade?.[k]]).filter(([, v]) => v && v.confirmed)
    .map(([k, v]) => [k, { level: Math.max(-2, Math.min(0, Math.round(Number(v.level) || 0))), reason: strip(String(v.reason ?? "")), confirmed: true }]));
  return { id, name, type, measure, model: o?.model === "fixed" ? "fixed" : "random", hk: Boolean(o?.hk), design: o?.design === "obs" ? "obs" : "rct",
    comparison: strip(String(o?.comparison ?? "")), rows, grade };
}

/** Analysis, GRADE suggestions and certainty of every outcome. */
export function synthesisResults(repo, st) {
  const ratings = ratingsOf(repo);
  return (st.synthesis?.outcomes ?? []).map(outcome => {
    const analysis = analyseOutcome(outcome);
    const suggested = suggestGrade(outcome, analysis, ratings);
    return { outcome, analysis, suggested, grade: certainty(outcome, suggested) };
  });
}

/** Writes the notes, plots, data and R script of every outcome, and the summary of findings. */
export async function writeSynthesisFiles(repo, st) {
  const labels = studyLabels(repo), today = repo.clock.today(), generatedBy = (repo.settings.generator ?? APP_GENERATOR).stagesBy ?? "Review Studio";
  const items = synthesisResults(repo, st);
  for (const { outcome, analysis, grade } of items) {
    const stem = `${SYNTHESIS_DIR}/${outcomeStem(outcome)}`;
    await repo.folder.writeText(`${stem}.md`, outcomeNote({ outcome, analysis, grade, labels, reviewLink: repo.link, today, generatedBy }));
    await repo.folder.writeText(`${stem} forest.svg`, forestSvg(outcome, analysis, labels));
    const funnel = funnelSvg(outcome, analysis);
    if (funnel) await repo.folder.writeText(`${stem} funnel.svg`, funnel);
    await repo.folder.writeText(`${stem} data.csv`, outcomeCsv(outcome, labels));
    await repo.folder.writeText(`${stem}.R`, outcomeR(outcome, { generatedBy, today }));
  }
  if (items.length) await repo.folder.writeText(SOF_FILE, summaryOfFindings({ items, reviewLink: repo.link, today, generatedBy }));
  return items;
}

/** Adds or replaces an outcome (by id) and rewrites the synthesis files. @returns {Promise<string>} the outcome id */
export async function saveOutcome(repo, st, input, now) {
  const outcomes = st.synthesis.outcomes ??= [];
  const outcome = cleanOutcome(input, new Set(outcomes.map(o => o.id)));
  const known = new Set([...repo.records.values()].filter(r => isIncluded(r.props)).map(r => r.id));
  const unknown = outcome.rows.filter(r => !known.has(r.record_id)).map(r => r.record_id);
  if (unknown.length) throw new Error(`Not an included study: ${unknown.join(", ")}`);
  const at = outcomes.findIndex(o => o.id === outcome.id);
  if (at >= 0) outcomes[at] = outcome; else outcomes.push(outcome);
  await writeSynthesisFiles(repo, st);
  touch(st, "synthesis", now);
  event(st, "synthesis", `outcome "${outcome.name}" ${at >= 0 ? "updated" : "added"} (${MEASURES[outcome.measure].label}, ${outcome.rows.length} studies)`, now);
  return outcome.id;
}

/** Removes an outcome from the analysis (its files in 14 - Synthesis are kept). */
export async function deleteOutcome(repo, st, id, now) {
  const outcomes = st.synthesis.outcomes ?? [];
  const gone = outcomes.find(o => o.id === id);
  if (!gone) return "";
  st.synthesis.outcomes = outcomes.filter(o => o.id !== id);
  await writeSynthesisFiles(repo, st);
  touch(st, "synthesis", now);
  event(st, "synthesis", `outcome "${gone.name}" removed`, now);
  return gone.name;
}
