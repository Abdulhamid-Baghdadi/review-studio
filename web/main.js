// Start of Review Studio in the browser: checks the browser, loads help texts, templates and pdf.js, shows
// the start screen (recent reviews, open a folder, new review), then loads the Review Studio page.
import * as pdfjs from "pdfjs";
import { Backend } from "../src/ui/backend.js";
import { forgetReview, recentReviews, rememberReview } from "../src/adapters/browser-store.js";
import { stages } from "../src/index.js";

pdfjs.GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs/worker");

const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
};
const button = (label, onclick, cls = "") => el("button", { className: `btn ${cls}`, onclick, type: "button" }, label);
const say = (text, kind = "") => $("#startBody").querySelector(".start-msg")?.replaceChildren(el("span", { className: kind }, text));
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

// ------------------------------------------------------------------ start screen chrome: the stages, light / dark

function startSteps() {
  const nav = $("#startSteps"), box = $("#startStage");
  let phase = null;
  stages.REVIEW_TYPES[stages.NEW_REVIEW_TYPE].steps.forEach((st, i) => {
    if (st.phase !== phase) nav.append(el("div", { className: "phase" }, phase = st.phase));
    const step = el("div", { className: "step", title: st.hint },
      el("span", { className: "dot" }, String(i + 1)),
      el("span", { className: "lbl" }, el("span", { className: "t" }, st.title), el("span", { className: "hint" }, st.hint)));
    step.onclick = () => {                    // a preview of what the step is for
      nav.querySelectorAll(".step.active").forEach(x => x.classList.remove("active"));
      step.classList.add("active");
      const desc = k => stages.REVIEW_TYPES[stages.NEW_REVIEW_TYPE].stages.find(x => x.key === k).description;
      const parts = st.tabs.map(t => [t.label, desc(t.stage)]).filter(([, d], k, all) => all.findIndex(x => x[1] === d) === k);
      box.replaceChildren(el("b", {}, `${i + 1} · ${st.title}`),
        ...parts.map(([label, d]) => el("span", { className: "muted" }, st.tabs.length > 1 ? `${label}: ${d}` : d)));
      box.hidden = false;
    };
    nav.append(step);
  });
  $("#startTheme").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    remember("theme", next);
  };
}
startSteps();

// ------------------------------------------------------------------ the browser must be able to open folders
if (!("showDirectoryPicker" in window)) {
  $("#start").hidden = false;
  $("#startBody").replaceChildren(el("div", { className: "callout" },
    "This browser cannot open folders on your PC. Use Google Chrome or Microsoft Edge on a computer."));
  throw new Error("File System Access API not available");
}

const text = path => fetch(new URL(path, import.meta.url)).then(r => r.text());
const backend = new Backend({
  help: await fetch(new URL("help.json", import.meta.url)).then(r => r.json()),
  templates: { record: await text("templates/Review Record Template.md"), publication: await text("templates/Publication Template.md") },
  example: async () => ({                         // the review as JSON; its full texts are separate files next to it
    ...(await fetch(new URL("example/example-review.json", import.meta.url)).then(r => r.json())),
    fetchLinked: path => fetch(new URL(`example/${path}`, import.meta.url)).then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.arrayBuffer(); }),
  }),
  pdfjs,
});
window.backend = backend;

// ------------------------------------------------------------------ opening a review

async function openReview(entry) {
  const started = performance.now();
  say(`Opening ${entry.name}…`);
  let notes = 0;
  await backend.open(entry, { onProgress: (done, total) => { notes = total; say(`Reading notes: ${done.toLocaleString()} of ${total.toLocaleString()}…`); } });
  const read = performance.now();
  say(`Preparing the page (${((read - started) / 1000).toFixed(1)} s so far)…`);
  remember("review", entry.name);
  $("#start").hidden = true;
  $("#app").hidden = false;
  await import("./review-studio.js");
  $("#btnReviewSettings").onclick = reviewSettings;
  await window.studioReady;                                              // the first page is drawn
  showOpenTiming({ review: entry.name, notes, readSeconds: (read - started) / 1000, totalSeconds: (performance.now() - started) / 1000 });
}

/** How long opening took, shown for 20 s (click to close) and kept as window.openTiming. */
function showOpenTiming(t) {
  window.openTiming = t;
  console.info("Review Studio open timing", t);
  if (!t.notes) return;                         // nothing worth timing (the draft, a new review)
  const note = document.createElement("div");
  note.className = "toast";
  note.title = "Click to close";
  note.textContent = `Opened ${t.notes ? t.notes.toLocaleString() + " notes" : "the review"} in ${t.totalSeconds.toFixed(1)} s ` +
    `(reading the folder ${t.readSeconds.toFixed(1)} s, showing the page ${(t.totalSeconds - t.readSeconds).toFixed(1)} s)`;
  note.onclick = () => note.remove();
  $("#toasts").append(note);
  setTimeout(() => note.remove(), 20000);
}

