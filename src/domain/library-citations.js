/**
 * Citations between the papers of the publication library, from OpenAlex reference lists. Moved here from Library
 * Studio; the note format is the same, except that works outside the library are listed in `cites` too:
 *
 *   cites      every work this paper cites (OpenAlex): a link to the library note when the work is in the library,
 *              otherwise its DOI ("10.1186/…"), or its OpenAlex id ("W123") when it has no DOI. Updating again
 *              after adding papers turns those DOIs into links.
 *
 * `cited_by` is no longer written (it would need updating whenever a new paper cites one): it is removed from
 * every note found in OpenAlex on update. Obsidian's backlinks show the same thing. In a note OpenAlex does not
 * return, only the entries of papers that are in the library now become links (`relinkCites`); nothing else changes.
 * The same offline step runs on its own, without OpenAlex, after papers are added (bin/check-citations.js).
 *
 * The "Unlinked cited works" section that Library Studio wrote (the same outside works, as OpenAlex ids) is removed
 * from every note found in OpenAlex. Only these generated parts of a note change; the rest of the text stays as it
 * is, line endings included.
 * @module domain/library-citations
 */
import { normalizeDoi } from "./matching.js";
import { compareCodePoints } from "./text-rules.js";

const OLD_SECTION = ["<!-- library-studio:citations:start -->", "<!-- library-studio:citations:end -->"];
export const UNLINKED = Object.freeze(["<!-- library-studio:unlinked-cites:start -->", "<!-- library-studio:unlinked-cites:end -->"]);

