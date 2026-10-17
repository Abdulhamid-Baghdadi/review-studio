/**
 * Citations between the papers of the publication library, from OpenAlex reference lists. Moved here from Library
 * Studio with the same rules, so both write the same notes:
 *
 *   cites      library papers this paper cites (OpenAlex)
 *   cited_by   library papers citing it (OpenAlex, and `references_pdf` read from the PDFs)
 *   "Unlinked cited works"  the OpenAlex ids of cited works outside the library, as plain text (no graph nodes)
 *
 * Only these generated parts of a note change; the rest of the text stays as it is, line endings included.
 * @module domain/library-citations
 */
import { compareCodePoints } from "./text-rules.js";

const OLD_SECTION = ["<!-- library-studio:citations:start -->", "<!-- library-studio:citations:end -->"];
export const UNLINKED = Object.freeze(["<!-- library-studio:unlinked-cites:start -->", "<!-- library-studio:unlinked-cites:end -->"]);

/** "https://openalex.org/W123" → "W123". */
export const shortId = id => String(id ?? "").replace(/^https?:\/\/openalex\.org\//, "");

/**
 * Who cites whom inside the library.
 * @param {Map<string, string>} dois  note name → normalised DOI ("" when none)
 * @param {Map<string, {id: string, referenced: string[]}>} works  normalised DOI → OpenAlex work (ids as given)
 * @param {Map<string, string[]>} [refsPdf]  note name → note names it cites according to its PDF (`references_pdf`)
 * @param {Set<string>} [knownIds]  OpenAlex ids of library papers found another way (by title, `openalex` property):
 *   a reference to one of them is not listed as unlinked
 * @returns {{refs: Map<string, string[]>, cited: Map<string, string[]>, external: Map<string, string[]>, found: number}}
 *   refs and external only for notes found in OpenAlex; cited for every note
 */
export function citationGraph(dois, works, refsPdf = new Map(), knownIds = new Set()) {
  const stemOfId = new Map();
  for (const [stem, doi] of dois) if (doi && works.has(doi)) stemOfId.set(shortId(works.get(doi).id), stem);
  const refs = new Map(), external = new Map();
  for (const [stem, doi] of dois) {
    if (!doi || !works.has(doi)) continue;
    const inside = new Set(), outside = new Set();
    for (const r of works.get(doi).referenced) {
      const s = stemOfId.get(shortId(r));
      if (s) { if (s !== stem) inside.add(s); } else if (!knownIds.has(shortId(r))) outside.add(shortId(r));
    }
    refs.set(stem, [...inside].sort(compareCodePoints));
    external.set(stem, [...outside].sort());
  }
  const cited = new Map([...dois.keys()].map(s => [s, new Set()]));
  for (const [s, list] of refs) for (const r of list) cited.get(r)?.add(s);
  for (const [s, list] of refsPdf) for (const r of list) if (r !== s) cited.get(r)?.add(s);
  return { refs, external, cited: new Map([...cited].map(([s, set]) => [s, [...set].sort(compareCodePoints)])), found: stemOfId.size };
}

/** YAML lines of a list of links ("key: []" when empty), as Library Studio writes them. */
export function formatList(key, items) {
  if (!items?.length) return `${key}: []\n`;
  return `${key}:\n` + items.map(s => `  - "[[${s}]]"\n`).join("");
}

/** The note with these properties replaced or added (before `category:` when there is one). */
export function replaceProps(text, lines) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(lf);
  if (!m) return text;
  let block = m[1] + "\n";
  for (const key of Object.keys(lines)) block = block.replace(new RegExp(`^${key}:[^\n]*\n(?:[ \t]+-[^\n]*\n)*`, "m"), "");
  block = block.replace(/\n$/, "");
  const add = Object.values(lines).join("");
  if (/^category:/m.test(block)) block = block.replace(/^category:/m, add + "category:");
  else block += "\n" + add.replace(/\n$/, "");
  const out = lf.slice(0, m.index + 4) + block + lf.slice(m.index + 4 + m[1].length);
  return out.replace(/\n/g, eol);
}

/** Without the generated citation properties of any version (references, sites, cites, cited_by). */
function withoutCitationProps(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  return lf.replace(/^(?:references|sites|cites|cited_by):[^\n]*(?:\n[ \t]+-[^\n]*)*\n?/gm, "").replace(/\n/g, eol);
}

const blockRe = ([start, end]) => new RegExp(`(?:\\r?\\n)?${start}[\\s\\S]*?${end}\\r?\\n?`, "g");

/** The note with `cites` and `cited_by` replaced, and the retired "Citation network" section removed. */
export function withCitations(text, refs, cited) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let out = withoutCitationProps(text);
  out = replaceProps(out, { cites: formatList("cites", refs), cited_by: formatList("cited_by", cited) });
  out = out.replace(blockRe(OLD_SECTION), "").replace(/[ \t]*(?:\r?\n)*$/, "");
  return `${out}${eol}`;
}

/** The note with its "Unlinked cited works" block replaced (removed when there are none), at the end of the note. */
export function withUnlinked(text, ids) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const [start, end] = UNLINKED;
  const section = ids.length
    ? `${start}${eol}${eol}## Unlinked cited works${eol}${eol}OpenAlex works cited outside this library: ${ids.join("; ")}.${eol}${eol}${end}`
    : "";
  const base = text.replace(blockRe(UNLINKED), "").replace(/[ \t]*(?:\r?\n)*$/, "");
  return `${base}${section ? `${eol}${eol}${section}` : ""}${eol}`;
}

/** Counts for the page: papers, found in OpenAlex, links between library papers, the most cited. */
export function citationSummary(dois, { refs, cited, found }, top = 10) {
  const links = [...refs.values()].reduce((a, r) => a + r.length, 0);
  const most = [...dois.keys()].sort((a, b) => cited.get(b).length - cited.get(a).length || compareCodePoints(a, b)).slice(0, top);
  return { publications: dois.size, found, links, missing: dois.size - found, mostCited: most.map(s => ({ stem: s, count: cited.get(s).length })) };
}
