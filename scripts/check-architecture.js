// Enforces the dependency rules in ARCHITECTURE.md: each layer may import only the layers listed for it.
// Run with `npm run check`; exits with an error listing every violation.
//
//   src/   the engine: domain ← ports ← services ← adapters ← ui (src/index.js is the public API)
//   web/   the page:   web/main.js and web/start/ may use the public API and src/ui; web/studio/ only talks to the
//          engine through window.backend, in layers core ← ui ← shell ← pages ← app.js
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, dirname, sep } from "node:path";

const REPO = resolve(import.meta.dirname, "..");

/** Each area: the files it covers, how a file's layer is found, which layers each layer may import. */
const AREAS = [
  {
    name: "src", root: "src",
    layerOf: r => (r.length > 1 ? `src/${r[0]}` : "src/index"),
    allowed: {
      "src/domain": ["src/domain"],                                         // pure: no I/O, no platform APIs
      "src/ports": ["src/ports", "src/domain"],                             // interfaces (types only)
      "src/services": ["src/services", "src/domain", "src/ports"],          // use cases
      "src/adapters": ["src/adapters", "src/domain", "src/ports"],          // platform code implementing ports
      "src/ui": ["src/ui", "src/index", "src/adapters"],                    // the browser shell
      "src/index": ["src/domain", "src/ports", "src/services", "src/adapters"],
    },
    platformFree: new Set(["src/domain", "src/ports", "src/services"]),   // must run unchanged in the browser
    packages: new Set(),
  },
  {
    name: "web", root: "web",
    layerOf: r => (r[0] === "studio" ? (r.length > 2 ? `studio/${r[1]}` : "studio/app") : r[0] === "start" ? "start" : r.length === 1 ? "main" : `web/${r[0]}`),
    allowed: {
      main: ["start", "src/index", "src/ui"],
      start: ["start", "src/index", "src/ui"],
      "studio/core": ["studio/core"],
      "studio/ui": ["studio/ui", "studio/core"],
      "studio/shell": ["studio/shell", "studio/ui", "studio/core"],
      "studio/pages": ["studio/pages", "studio/shell", "studio/ui", "studio/core"],
      "studio/app": ["studio/pages", "studio/shell", "studio/ui", "studio/core"],
    },
    platformFree: new Set(),
    packages: new Set(["pdfjs", "pdfjs/worker"]),                           // the import map in web/index.html
    skip: new Set(["web/sw.js", "web/install.js"]),                         // classic scripts, not modules
  },
];

async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

/** The layer of any file in the repository, as the area it belongs to names it. */
function layerAnywhere(file) {
  const rel = relative(REPO, file).split(sep);
  const area = AREAS.find(a => rel[0] === a.root);
  return area ? area.layerOf(rel.slice(1)) : rel.join("/");
}

const problems = [];
let checked = 0;
for (const area of AREAS) {
  for (const file of await files(join(REPO, area.root))) {
    const where = relative(REPO, file).split(sep).join("/");
    if (area.skip?.has(where)) continue;
    const layer = area.layerOf(relative(join(REPO, area.root), file).split(sep));
    const allowed = area.allowed[layer];
    if (!allowed) { problems.push(`${where}: in no layer (${layer}); add it to scripts/check-architecture.js`); continue; }
    checked++;
    const text = await readFile(file, "utf8");
    const imports = text.matchAll(/^\s*(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm);
    for (const m of imports) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith("node:") || !spec.startsWith(".")) {
        if (area.platformFree.has(layer)) problems.push(`${where}: imports "${spec}" — ${layer} must not depend on a platform or package`);
        else if (area.name === "web" && !area.packages.has(spec)) problems.push(`${where}: imports "${spec}" — the page only uses the packages of its import map`);
        continue;
      }
      const target = layerAnywhere(resolve(dirname(file), spec));
      if (!allowed.includes(target)) problems.push(`${where}: imports ${target} — ${layer} may import ${allowed.join(", ")}`);
    }
  }
}
if (problems.length) {
  console.error(`Architecture: ${problems.length} violation(s)\n` + problems.map(p => "  " + p).join("\n"));
  process.exit(1);
}
console.log(`Architecture: dependency rule respected (${checked} modules in src/ and web/).`);
