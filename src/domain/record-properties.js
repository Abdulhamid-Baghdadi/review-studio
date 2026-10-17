/**
 * The properties of a review record as they are written in the note, in full words ("title_abstract_decision"),
 * and the short names the app uses in memory ("ta_decision"). Records are translated when they are read and when
 * they are written, so the rest of the app is unchanged and older notes (short names) still open; they are
 * rewritten in full words the next time they are saved.
 *
 * In the note, the properties shared with the library's publication notes come first, in the same order (see the
 * vault's "Library schema"), then the review's own properties. Optional groups (second reviewer, AI suggestions,
 * presort, extraction, appraisal) are only written when they hold something.
 * @module domain/record-properties
 */

/** In memory → in the note. Names not listed are the same in both. */
export const FULL_NAMES = Object.freeze({
  ta_decision: "title_abstract_decision",
  ta_reason: "title_abstract_reason",
  ft_decision: "full_text_decision",
  ft_reason: "full_text_reason",
  pdf_status: "full_text_status",
  oa_url: "open_access_url",
  screener: "screened_by",
  sample_ta: "second_reviewer_title_abstract_sample",
  r2_ta_decision: "second_reviewer_title_abstract_decision",
  r2_ta_reason: "second_reviewer_title_abstract_reason",
  sample_ft: "second_reviewer_full_text_sample",
  r2_ft_decision: "second_reviewer_full_text_decision",
  r2_ft_reason: "second_reviewer_full_text_reason",
  ai_decision: "ai_title_abstract_decision",
  ai_reason: "ai_title_abstract_reason",
  ai_why: "ai_title_abstract_explanation",
  ai_ft_decision: "ai_full_text_decision",
  ai_ft_reason: "ai_full_text_reason",
  ai_ft_why: "ai_full_text_explanation",
  chart_basis: "extraction_basis",
  chart_checked_by: "extraction_checked_by",
});

/** Data-extraction (charting) fields: `chart_<field>` in memory, `extracted_<field>` in the note. */
const CHART = "chart_", EXTRACTED = "extracted_";

const SHORT_NAMES = Object.freeze(Object.fromEntries(Object.entries(FULL_NAMES).map(([short, full]) => [full, short])));

/** The name of a property in the note. */
export function fullName(key) {
  if (FULL_NAMES[key]) return FULL_NAMES[key];
  return key.startsWith(CHART) ? EXTRACTED + key.slice(CHART.length) : key;
}

/** The name of a property in memory, from its name in the note (full words, or the short names of older notes). */
export function shortName(key) {
  if (SHORT_NAMES[key]) return SHORT_NAMES[key];
  return key.startsWith(EXTRACTED) ? CHART + key.slice(EXTRACTED.length) : key;
}

// Properties shared with publication notes first, in the library's order; then the review's own, in working order.
const ORDER = ["type", "review", "record_id",
  "title", "authors", "year", "journal", "publication_type", "doi", "url", "openalex", "citekey", "pdf", "language",
  "sources", "publication", "presort", "presort_reason",
  "ai_decision", "ai_reason", "ai_why", "ta_decision", "ta_reason",
  "pdf_status", "oa_url", "ai_ft_decision", "ai_ft_reason", "ai_ft_why", "ft_decision", "ft_reason",
  "screener", "screened_on", "notes",
  "sample_ta", "r2_ta_decision", "r2_ta_reason", "sample_ft", "r2_ft_decision", "r2_ft_reason"];
const AFTER = ["chart_basis", "chart_checked_by", "appraisal", "appraisal_note", "appraisal_by"];

/** Written only when they hold something (an empty one is the same as a missing one). */
const OPTIONAL = new Set(["presort", "presort_reason", "ai_decision", "ai_reason", "ai_why", "ai_ft_decision", "ai_ft_reason", "ai_ft_why",
  "oa_url", "openalex", "publication_type", "sample_ta", "r2_ta_decision", "r2_ta_reason", "sample_ft", "r2_ft_decision", "r2_ft_reason",
  "chart_basis", "chart_checked_by", "appraisal", "appraisal_note", "appraisal_by"]);
const empty = v => v === "" || v === false || v === null || v === undefined || (Array.isArray(v) && !v.length);

/** Defaults in memory for what an older or shorter note leaves out. */
const DEFAULTS = Object.freeze({ sample_ta: false, r2_ta_decision: "", r2_ta_reason: "", sample_ft: false, r2_ft_decision: "", r2_ft_reason: "" });

/**
 * A record's properties as read from its note → the names the app uses. Where an older note was edited and has a
 * property under both names, the full-word one wins.
 * @param {Record<string, unknown>} disk @returns {Record<string, unknown>}
 */
export function fromNote(disk) {
  const out = { ...DEFAULTS };
  for (const [k, v] of Object.entries(disk)) if (shortName(k) === k) out[k] = v;           // short (older) names first
  for (const [k, v] of Object.entries(disk)) if (shortName(k) !== k) out[shortName(k)] = v;  // full words override
  return out;
}

/**
 * A record's properties → as written in its note: full words, shared properties first, empty optional ones left out.
 * Properties the app does not know (added by hand in Obsidian) keep their name and come after the known ones.
 * @param {Record<string, unknown>} props @returns {Record<string, unknown>}
 */
export function toNote(props) {
  const keys = Object.keys(props);
  const charts = keys.filter(k => k.startsWith(CHART) && !AFTER.includes(k));
  const known = new Set([...ORDER, ...AFTER, ...charts]);
  const order = [...ORDER.filter(k => k in props), ...charts, ...AFTER.filter(k => k in props), ...keys.filter(k => !known.has(k))];
  const out = {};
  for (const k of order) if (!(OPTIONAL.has(k) && empty(props[k]))) out[fullName(k)] = props[k];
  return out;
}

/**
 * The shared properties in the library's format: `url` is the DOI link when there is a DOI, and an OpenAlex link
 * becomes the `openalex` id. Returns the properties unchanged (same object) when there is nothing to fix.
 */
export function libraryFormat(props) {
  const id = props.openalex || openalexId(/openalex\.org/.test(String(props.url ?? "")) ? props.url : "");
  const url = props.doi ? `https://doi.org/${props.doi}` : props.url;
  if (id === (props.openalex ?? "") && url === props.url) return props;
  return { ...props, url, ...(id ? { openalex: id } : {}) };
}

/** Whether a note still uses the older short names. @param {Record<string, unknown>} disk */
export const hasShortNames = disk => Object.keys(disk).some(k => FULL_NAMES[k] || k.startsWith(CHART));

/** The OpenAlex work id ("W2056…") in a URL or text, or "". */
export const openalexId = text => /\bW\d{4,}\b/.exec(String(text ?? ""))?.[0] ?? "";
