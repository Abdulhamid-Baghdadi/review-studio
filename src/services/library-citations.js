/**
 * What the papers of the publication library cite (`cites`), from OpenAlex; an old `cited_by` is removed. Library papers are
 * looked up by DOI, 50 per request (about 4 requests for 200 papers); then the DOIs of the works they cite, 100 per
 * request, so that a cited work outside the library is listed by its DOI. Nothing is written until the reviewer
 * confirms the preview.
 * @module services/library-citations
 */
import { citationGraph, citationSummary, shortId, withCitations, withoutUnlinked } from "../domain/library-citations.js";
import { normalizeDoi } from "../domain/matching.js";
import { allWorks } from "./openalex-client.js";

const REFERENCES_FILE = "References.json";
const BATCH = 50, ID_BATCH = 100;
const linkTarget = v => String(v ?? "").replace(/^!?\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim();
const asList = v => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

/** Note name → normalised DOI, for every publication note. @param {import("./library.js").Library} library */
export const libraryDois = library => new Map([...library.notes].map(([stem, p]) => [stem, normalizeDoi(p.doi)]));

/**
 * @typedef {object} CitationData
 * @property {Map<string, {id: string, referenced: string[]}>} works  the library's OpenAlex works, by normalised DOI
 * @property {Map<string, string>} refDois  OpenAlex id ("W123") of each cited work → its normalised DOI ("" when none)
 */

/**
 * The OpenAlex works of the library's DOIs, and the DOIs of the works they cite. DOIs the filter syntax cannot
 * carry (":", ",", "|") are left out, as in Library Studio. When OpenAlex holds two works with one DOI, the first
 * keeps its id and gets the references of both. @returns {Promise<CitationData>}
 */
export async function fetchLibraryWorks(library, openalex, onProgress = () => {}) {
  const dois = [...new Set([...libraryDois(library).values()].filter(d => d && !/[:,|]/.test(d)))];
  const works = new Map();
  for (let i = 0; i < dois.length; i += BATCH) {
    onProgress(`Asking OpenAlex for the library's papers (${i / BATCH + 1} of ${Math.ceil(dois.length / BATCH)})…`);
    for (const w of await allWorks(openalex, { filter: "doi:" + dois.slice(i, i + BATCH).join("|"), select: "id,doi,referenced_works" })) {
      const doi = normalizeDoi(w.doi), known = works.get(doi), referenced = w.referenced_works ?? [];
      works.set(doi, known ? { id: known.id, referenced: [...new Set([...known.referenced, ...referenced])] } : { id: w.id, referenced });
    }
  }
  const inLibrary = new Set([...works.values()].map(w => shortId(w.id)));
  const cited = [...new Set([...works.values()].flatMap(w => w.referenced.map(shortId)))].filter(id => /^W\d+$/.test(id) && !inLibrary.has(id));
  const refDois = new Map(cited.map(id => [id, ""]));
  for (let i = 0; i < cited.length; i += ID_BATCH) {
    onProgress(`Asking OpenAlex for the DOIs of the cited works (${i / ID_BATCH + 1} of ${Math.ceil(cited.length / ID_BATCH)})…`);
    for (const w of await allWorks(openalex, { filter: "openalex:" + cited.slice(i, i + ID_BATCH).join("|"), select: "id,doi" })) refDois.set(shortId(w.id), normalizeDoi(w.doi));
  }
  return { works, refDois };
}

/**
 * What the citation step would change: each note's new text, and the counts. Notes OpenAlex did not return are
 * left as they are: their `cites` may come from elsewhere (Library Studio's title match, a reading of the PDF), and
 * an empty or partial answer from OpenAlex must never empty it.
 * @param {CitationData} data
 * @returns {Promise<{summary: object, changes: {stem: string, text: string, next: string}[]}>}
 */
export async function planLibraryCitations(library, { works, refDois }) {
  const dois = libraryDois(library);
  const refsPdf = new Map([...library.notes].map(([stem, p]) => [stem, asList(p.references_pdf).map(linkTarget)]));
  const graph = citationGraph(dois, works, refsPdf, { ...(await knownLibraryIds(library)), refDois });
  const changes = [];
  for (const stem of library.notes.keys()) {
    if (!graph.refs.has(stem)) continue;                // not found in OpenAlex: nothing to replace its cites with
    const text = await library.folder.readText(`${stem}.md`);
    const next = withoutUnlinked(withCitations(text, graph.refs.get(stem), graph.cited.get(stem) ?? [], graph.external.get(stem) ?? []));
    if (next !== text) changes.push({ stem, text, next });
  }
  return { summary: citationSummary(dois, graph), changes };
}

/**
 * Library papers known without a DOI lookup: the notes' `openalex` property (id → note), and the papers in
 * References.json (written by Library Studio's enrich, which also matches by title; ids only).
 */
async function knownLibraryIds(library) {
  const idStems = new Map([...library.notes].map(([stem, p]) => [shortId(p.openalex), stem]).filter(([id]) => id));
  const ids = new Set();
  if (await library.folder.exists(REFERENCES_FILE)) {
    try {
      for (const p of Object.values(JSON.parse(await library.folder.readText(REFERENCES_FILE)).papers ?? {})) if (p?.openalex && !idStems.has(shortId(p.openalex))) ids.add(shortId(p.openalex));
    } catch { /* an unreadable file adds nothing */ }
  }
  return { idStems, ids };
}

/** Writes the planned notes. @returns {Promise<number>} notes written */
export async function writeLibraryCitations(library, changes) {
  for (const c of changes) await library.folder.writeText(`${c.stem}.md`, c.next);
  return changes.length;
}
