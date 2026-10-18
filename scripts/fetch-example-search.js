// Runs the example review's OpenAlex search and saves the records as they came (with the string, filter and date).
//   node scripts/fetch-example-search.js "<OpenAlex search string>"
// Output: web/example/openalex-search.json, the input of scripts/build-example.js. Run it once; the example is then
// rebuilt from the saved file, so it does not change when OpenAlex does. No personal data is sent with the requests.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const query = process.argv[2];
if (!query) throw new Error('usage: node scripts/fetch-example-search.js "<OpenAlex search string>"');
const filter = `title_and_abstract.search:${query}`;
const API = "https://api.openalex.org/works";

// OpenAlex gives the abstract as an inverted index: word → positions
const abstractOf = index => {
  if (!index) return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter(Boolean).join(" ");
};

const works = [];
let page_ = 1, count = 0;
for (;;) {
  const url = `${API}?${new URLSearchParams({ filter, per_page: "100", page: String(page_++) })}`;   // pages: cursors need an API key
  const res = await fetch(url, { headers: { "User-Agent": "scoping-review-workbench (example builder)" } });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${await res.text()}`);
  const page = await res.json();
  count = page.meta.count;
  for (const w of page.results) {
    const oa = w.best_oa_location ?? w.primary_location ?? {};
    works.push({
      id: w.id.replace("https://openalex.org/", ""), doi: w.doi ?? "", year: w.publication_year, title: w.title ?? w.display_name ?? "",
      type: w.type, lang: w.language ?? "", authors: (w.authorships ?? []).map(a => a.author?.display_name).filter(Boolean).join("; "),
      journal: w.primary_location?.source?.display_name ?? "", oa: w.open_access?.oa_url ?? "", license: oa.license ?? "",
      pdf: oa.pdf_url ?? "", landing: w.doi ?? oa.landing_page_url ?? "", abstract: abstractOf(w.abstract_inverted_index),
    });
  }
  if (!page.results.length || works.length >= count) break;
}
const out = { source: "OpenAlex", api: API, filter, query, retrieved: new Date().toISOString(), count, works };
writeFileSync(resolve(import.meta.dirname, "..", "web", "example", "openalex-search.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${works.length} of ${count} records → web/example/openalex-search.json`);
