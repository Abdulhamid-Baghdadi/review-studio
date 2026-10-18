/**
 * Publication notes in the library (`NNN - Year - Authors - Title.md`), created from a finished review's
 * included records.
 * @module domain/publications
 */
import * as frontmatter from "./frontmatter.js";
import { citedAuthors } from "./names.js";
import { chars, strip } from "./text-rules.js";

const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g;

/**
 * "Liu, Z.; Zhong, P.; Liu, H." → "Liu et al."; two authors → "A & B"; none → "Anon". Names given first, as
 * OpenAlex writes them ("Rebecca M. Henderson; Kim B. Clark"), give their surname too ("Henderson & Clark").
 */
export function shortAuthors(authors) {
  return citedAuthors(String(authors || "").replaceAll(" and ", "; ")).replace(FORBIDDEN, "");
}

/**
 * Title for a file name: a colon becomes " - " ("Architectural Innovation - The Reconfiguration…", as in the
 * library), other forbidden characters are removed, cut at a word boundary before 90 characters.
 */
export function fileTitle(title) {
  const t = strip(String(title).replace(/\s*:\s*/g, " - ").replace(FORBIDDEN, ""));
  const c = chars(t);
  const cut = c.length > 90 ? c.slice(0, 90).join("").replace(/ [^ ]*$/, "") : t;
  return cut.replace(/[ .-]+$/, "");
}

/** The next library index: one more than the highest `index` of any publication note. */
export function nextIndex(notes) {
  const used = [...notes.values()].map(p => String(p.index || "")).filter(s => /^\d+$/.test(s)).map(Number);
  return Math.max(0, ...used) + 1;
}

/**
 * A citation key in the library's style: first author's surname in lower-case ASCII, then the year ("ulrich1995",
 * "bracquene2019", "defazio1987"); a, b, … is added when the key is taken ("baldwin2000a").
 * @param {string} authors "Surname, Given; …" or "Given Surname; …" @param {Set<string>} taken keys in the library
 */
export function libraryCitekey(authors, year, taken = new Set()) {
  const first = strip(String(authors || "").split(/;| and /)[0] ?? "");
  const surname = first.includes(",") ? first.split(",")[0] : first.split(/\s+/).at(-1) ?? "";
  const base = (surname.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "") || "anon") + (year || "nd");
  if (!taken.has(base)) return base;
  for (let i = 0; ; i++) {
    const letters = i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(97 + Math.floor(i / 26) - 1, 97 + (i % 26));
    if (!taken.has(base + letters)) return base + letters;
  }
}

/**
 * The properties with `extra` set: in place where the template has them, otherwise next to the property `at`
 * (after it, or before it with `before`), or at the end.
 */
function insertAt(props, extra, at, before = false) {
  const entries = Object.entries(props).map(([k, v]) => [k, k in extra ? extra[k] : v]);
  const i = entries.findIndex(([k]) => k === at);
  entries.splice(i < 0 ? entries.length : before ? i : i + 1, 0, ...Object.entries(extra).filter(([k]) => !(k in props)));
  return Object.fromEntries(entries);
}

/** Text after "## <name>" up to the next "## " heading, trimmed. */
const section = (body, name) => strip(new RegExp(`## ${name}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$(?![\\s\\S]))`).exec(body)?.[1] ?? "");   // an empty section stays empty

/**
 * A publication note for an included record, from the publication template.
 * @param {object} p
 * @param {import("./frontmatter.js").Properties} p.record record properties
 * @param {string} p.recordBody record note text after its properties
 * @param {number} p.index library index for the new note
 * @param {string} p.reviewName @param {string} p.reviewLink @param {string} p.template text of the publication template
 * @param {Set<string>} [p.citekeys] citation keys already in the library (a new key must differ)
 * @returns {{stem: string, props: import("./frontmatter.js").Properties, body: string}}
 */
export function newPublicationNote({ record: f, recordBody, index, reviewName, reviewLink, template, today = "", status = "", citekeys = new Set() }) {
  const [templateProps, templateBody] = frontmatter.parse(template);
  const stem = `${String(index).padStart(3, "0")} - ${f.year || "n.d."} - ${shortAuthors(f.authors)} - ${fileTitle(f.title)}`;
  // the template's properties in its order, filled from the record; added_by (the review) / added_on say where the note came from
  let props = { ...templateProps, type: "publication", index, authors: f.authors ?? "", year: f.year ?? "", title: f.title,
    journal: f.journal ?? "", doi: f.doi ?? "", url: f.url ?? "", pdf: "", added_by: reviewLink, added_on: today };
  if (strip(String(f.publication_type ?? ""))) props.publication_type = strip(String(f.publication_type));
  // the record's OpenAlex id (the citation step finds the paper by it) and its citation key, else one in the library's style
  const citekey = strip(String(f.citekey ?? "")) && !citekeys.has(strip(String(f.citekey))) ? strip(String(f.citekey)) : libraryCitekey(f.authors, f.year, citekeys);
  props = insertAt(props, { ...(strip(String(f.openalex ?? "")) ? { openalex: strip(String(f.openalex)) } : {}), citekey }, "doi");
  if (strip(status)) props.status = Array.isArray(templateProps.status) ? [strip(status)] : strip(status);   // as set in Review settings, in the template's shape
  else if (!("status" in templateProps)) props.status = "read";
  const { cites = [], ...rest } = props;
  props = { ...rest, cites };   // filled by the citation step; always the last property
  for (const k of ["category", "tags"]) if (!Array.isArray(props[k]) || props[k].every(v => !v)) props[k] = [];
  const fill = name => { const text = section(recordBody, name); return text ? `## ${name}\n\n${text}\n` : `## ${name}\n`; };
  let body = templateBody.replaceAll("{{title}}", () => f.title)
    .replace("## Abstract\n", () => fill("Abstract"))
    .replace("## Keywords\n", () => fill("Keywords"));
  // anything the reviewer wrote in the record beyond title, abstract and keywords
  const extra = recordBody.split(/\n(?=## )/).map(strip).filter(x => x.startsWith("## ") && !/^## (Abstract|Keywords)\b/.test(x) && x.includes("\n"));
  if (extra.length) body += `\n## Notes from ${reviewName}\n\n` + extra.map(x => x.replace("## ", "### ")).join("\n\n") + "\n";
  return { stem, props, body };
}
