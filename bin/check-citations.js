#!/usr/bin/env node
/**
 * Brings the `cites` property of the publication library up to date, for use after papers are added by hand.
 *
 *   node bin/check-citations.js                 preview: cites entries (DOI, OpenAlex id) of papers now in the library
 *                                               that would become links; offline, no OpenAlex requests
 *   node bin/check-citations.js --write         the same, and save the notes
 *   node bin/check-citations.js --openalex      the full "Check citations" of the Report page: also fetches the
 *                                               reference lists of new papers (about 60 OpenAlex requests)
 *   node bin/check-citations.js --openalex --write
 *
 * Options: --library "<folder of the publication notes>" (default: "00 - Library/Publication Summary", "00 - Library"
 * or "98 - Publications" in the current folder, e.g. the Obsidian vault) · --api-key KEY (or OPENALEX_API_KEY): a free
 * OpenAlex key raises the daily budget. Each note keeps its line endings (CRLF or LF). Nothing is written without --write.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { nodeFolder } from "../src/adapters/node-folder.js";
import { fetchHttp } from "../src/adapters/fetch-http.js";
import { openLibrary } from "../src/services/library.js";
import { fetchLibraryWorks, planLibraryCitations, planRelinkCitations, writeLibraryCitations } from "../src/services/library-citations.js";
import { OpenAlexClient, OpenAlexError } from "../src/services/openalex-client.js";
import { findLibraryFolder } from "./library-folder.js";

const { values: opt } = parseArgs({ options: {
  library: { type: "string" }, openalex: { type: "boolean" }, write: { type: "boolean" }, "api-key": { type: "string" }, help: { type: "boolean", short: "h" },
} });
if (opt.help) { console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n/, "").replace(/^ \* ?/gm, "")); process.exit(0); }

const dir = opt.library ? resolve(opt.library) : findLibraryFolder(process.cwd());
if (!dir || !existsSync(dir)) {
  console.error(`No library folder found. Run this from the vault folder, or give it with --library "<folder of the publication notes>".`);
  process.exit(1);
}

// The Node folder reads with "\n"; write each note back with the line endings it has on disk.
const disk = nodeFolder(dir);
const folder = { ...disk, writeText: (path, text) => disk.writeText(path, readFileSync(join(dir, path), "utf8").includes("\r\n") ? text.replace(/\r?\n/g, "\r\n") : text) };
const library = await openLibrary(folder);
console.log(`Library: ${relative(process.cwd(), dir) || "."} (${library.notes.size} publication notes)`);

const linksIn = text => new Set([...(/^cites:\n((?:[ \t]+-[^\n]*\n)*)/m.exec(text)?.[1] ?? "").matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]));
const newLinks = c => [...linksIn(c.next)].filter(l => !linksIn(c.text).has(l));

let changes;
if (opt.openalex) {
  const client = new OpenAlexClient({ http: fetchHttp(), apiKey: opt["api-key"] ?? process.env.OPENALEX_API_KEY ?? "" });
  try {
    const plan = await planLibraryCitations(library, await fetchLibraryWorks(library, client, m => console.log(m)));
    const s = plan.summary;
    console.log(`Found in OpenAlex: ${s.found} of ${s.publications} papers · ${s.links} links between library papers · ${s.outside} cited works outside the library · ${s.relinked} other note(s) relinked`);
    changes = plan.changes;
  } catch (e) {
    if (!(e instanceof OpenAlexError)) throw e;
    console.error(`${e.message} Nothing was written; the offline check (without --openalex) still works.`);
    process.exit(1);
  }
} else {
  changes = await planRelinkCitations(library);
}

if (!changes.length) { console.log("Up to date: no note to change."); process.exit(0); }
console.log(`${changes.length} note(s) to update:`);
for (const c of changes) {
  const added = newLinks(c);
  console.log(`  ${c.stem}${added.length ? `\n      now links to: ${added.join(" · ")}` : " (cites refreshed from OpenAlex)"}`);
}
if (!opt.write) { console.log("Preview only: run again with --write to save these notes."); process.exit(0); }
console.log(`Written: ${await writeLibraryCitations(library, changes)} note(s).`);
