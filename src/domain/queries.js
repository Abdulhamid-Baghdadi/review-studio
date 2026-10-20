/**
 * Search strings built from the concept table: one block of synonyms per concept (OR inside a block, AND
 * between blocks, NOT blocks excluded), in each database's syntax. A string edited by hand wins.
 * @module domain/queries
 */
import { splitWords, strip } from "./text-rules.js";

/** Terms typed one per line or separated by ";". */
export const cleanTerms = text => String(text).split(/[\n;]+/).map(strip).filter(Boolean);

// Stems whose ending the rules below cannot know. A stem standing for two words searches both (alone, not in a phrase).
const OPENALEX_WORDS = { scor: ["score"], reus: ["reuse"], modul: ["module", "modular"], econom: ["economy"], energ: ["energy"],
  batter: ["battery"], estimat: ["estimate"], tabl: ["table"], electr: ["electric", "electrical"], electron: ["electronic", "electronics"] };

/**
 * OpenAlex has no wildcards. It stems every real word (motor = motors, remanufacture = remanufacturing), but a
 * cut-off stem that is not a word finds almost nothing (OpenAlex, 20 October 2026: remanufactur 4 papers,
 * remanufacture 14,246; recycl 102, recycle 620,499; repairab 0). So a stem becomes a whole word, by its ending:
 * -ur, -at, -iz, -is, -cl + e (measure, evaluate, optimize, recycle); -ab, -ib + ility (repairability);
 * -embl + y (disassembly). Any other stem only loses its * (motor* → motor): a guessed ending must never make a
 * word that does not exist (motor* → "motore"). The page lists every change for the reviewer to check.
 */
export function openalexWord(term) {
  const words = splitWords(String(term).replaceAll("?", ""));
  return words.map(word => {
    if (!word.endsWith("*")) return word;
    const w = word.slice(0, -1), n = [...w].length, lower = w.toLowerCase();
    const known = OPENALEX_WORDS[lower];
    if (known) return words.length === 1 ? known.join(" OR ") : known[0];
    // + e only where no common word ends so: not behaviour, analysis, basis, axis, format, heat, habitat, quiz
    if (n >= 4 && /(tur|sur|cl)$/.test(lower)) return w + "e";                          // manufactur, measur, recycl
    if (n >= 5 && (/iz$/.test(lower) || /[^sx]is$/.test(lower))) return w + "e";        // optimiz, optimis
    if (n >= 7 && /at$/.test(lower) && !/(eat|oat|stat|itat|mat)$/.test(lower)) return w + "e";   // evaluat, integrat
    if (n >= 6 && /(ab|ib)$/.test(lower)) return w + "ility";
    if (n >= 7 && lower.endsWith("embl")) return w + "y";
    return w;
  }).join(" ");
}

/** Every term the OpenAlex string changes, as [as typed, as searched] (e.g. ["motor*", "motor"]), for the reviewer to check. */
export function openalexChanges(concepts) {
  const seen = new Map();
  for (const c of concepts ?? []) for (const t of c.terms ?? []) {
    const typed = strip(t);
    if (typed.includes("*") || typed.includes("?")) seen.set(typed, openalexWord(typed));
  }
  return [...seen];
}

/** One term in a database's syntax: phrases quoted, IEEE fields named. */
export function formatTerm(term, database) {
  let t = strip(term);
  if (database === "OpenAlex") t = openalexWord(t);
  if (t.includes(" OR ")) return t;                        // one stem searched as two words (modul* → module OR modular)
  if (t.includes(" ") && !(t.startsWith('"') && t.endsWith('"'))) t = `"${t}"`;
  return database === "IEEE Xplore" ? `"All Metadata":${t}` : t;
}

/** The AND blocks and NOT blocks of the concept table. @returns {[string[], string[]]} */
export function blocks(concepts, database) {
  const ands = [], nots = [];
  for (const c of concepts) {
    const terms = (c.terms ?? []).filter(t => strip(t)).map(t => formatTerm(t, database));
    if (!terms.length) continue;
    (c.role === "NOT" ? nots : ands).push("(" + terms.join(" OR ") + ")");
  }
  return [ands, nots];
}

/** OpenAlex title/abstract search ("NOT" without AND). */
export function openalexQuery(st) {
  if (st.queries.manual.OpenAlex) return st.queries.manual.OpenAlex;
  const [ands, nots] = blocks(st.concepts, "OpenAlex");
  return ands.join(" AND ") + nots.map(n => ` NOT ${n}`).join("");
}

/** The search string for one database. */
export function buildQuery(st, database) {
  if (database === "OpenAlex") return openalexQuery(st);
  if (st.queries.manual[database]) return st.queries.manual[database];
  const [ands, nots] = blocks(st.concepts, database);
  if (!ands.length) return "";
  const core = ands.join(" AND ") + nots.map(n => ` AND NOT ${n}`).join("");
  if (database === "Scopus") return `TITLE-ABS-KEY(${core})`;
  if (database === "Web of Science") return `TS=(${core})`;
  return core;
}