/** A new review: a folder "<name> records" inside the folder the user picks. */
async function newReview() {
  const name = prompt("Name of the review (e.g. 'Repairability review'):")?.trim();
  if (!name) return;
  const parent = await window.showDirectoryPicker({ id: "parent", mode: "readwrite" });
  const handle = await parent.getDirectoryHandle(`${name} records`, { create: true });
  await openReview(await rememberReview(handle, { recordsPath: `${name} records/08 - Records` }));
}

/** Shows any failure on the start screen, in words (a refused or cancelled folder included). */
function explain(e) {
  console.error(e);
  if (e?.name === "AbortError") return say(`No folder was opened: the folder window was closed, or the browser refused that folder or the permission to edit it. Try again and choose the review folder itself. (Browser: "${e.message}")`, "err");
  if (e?.name === "SecurityError") return say("The browser blocked the folder window. Click the button again (it must be a direct click).", "err");
  say(`${e?.name ?? "Error"}: ${e?.message ?? e}`, "err");
}

async function openFolder() {
  say("Choose the review folder in the window that opened…");
  const entry = await backend.pickFolder();
  say(`Got "${entry.name}". Asking permission to edit files in it…`);
  if (!(await Backend.isReviewFolder(entry.handle))
    && !confirm(`"${entry.name}" has no review files yet (no 08 - Records, 07 - Searches.csv or review_state.json). Start a new review in it?`)) return;
  await openReview(entry);
}

// ------------------------------------------------------------------ review settings (Obsidian, library)

async function reviewSettings() {
  const entry = backend.entry;
  const s = { ...(entry.settings ?? {}) };
  const vault = el("input", { type: "text", value: s.vault ?? "", placeholder: "e.g. My research vault" });
  const path = el("input", { type: "text", value: (s.recordsPath ?? `${entry.name}/08 - Records`).replace(/\/08 - Records$/, ""), placeholder: entry.name });
  const lib = el("span", { className: "muted" }, s.library ? s.library.name : "none");
  const initials = el("input", { type: "text", value: s.reviewer ?? "", placeholder: "e.g. AB", maxLength: 12 });
  const dialog = el("dialog", { className: "modal" },
    el("div", { className: "mh" }, "Review settings"),
    el("div", { className: "mb stack" },
      el("label", { className: "field" }, el("span", {}, "Your initials (written with each of your decisions in the decision log)"), initials),
      el("label", { className: "field" }, el("span", {}, "Obsidian vault name (to open notes in Obsidian)"), vault),
      el("label", { className: "field" }, el("span", {}, "Path of this review folder inside the vault"), path),
      el("div", { className: "row" }, el("span", {}, "Library folder (publication notes): "), lib,
        button("Choose…", async () => { s.library = await window.showDirectoryPicker({ id: "library", mode: "readwrite" }); lib.textContent = s.library.name; }, "sm"),
        button("None", () => { delete s.library; lib.textContent = "none"; }, "sm ghost"))),
    el("div", { className: "mf" },
      button("Cancel", () => dialog.close(), ""),
      button("Save", async () => {
        Object.assign(s, { reviewer: initials.value.trim(), vault: vault.value.trim(), recordsPath: `${path.value.trim() || entry.name}/08 - Records` });
        await backend.open(await rememberReview(entry.handle, s));
        dialog.close();
        location.reload();
      }, "primary")));
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

// ------------------------------------------------------------------ start screen

async function startScreen() {
  const recent = await recentReviews();
  const list = recent.map(r => el("div", { className: "recent" },
    el("span", { className: "name", title: r.name }, "📁 ", r.name.replace(/ records$/, "")),
    el("span", { className: "muted small" }, new Date(r.opened).toLocaleDateString()),
    button("Forget", async () => { await forgetReview(r.id); startScreen(); }, "sm ghost"),
    button("Continue →", () => openReview(r).catch(explain), "sm primary")));
  $("#startBody").replaceChildren(...[
    el("div", { className: "start-actions" },
      button("＋ New review…", () => newReview().catch(explain), list.length ? "" : "primary"),
      button("📂 Open a review folder…", () => openFolder().catch(explain), "")),
    list.length ? el("div", { className: "recents" }, el("h3", {}, "Continue where you left off"), ...list) : null,
    el("p", { className: "start-msg small muted" }, "Works in Chrome or Edge on a computer. The browser asks once per visit before the app may use a folder."),
  ].filter(Boolean));
}

// The app opens on the draft review (kept in the browser), so the workspace is there straight away; the draft
// bar offers saving it to a folder, opening a review folder and the reviews opened before. The start page is
// only shown when that fails.
openReview(await backend.draftEntry()).catch(e => {
  $("#app").hidden = true;
  $("#start").hidden = false;
  startScreen().then(() => explain(e));
});
