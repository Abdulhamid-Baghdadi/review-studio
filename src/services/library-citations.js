/**
 * Citations between the papers of the publication library (`cites`, `cited_by`, "Unlinked cited works"), from
 * OpenAlex. Library papers are looked up by DOI, 50 per request (about 4 requests for 200 papers); nothing is
 * written until the reviewer confirms the preview.
 * @module services/library-citations
 */
import { citationGraph, citationSummary, shortId, withCitations, withUnlinked } from "../domain/library-citations.js";

const REFERENCES_FILE = "References.json";
import { normalizeDoi } from "../domain/matching.js";

const BATCH = 50;
const linkTarget = v => String(v ?? "").replace(/^!?\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim();
const asList = v => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

/** Note name → normalised DOI, for every publication note. @param {import("./library.js").Library} library */
export const libraryDois = library => new Map([...library.notes].map(([stem, p]) => [stem, normalizeDoi(p.doi)]));

/**
 * The OpenAlex works of the library's DOIs. DOIs the filter syntax cannot carry (":", ",", "|") are left out,
 * as in Library Studio. @returns {Promise<Map<string, {id: string, referenced: string[]}>>} by normalised DOI
 */
export async function fetchLibraryWorks(library, openalex, onProgress = () => {}) {
  const dois = [...new Set([...libraryDois(library).values()].filter(d => d && !/[:,|]/.test(d)))];
  const works = new Map();
  for (let i = 0; i < dois.length; i += BATCH) {
    onProgress(`Asking OpenAlex (${i / BATCH + 1} of ${Math.ceil(dois.length / BATCH)})…`);
    const json = await openalex.get("works", { filter: "doi:" + dois.slice(i, i + BATCH).join("|"), "per-page": BATCH, select: "id,doi,referenced_works" });
    for (const w of json?.results ?? []) works.set(normalizeDoi(w.doi), { id: w.id, referenced: w.referenced_works ?? [] });
  }
  return works;
}

/**
 * What the citation step would change: each note's new text, and the counts. Notes not found in OpenAlex keep
 * their "Unlinked cited works" block (it may come from elsewhere); their `cites` is emptied, as in Library Studio.
 * @returns {Promise<{summary: object, changes: {stem: string, text: string, next: string}[]}>}
 */
export async function planLibraryCitations(library, works) {
  const dois = libraryDois(library);
  const refsPdf = new Map([...library.notes].map(([stem, p]) => [stem, asList(p.references_pdf).map(linkTarget)]));
  const graph = citationGraph(dois, works, refsPdf, await knownLibraryIds(library));
  const changes = [];
  for (const stem of library.notes.keys()) {
    const text = await library.folder.readText(`${stem}.md`);
    let next = withCitations(text, graph.refs.get(stem) ?? [], graph.cited.get(stem) ?? []);
    if (graph.external.has(stem)) next = withUnlinked(next, graph.external.get(stem));
    if (next !== text) changes.push({ stem, text, next });
  }
  return { summary: citationSummary(dois, graph), changes };
}

/**
 * OpenAlex ids of library papers known without a DOI lookup: the notes' `openalex` property, and the papers in
 * References.json (written by Library Studio's enrich, which also matches by title).
 */
async function knownLibraryIds(library) {
  const ids = new Set([...library.notes.values()].map(p => shortId(p.openalex)).filter(Boolean));
  if (await library.folder.exists(REFERENCES_FILE)) {
    try {
      for (const p of Object.values(JSON.parse(await library.folder.readText(REFERENCES_FILE)).papers ?? {})) if (p?.openalex) ids.add(shortId(p.openalex));
    } catch { /* an unreadable file adds nothing */ }
  }
  return ids;
}

/** Writes the planned notes. @returns {Promise<number>} notes written */
export async function writeLibraryCitations(library, changes) {
  for (const c of changes) await library.folder.writeText(`${c.stem}.md`, c.next);
  return changes.length;
}
