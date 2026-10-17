/**
 * Publication notes in the library (`NNN - Year - Authors - Title.md`), created from a finished review's
 * included records.
 * @module domain/publications
 */
import * as frontmatter from "./frontmatter.js";
import { chars, strip } from "./text-rules.js";

/** What `added_by` says on every publication note the app creates. */
export const ADDED_BY = "PRISMA Review Studio";

const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g;

/** "Liu, Z.; Zhong, P.; Liu, H." → "Liu et al."; two authors → "A & B"; none → "Anon". */
export function shortAuthors(authors) {
  const names = String(authors || "").split(/;| and /).filter(a => strip(a)).map(a => strip(a.split(",")[0]))
    .filter(Boolean).map(x => x.replace(FORBIDDEN, ""));
  if (!names.length) return "Anon";
  return names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
}

/** Title for a file name: forbidden characters removed, cut at a word boundary before 90 characters. */
export function fileTitle(title) {
  const t = strip(String(title).replace(FORBIDDEN, ""));
  const c = chars(t);
  const cut = c.length > 90 ? c.slice(0, 90).join("").replace(/ [^ ]*$/, "") : t;
  return cut.replace(/[ .-]+$/, "");
}

/** The next library index: one more than the highest `index` of any publication note. */
export function nextIndex(notes) {
  const used = [...notes.values()].map(p => String(p.index || "")).filter(s => /^\d+$/.test(s)).map(Number);
  return Math.max(0, ...used) + 1;
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
 * @returns {{stem: string, props: import("./frontmatter.js").Properties, body: string}}
 */
export function newPublicationNote({ record: f, recordBody, index, reviewName, reviewLink, template, today = "", status = "" }) {
  const [templateProps, templateBody] = frontmatter.parse(template);
  const stem = `${String(index).padStart(3, "0")} - ${f.year || "n.d."} - ${shortAuthors(f.authors)} - ${fileTitle(f.title)}`;
  // the template's properties in its order, filled from the record; added_by / added_on say where the note came from
  const props = { ...templateProps, type: "publication", index, authors: f.authors ?? "", year: f.year ?? "", title: f.title,
    journal: f.journal ?? "", doi: f.doi ?? "", url: f.url ?? "", pdf: "", added_by: ADDED_BY, added_on: today };
  if (strip(status)) props.status = Array.isArray(templateProps.status) ? [strip(status)] : strip(status);   // as set in Review settings, in the template's shape
  else if (!("status" in templateProps)) props.status = "read";
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