/** "https://openalex.org/W123" → "W123". */
export const shortId = id => String(id ?? "").replace(/^https?:\/\/openalex\.org\//, "");

/**
 * Who cites whom.
 * @param {Map<string, string>} dois  note name → normalised DOI ("" when none)
 * @param {Map<string, {id: string, referenced: string[]}>} works  normalised DOI → OpenAlex work (ids as given)
 * @param {Map<string, string[]>} [refsPdf]  note name → note names it cites according to its PDF (`references_pdf`)
 * @param {object} [known]
 * @param {Map<string, string>} [known.idStems]  OpenAlex id → note name, for library papers found another way
 *   (the notes' `openalex` property)
 * @param {Set<string>} [known.ids]  OpenAlex ids of library papers without a known note (References.json): left out
 * @param {Map<string, string>} [known.refDois]  OpenAlex id → normalised DOI of the cited works ("" when none)
 * @returns {{refs: Map<string, string[]>, cited: Map<string, string[]>, external: Map<string, string[]>, found: number}}
 *   refs (note names) and external (DOIs, else OpenAlex ids) only for notes found in OpenAlex; cited for every note
 */
export function citationGraph(dois, works, refsPdf = new Map(), { idStems = new Map(), ids = new Set(), refDois = new Map() } = {}) {
  const stemOfId = new Map(idStems);
  for (const [stem, doi] of dois) if (doi && works.has(doi)) stemOfId.set(shortId(works.get(doi).id), stem);
  const stemOfDoi = new Map([...dois].filter(([, d]) => d).map(([s, d]) => [d, s]));
  const refs = new Map(), external = new Map();
  for (const [stem, doi] of dois) {
    if (!doi || !works.has(doi)) continue;
    const inside = new Set(), outside = new Set();
    for (const r of works.get(doi).referenced) {
      const id = shortId(r), refDoi = refDois.get(id) ?? "";
      const s = stemOfId.get(id) ?? (refDoi ? stemOfDoi.get(refDoi) : undefined);   // in the library by id, or by DOI
      if (s) { if (s !== stem) inside.add(s); } else if (!ids.has(id)) outside.add(refDoi || id);
    }
    refs.set(stem, [...inside].sort(compareCodePoints));
    external.set(stem, [...outside].sort(compareCodePoints));
  }
  const cited = new Map([...dois.keys()].map(s => [s, new Set()]));
  for (const [s, list] of refs) for (const r of list) cited.get(r)?.add(s);
  for (const [s, list] of refsPdf) for (const r of list) if (r !== s) cited.get(r)?.add(s);
  return { refs, external, cited: new Map([...cited].map(([s, set]) => [s, [...set].sort(compareCodePoints)])), found: refs.size };
}

/**
 * Offline update of one note's `cites`: plain entries (a DOI, an OpenAlex id) of works that are in the library now
 * become links. Links stay; the other plain entries (outside works, reference texts) stay in their order. Links are
 * sorted as `citationGraph` sorts them, so a later OpenAlex update writes the same list.
 * @param {string[]} cites  the `cites` values as read: "[[note]]", "10.…", "W123" or a reference text
 * @param {string} self  the note's own name: a work that is the note itself is not linked
 * @param {{stemOfDoi: Map<string, string>, stemOfId: Map<string, string>}} known  normalised DOI / OpenAlex id → note
 * @returns {{links: string[], plain: string[], linked: string[]}|null}  null when no entry becomes a link
 */
export function relinkCites(cites, self, { stemOfDoi, stemOfId }) {
  const links = new Set(), plain = [], linked = [];
  for (const v of cites) {
    const link = /^\[\[([^\]|#]+)/.exec(v);
    if (link) { links.add(link[1].trim()); continue; }
    const stem = /^W\d+$/.test(v) ? stemOfId.get(v) : stemOfDoi.get(normalizeDoi(v));
    if (stem && stem !== self) { links.add(stem); linked.push(v); }
    else plain.push(v);
  }
  return linked.length ? { links: [...links].sort(compareCodePoints), plain, linked } : null;
}

/** YAML lines of a list ("key: []" when empty): links to notes first, then plain values (DOIs, OpenAlex ids). */
export function formatList(key, items, plain = []) {
  if (!items?.length && !plain.length) return `${key}: []\n`;
  return `${key}:\n` + (items ?? []).map(s => `  - "[[${s}]]"\n`).join("") + plain.map(v => `  - "${v.replace(/["\\]/g, "\\$&")}"\n`).join("");
}

/** The note with these properties replaced where they are, or added at the end (`cites` is the last property). */
export function replaceProps(text, lines) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(lf);
  if (!m) return text;
  let block = m[1] + "\n";
  for (const [key, value] of Object.entries(lines)) {
    const re = new RegExp(`^${key}:[^\n]*\n(?:[ \t]+-[^\n]*\n)*`, "m");
    block = re.test(block) ? block.replace(re, () => value) : block + value;
  }
  block = block.replace(/\n$/, "");
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

/**
 * The note with `cites` replaced, and the retired properties (references, sites, cited_by) and "Citation network"
 * section removed.
 * @param {string[]} refs library notes it cites @param {string[]} [cited] not written any more (kept for callers)
 * @param {string[]} [external] cited works outside the library (DOIs, else OpenAlex ids), listed after the links
 */
export function withCitations(text, refs, cited = [], external = []) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let out = withoutCitationProps(text);
  out = replaceProps(out, { cites: formatList("cites", refs, external) });
  out = out.replace(blockRe(OLD_SECTION), "").replace(/[ \t]*(?:\r?\n)*$/, "");
  return `${out}${eol}`;
}

/** The note without Library Studio's "Unlinked cited works" section (those works are in `cites` now). */
export function withoutUnlinked(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (!text.includes(UNLINKED[0])) return text;
  return `${text.replace(blockRe(UNLINKED), "").replace(/[ \t]*(?:\r?\n)*$/, "")}${eol}`;
}

/** Counts for the page: papers, found in OpenAlex, links between library papers, outside works, the most cited. */
export function citationSummary(dois, { refs, cited, found, external = new Map() }, top = 10) {
  const links = [...refs.values()].reduce((a, r) => a + r.length, 0);
  const outside = [...external.values()].reduce((a, r) => a + r.length, 0);
  const most = [...dois.keys()].sort((a, b) => cited.get(b).length - cited.get(a).length || compareCodePoints(a, b)).slice(0, top);
  return { publications: dois.size, found, links, outside, missing: dois.size - found, mostCited: most.map(s => ({ stem: s, count: cited.get(s).length })) };
}
