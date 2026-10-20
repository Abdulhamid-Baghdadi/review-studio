// Browser smoke test: opens the finished example in headless Chromium, walks through every page with the app's
// own "next page" shortcut (Alt+↓), opens the help, glossary and timeline panels, and fails on any console error
// or uncaught exception. It also writes the text of every page to a file, so that a refactor can be checked
// against the text before it ("the page still says the same thing").
//
//   node tests/smoke/pages.mjs [out.json]      (Playwright is a devDependency: npm install)
// On every page it also checks the accessibility floor (tests/smoke/a11y.mjs) in light and dark and at 400 px.
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { audit, narrow } from "./a11y.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const PORT = 8790 + Math.floor(Math.random() * 100);
const out = process.argv[2];

const server = spawn(process.execPath, [resolve(ROOT, "scripts/serve.js"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise(ok => server.stdout.once("data", ok));

const errors = [];
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
try {
  const page = await (await browser.newContext({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } })).newPage();
  page.on("console", m => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => errors.push(`page: ${e.message}`));
  const text = () => page.evaluate(() => document.querySelector("#page")?.innerText ?? "");
  const where = () => page.evaluate(() => location.hash);

  // Headless Chromium's private storage refuses some non-ASCII file names (e.g. "Sit–Stand") that Chrome on
  // Windows accepts: serve the example with those characters in its paths replaced, the same before and after.
  await page.route("**/example/example-review.json", async route => {
    const ex = await (await route.fetch()).json();
    const ascii = obj => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k.replace(/[^\x20-\x7e]/g, "-"), v]));
    await route.fulfill({ json: { ...ex, files: ascii(ex.files), binary: ascii(ex.binary), linked: ascii(ex.linked) } });
  });
  await page.goto(`http://localhost:${PORT}/web/#example`);
  await page.evaluate(() => window.studioReady);
  await page.waitForFunction(() => window.backend?.entry?.example && document.querySelector("#page")?.innerText.length > 200);
  await page.keyboard.press("Escape");                     // a first-visit tour, if one is offered

  // A page is told apart by its address and its text (the parts of Screen papers share one address).
  const here = async () => `${await where()} ${(await text()).slice(0, 160)}`;
  const pages = {};
  // The accessibility floor (docs/ui-ux-rules.md, group A) on every page, light and dark, then at 400 px wide.
  const a11y = [];
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });   // measure the end colours
  const checkFloor = async name => {
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    for (const t of ["light", "dark"]) {
      await page.evaluate(v => { document.documentElement.dataset.theme = v; }, t); await page.waitForTimeout(30);
      for (const f of await page.evaluate(audit)) a11y.push(`${name} [${t}] ${f}`);
    }
    await page.evaluate(v => { document.documentElement.dataset.theme = v; }, theme);
    await page.setViewportSize({ width: 400, height: 900 }); await page.waitForTimeout(250);
    for (const f of await page.evaluate(narrow)) a11y.push(`${name} [400px] ${f}`);
    await page.setViewportSize({ width: 1400, height: 900 }); await page.waitForTimeout(60);
  };
  for (let i = 0, last = ""; i < 80; i++) {              // back to the first page
    await page.keyboard.press("Alt+ArrowUp"); await page.waitForTimeout(60);
    const w = await here(); if (w === last) break; last = w;
  }
  for (let i = 0, last = ""; i < 120; i++) {             // then forward through every page
    const w = await here();
    if (w === last) break;
    pages[`${String(i).padStart(2, "0")} ${await where()}`] = await text();
    await checkFloor(await where());
    last = w;
    await page.keyboard.press("Alt+ArrowDown"); await page.waitForTimeout(80);
  }
  const panels = {};
  for (const [key, name] of [["?", "help"], ["g", "glossary"], ["t", "timeline"]]) {
    await page.keyboard.press(key); await page.waitForTimeout(150);
    panels[name] = await page.evaluate(() => (document.querySelector(".scrim .modal") ?? document.querySelector("#drawer.open"))?.innerText ?? "(nothing open)");
    await page.keyboard.press("Escape"); await page.waitForTimeout(80);
  }
  // A few actions: they change the example, which is reset each time it is opened.
  const goTo = async hash => {
    for (let i = 0; i < 40 && (await where()) !== hash; i++) { await page.keyboard.press("Alt+ArrowUp"); await page.waitForTimeout(40); }
    for (let i = 0; i < 40 && (await where()) !== hash; i++) { await page.keyboard.press("Alt+ArrowDown"); await page.waitForTimeout(40); }
    if ((await where()) !== hash) throw new Error(`could not reach ${hash}`);
  };
  const actions = {};
  await goTo("#questions"); await goTo("#screening");      // from the start, so the first #screening is titles and abstracts
  await page.evaluate(() => document.querySelector("#page .queue .qitem")?.click()); await page.waitForTimeout(200);
  // the engine's own count of title/abstract decisions, before and after one decision by keyboard
  const decided = () => page.evaluate(async () => (await window.backend.get("/api/state")).records.map(r => r.ta_decision).join(","));
  const before = await decided();
  await page.keyboard.press("e"); await page.keyboard.press("1"); await page.waitForTimeout(500);   // exclude with the first reason
  actions.screening = before !== await decided();
  await goTo("#report");                                    // a step of several parts: one page of sections
  actions.sections = await page.evaluate(() => document.querySelectorAll("#page .stepsection").length === 3 && !document.querySelector(".steptabs"));
  for (const id of ["btnTimeline", "btnKeys", "btnGlossary", "btnScr", "btnTheme", "btnTheme", "btnHome"]) {
    await page.evaluate(i => document.getElementById(i)?.click(), id); await page.waitForTimeout(150);
    await page.keyboard.press("Escape"); await page.waitForTimeout(60);
  }
  actions.home = (await where()) === "#home";
  // Review settings of the example: saving keeps the example open (it has no folder of its own)
  await page.evaluate(() => document.getElementById("btnReviewSettings")?.click()); await page.waitForTimeout(200);
  await page.fill("dialog.modal input[maxlength='12']", "SM");
  await page.evaluate(() => [...document.querySelectorAll("dialog.modal .btn.primary")].find(b => b.textContent === "Save")?.click());
  await page.waitForTimeout(800);
  actions.settings = await page.evaluate(() => Boolean(window.backend.entry?.example) && window.backend.entry.settings.reviewer === "SM" && !document.querySelector("dialog.modal"));
  const result = { pages, panels, actions, errors, a11y };
  if (out) await writeFile(out, JSON.stringify(result, null, 1));
  console.log(`${Object.keys(pages).length} pages: ${Object.keys(pages).join(" ")}`);
  console.log(`panels: ${Object.entries(panels).map(([k, v]) => `${k} ${v.length} chars`).join(", ")}`);
  console.log(`actions: ${Object.entries(actions).map(([k, v]) => `${k} ${v ? "ok" : "FAILED"}`).join(", ")}`);
  if (Object.values(actions).includes(false)) process.exitCode = 1;
  if (a11y.length) { console.error(`accessibility floor: ${a11y.length} failures\n${a11y.join("\n")}`); process.exitCode = 1; } else console.log("accessibility floor: ok");
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; } else console.log("no errors");
} catch (e) {
  console.error(`${e.message.split("\n")[0]}\n${errors.join("\n") || "(no errors in the page)"}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
