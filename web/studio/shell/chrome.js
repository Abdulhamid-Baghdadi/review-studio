/**
 * Everything around the page: top bar, sections, metrics, AI card, where files are kept; render() draws it all.
 * @module web/studio/shell/chrome
 */
import { api, backend, busy, getJSON } from "../core/api.js";
import { $, h, store } from "../core/dom.js";
import { CUR, HOME, PART, REVIEW, S, SC } from "../core/state.js";
import { PAGES } from "./registry.js";
import { openHelp } from "./help.js";
import { flowMap } from "./journey-map.js";
import { curTab, go, goTab, pageIndex, pageSequence, sectioned, sectionId, skipStage, stage, stepOf, stepStatus } from "./navigation.js";
import { openReviewFolder, renderDraftBar, saveDraft, switchReview } from "./reviews.js";
import { btn, copy, iconBtn, libraryName, openNote, pill, segmented, statusKind } from "../ui/components.js";
import { toast } from "../ui/dialogs.js";
import { aiStrip } from "../ui/ai-strip.js";

/** "AI" next to a step where AI can help: grey while off, in the accent colour when the review switched it on. */
export function aiMark(keys) {
  const steps = [keys].flat().filter(k => S.ai?.steps[k]);
  if (!steps.length) return null;
  const on = steps.some(k => (S.ai.modes[k] || "off") !== "off");
  return h("span", { class: "ai-mark" + (on ? " on" : ""), title: on ? "AI assistance is on here" : "AI can help here (off; switch it on in the AI assistance card)" }, "AI");
}

/** A review's name as people say it: "My review" (the draft), "Example review", or the folder's name. */
const reviewLabel = r => r.startsWith("📘") ? "Example review" : r === S.reviews[0] ? "My review" : r.split(/[\\/]/).pop().replace(/ records$/, "");

/** The review button in the top bar: the review's name; its menu switches review, opens a folder or saves the draft. */
function renderPicker() {
  const b = $("#btnReview"), menu = $("#reviewMenu");
  const icon = backend.entry?.example ? "📘" : backend.entry?.draft ? "📝" : "📁";
  b.replaceChildren(h("span", { class: "rb-icon", "aria-hidden": "true" }, icon), h("span", { class: "rb-name" }, reviewLabel(REVIEW)), h("span", { class: "rb-caret", "aria-hidden": "true" }, "▾"));
  b.title = /[\\/]/.test(REVIEW) ? `${REVIEW} — switch review, open a folder, save` : "Your reviews: switch, open a folder, save";
  const folder = r => r !== S.reviews[0] && !r.startsWith("📘");      // a review folder on the PC (not the draft or the example)
  const pick = r => h("button", { class: "btn ghost" + (r === REVIEW ? " current" : ""), onclick: () => r !== REVIEW && switchReview(r) },
    h("span", { class: "rm-check" }, r === REVIEW ? "✓" : ""), r.startsWith("📘") ? "📘 " : r === S.reviews[0] ? "📝 " : "📁 ", reviewLabel(r),
    r === S.reviews[0] ? h("span", { class: "rm-note" }, "in this browser") : r.startsWith("📘") ? h("span", { class: "rm-note" }, "finished, not kept") : null);
  const item = r => folder(r) ? h("div", { class: "rm-row" }, pick(r),
    iconBtn("✕", `Remove ${reviewLabel(r)} from this list (its folder stays on your PC)`, () => forgetFromList(r), "sm")) : pick(r);
  menu.replaceChildren(h("div", { class: "rm-head" }, "Your reviews"), ...S.reviews.map(item), h("div", { class: "rm-line" }),
    backend.entry?.draft ? btn("💾 Save my review to a folder…", e => busy(e.currentTarget, saveDraft), "ghost") : null,
    btn("📂 Open a review folder…", openReviewFolder, "ghost"));
}

/** Takes a review folder off the list of reviews (the folder itself stays on the PC); leaving it if it is open. */
async function forgetFromList(r) {
  try {
    await backend.forgetReviewNamed(r);
    S.reviews = (await getJSON("/api/reviews")).reviews;
    if (r === REVIEW) await switchReview(S.reviews[0]); else renderPicker();
    toast(`Removed "${reviewLabel(r)}" from the list. Its folder is still on your PC: open it again with Open a review folder….`, "ok");
  } catch (e) { toast(e.message, "err"); }
}

// What a part of a split stage page is for (the stage's own description covers the rest)
const PART_DESC = {
  "report:paper": "The PRISMA flow diagram and the PRISMA-ScR checklist for your paper.",
  "report:exports": "Files for your reference manager and manuscript, and the review package to deposit on OSF or Zenodo.",
  "report:library": "Your included papers as notes in your Obsidian library, with the citations between them.",
};

/**
 * One part of a step shown as a section of its page: a heading with the part's status, help, files and buttons, then the
 * part's own page (drawn with its part chosen). A stage split over two sections gets its buttons in the last one.
 */
function sectionOf(t, i, tabs) {
  const s = stage(t.stage), saved = PART[t.stage];
  if (t.part) PART[t.stage] = t.part;
  const body = PAGES[t.stage]();
  if (t.part) PART[t.stage] = saved;
  const last = !tabs.slice(i + 1).some(x => x.stage === t.stage);
  const what = `\u201c${t.label}\u201d`;
  const locked = S.state.protocol.locked && ["questions", "concepts", "queries", "protocol", "methods", "charting"].includes(t.stage);
  return h("section", { class: "stepsection", id: sectionId(t), "aria-labelledby": sectionId(t) + "-h" },
    h("div", { class: "titlerow" },
      h("h2", { id: sectionId(t) + "-h" }, t.label),
      last ? pill(s.status.replace("-", " "), statusKind(s.status)) : null,
      s.optional ? pill("optional", "info") : null,
      locked ? h("span", { class: "pill warn", title: "The protocol is locked: changes here are amendments, with a reason" }, "🔒 locked") : null,
      h("span", { class: "spacer" }),
      btn("? Help", () => openHelp(t.stage), "ghost", `Help: ${t.label}`),
      !last ? null : s.optional && !["skipped", "done"].includes(s.status) ? btn("Skip…", () => skipStage(t.stage), "ghost", `Skip ${what} (it is optional)`) : null,
      !last ? null : s.status === "done" || s.status === "skipped" ? btn("Reopen", () => api("stage_status", { stage: t.stage, status: "in-progress" }), "", `Reopen ${what}`)
        : btn("✓ Mark done", () => api("stage_status", { stage: t.stage, status: "done" }), "primary", `Mark ${what} as done`)),
    h("div", { class: "infoline" },
      h("span", { class: "desc" }, PART_DESC[`${t.stage}:${t.part}`] ?? s.desc, s.reason ? h("span", { class: "muted" }, ` — skipped: ${s.reason}`) : null),
      last ? savedIn(t.stage) : null),
    body);
}

/** Why a step can't be marked done yet (nothing to work on), or "" when it can. */
function nothingYet(key) {
  const included = S.records.some(r => r.ft_decision === "include");
  if (key === "screening") return S.flow.unique ? "" : "No records yet: import a search first";
  if (["retrieval", "charting"].includes(key)) return included ? "" : "No included papers yet";
  return "";
}

function renderTop() {
  const mapbar = $("#mapbar");
  if (CUR === HOME) {                                               // the Homepage explains; the page itself holds the choices
    mapbar.replaceChildren();
    $("#topbar").replaceChildren(h("div", { class: "home-hero" }, h("h1", {}, "Welcome to Scoping Review Workbench"),
      h("p", {}, `A guided ${S.review_type.label.toLowerCase()}, from your question to the PRISMA report. Everything stays on your PC.`)));
    return;
  }
  mapbar.replaceChildren(flowMap());
  const s = stage(CUR), st = stepOf(CUR), tab = curTab();
  const locked = S.state.protocol.locked;
  // Screen papers is reached through its boxes on the map (titles and abstracts, full texts …); a step of several
  // parts is one page of sections (each with its own status and buttons): no row of tabs anywhere
  const byMap = st.key === "screen";
  if (sectioned(st)) {
    const status = stepStatus(st);
    $("#topbar").replaceChildren(
      h("div", { class: "titlerow" }, h("h1", {}, st.long ?? st.title), pill(status.replace("-", " "), statusKind(status)),
        S.dev_mode ? pill("🛠 developer mode", "bad") : null),
      // the parts as links instead of repeating the title: each jumps to its section
      h("nav", { class: "infoline", "aria-label": "Parts of this page" }, h("span", { class: "desc" }, `${st.tabs.length} parts:`),
        st.tabs.map((t, i) => [i ? h("span", { class: "muted", "aria-hidden": "true" }, "·") : null,
          btn(t.label, () => document.getElementById(sectionId(t))?.scrollIntoView({ block: "start" }), "ghost sm", `Go to ${t.label}`)])));
    return;
  }
  const what = st.tabs.length > 1 ? `“${tab.label}”` : "this step";
  const aiStep = S.ai?.steps[CUR], aiMode = aiStep && (S.ai.modes[CUR] || "off"), aiOpen = store.get("ai_open", "") === "1";
  $("#topbar").replaceChildren(
    h("div", { class: "titlerow" },
      h("h1", {}, byMap ? tab.label : st.long ?? st.title),
      byMap ? h("span", { class: "muted" }, st.long ?? st.title) : null,
      st.tabs.length > 1 && !byMap ? null : pill(s.status.replace("-", " "), statusKind(s.status)),
      byMap && s.optional ? pill("optional", "info") : null,
      S.dev_mode ? pill("🛠 developer mode", "bad")
        : locked && ["questions", "concepts", "queries", "protocol", "methods", "charting"].includes(CUR) ? h("span", { class: "pill warn", title: "The protocol is locked: changes here are amendments, with a reason" }, "🔒 locked") : null,
      h("span", { class: "spacer" }),
      btn("? Help", () => openHelp(CUR), "ghost"),
      s.optional && !["skipped", "done"].includes(s.status) ? btn("Skip…", skipStage, "ghost", `Skip ${what} (it is optional)`) : null,
      s.status === "done" || s.status === "skipped" ? btn("Reopen", () => api("stage_status", { stage: CUR, status: "in-progress" }), "", `Reopen ${what}`)
        : nothingYet(CUR) ? [Object.assign(btn("✓ Mark done", null, "primary"), { disabled: true }), h("span", { class: "small muted" }, nothingYet(CUR))]
        : btn("✓ Mark done", () => api("stage_status", { stage: CUR, status: "done" }), "primary", `Mark ${what} as done`)),
    h("div", { class: "infoline" },
      h("span", { class: "desc" }, PART_DESC[`${CUR}:${tab.part}`] ?? s.desc, s.reason ? h("span", { class: "muted" }, ` — skipped: ${s.reason}`) : null),
      aiStep ? h("button", { class: "btn sm ai-chip" + (aiMode === "off" ? "" : " on"), "aria-expanded": String(aiOpen), title: "AI assistance for this step: who does what, and the prompt for Claude",
        onclick: () => { store.set("ai_open", aiOpen ? "" : "1"); render(); } }, `🤖 AI: ${aiStep.modes.find(m => m.key === aiMode).label} ${aiOpen ? "▴" : "▾"}`) : null,
      savedIn(CUR) || null),
    aiOpen ? aiCard(CUR) || "" : "");
}

/** Back and Next at the foot of every page: walks the steps (and the parts of Screen papers) in order. */
function pageNav() {
  const seq = pageSequence(), i = pageIndex(seq);
  const name = x => !sectioned(x.step) && x.step.tabs.length > 1 && x.step.tabs[0] !== x.tab ? `${x.step.title}: ${x.tab.label}` : x.step.title;
  const prev = seq[i - 1], next = seq[i + 1];
  return h("div", { class: "pagenav" },
    prev ? btn(`← ${name(prev)}`, () => goTab(prev.tab), "ghost") : h("span"),
    next ? btn(`Next: ${name(next)} →`, () => goTab(next.tab), "") : null);
}

// AI assistance for this step: the mode chosen for this review, the skill that does the work, what to check
function aiCard(key) {
  const step = S.ai?.steps[key];
  if (!step) return null;
  const mode = S.ai.modes[key] || "off", cur = step.modes.find(m => m.key === mode);
  // folded to one line by default; the details (what the mode does, the skill, what you check) open on request
  const open = store.get("ai_open", "") === "1";
  const toggle = () => { store.set("ai_open", open ? "" : "1"); render(); };
  return h("div", { class: "aicard" + (mode === "off" ? "" : " on") + (open ? " open" : "") },
    h("div", { class: "row" },
      h("b", {}, "🤖 AI assistance"),
      segmented(step.modes.map(m => [m.key, m.label]), mode, v => api("ai_mode", { stage: key, mode: v }), "AI assistance for this step"),
      mode === "off" ? null : btn("📋 Copy prompt", () => copy(step.prompt), "sm primary"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn sm ghost ai-toggle", "aria-expanded": String(open), onclick: toggle }, "Close ▴")),
    open ? h("div", { class: "aibody" },
      h("div", { class: "small muted" }, cur.desc),
      mode === "off" ? null : (() => {                // who does what, as pictures (full texts only when the AI reads them)
        const which = key === "screening" ? (SC.stage === "ft" ? (mode === "suggest-ft" ? "ft" : null) : "ta") : key;
        const strip = which && aiStrip(which);
        return strip ? h("div", {}, h("div", { class: "small", style: "font-weight:700;margin:8px 0 2px" }, "How it works with Claude"), strip) : null;
      })(),
      mode === "off" ? null : h("div", { class: "small muted" }, step.skills.length > 1 ? "AI skills: " : "AI skill: ",
        step.skills.map((n, i) => [i ? ", " : "", h("code", {}, `skills/${n}/SKILL.md`)])),
      mode === "off" ? null : h("div", { class: "small" }, h("b", {}, "You check: "),
        h("ul", {}, step.checks.map(c => h("li", {}, c))))) : null);
}

// Where each stage writes its data (paths relative to the review folder; @library = the library folder chosen in Settings, e.g. 00 - Library)
const STORAGE = {
  questions: [["review_state.json", "data, with every version"], ["03 - Search strategy.md", "readable"]],
  concepts: [["review_state.json", "data"], ["03 - Search strategy.md", "readable: concept table"]],
  queries: [["review_state.json", "data, incl. hand edits"], ["03 - Search strategy.md", "readable: strings"]],
  protocol: [["08 - Screening guide.md", "inclusion criteria and exclusion reasons"], ["review_state.json", "rationale"]],
  methods: [["review_state.json", "method sections, data items"], ["05 - Protocol.md", "generated note"]],
  registration: [["review_state.json", "lock, amendments"], ["00 - Review timeline.md", "readable: amendments"]],
  searches: [["07 - Searches.csv", "one row per search"], ["07 - Exports", "copies of the export files"], ["08 - Records", "one note per paper"]],
  screening: [["08 - Records", "title_abstract_ / full_text_decision in each paper's note"], ["08 - Screening.base", "the same as an Obsidian table"], ["08 - Decision log.csv", "every change, with who and how"]],
  retrieval: [["08 - Records", "full_text_status, open_access_url"], ["10 - Full texts", "attached PDFs"]],
  charting: [["08 - Records", "extracted_ properties"], ["12 - Charting.base", "the same as an Obsidian table"], ["review_state.json", "the form"]],
  report: [["14 - PRISMA flow.md", "flow diagram"], ["08 - Decision log.csv", "every decision change"], ["@checklist", "checklist"], ["07 - Exports", "BibTeX, CSV"], ["@library", "included_in on publication notes"]],
};

function savedIn(key) {
  const icon = p => p === "@library" ? "📚" : /\.(md)$/.test(p) ? "📝" : /\.base$/.test(p) ? "▦" : /\.(csv|json)$/.test(p) ? "🗎" : "📁";
  const files = STORAGE[key] || [];
  if (!files.length) return null;
  return h("details", { class: "savedin" }, h("summary", { title: "Which files in your review folder this step writes" }, `📁 ${files.length} file${files.length > 1 ? "s" : ""} ▾`),
    h("div", { class: "files" }, files.map(([p, what]) => [p === "@checklist" ? S.review_type.checklistFile : p, what]).map(([p, what]) => h("button", { class: "file", title: `${S.folder}/${p === "@library" ? "../" + libraryName() : p} — click to open`, onclick: () => openNote(p) },
      icon(p), " ", p === "@library" ? libraryName() : p, h("span", { class: "muted" }, " · " + what)))));
}

function renderMetrics() {
  const f = S.flow;
  const m = (v, l, to, cls = "") => h("div", { class: "metric " + cls, onclick: () => go(to) }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
  const inc = S.records.filter(r => r.ft_decision === "include");
  const pdfs = inc.filter(r => r.pdf_status === "found").length;
  const [cdone, ctotal] = S.charting_progress;
  const checked = inc.filter(r => String(r.chart?.checked_by || "").toLowerCase() === "reviewer").length;
  const tiles = {                                    // only the numbers that matter for the stage on screen
    unique: () => m(f.unique, "unique records", "searches"),
    ta: () => m(f.ta_pending, "to screen (title/abstract)", "screening", f.ta_pending ? "" : "good"),
    ft: () => m(f.ft_pending, "to screen (full text)", "screening", f.ft_pending ? "" : "good"),
    included: () => m(f.included, "included", "report", f.included ? "good" : ""),
    problems: () => m(S.problems.length, "problems", "screening", S.problems.length ? "bad" : "good"),
    pdfs: () => m(`${pdfs}/${inc.length}`, "included with PDF", "retrieval", inc.length && pdfs === inc.length ? "good" : ""),
    charted: () => m(`${cdone}/${ctotal}`, "charted (AI or you)", "charting"),
    checked: () => m(`${checked}/${ctotal}`, "checked by you", "charting", ctotal && checked === ctotal ? "good" : ""),
  };
  const PER_STAGE = {
    searches: ["unique", "problems"],
    screening: SC.stage === "ft" ? ["ft", "included", "problems"] : ["unique", "ta", "problems"],   // only what the part on screen is about
    retrieval: ["included", "pdfs"],
    charting: ["included", "pdfs", "charted", "checked"],
    report: ["unique", "included", "pdfs", "checked", "problems"],
  };
  const keys = PER_STAGE[CUR] || [];
  $("#metrics").replaceChildren(...keys.map(x => tiles[x]()));
  $("#metrics").style.display = keys.length ? "" : "none";
}

function renderDevButton() {
  const b = $("#btnDev");
  b.textContent = S.dev_mode ? "🛠 Developer mode: on — switch off" : "🛠 Developer mode…";
  b.classList.toggle("dev-on", !!S.dev_mode);
  const sb = $("#btnSettings");                       // the state stays visible while the menu is closed
  sb.textContent = S.dev_mode ? "⚙ Settings · dev mode on" : "⚙ Settings";
  sb.classList.toggle("dev-on", !!S.dev_mode);
  b.title = S.dev_mode ? "Developer mode is on: locked parts (protocol, criteria, charting form) can be edited without amendments; edits are still noted in the timeline. Click to switch off."
    : "Developer mode: lift the protocol locks while you develop the review. Edits are still noted in the timeline.";
}

export function renderChrome() { renderPicker(); renderTop(); renderMetrics(); renderDevButton(); }

export function render() {
  renderChrome();
  renderDraftBar();
  for (const id of ["btnTimeline", "btnScr"]) $("#" + id).hidden = CUR === HOME;   // the Homepage is only an introduction
  $("#btnHome").classList.toggle("on", CUR === HOME);
  $("#btnClaude").hidden = !S.ai?.steps[CUR];                      // only on the stages where Claude can help (marked AI)
  const page = $("#page"), st = CUR === HOME ? null : stepOf(CUR);
  page.replaceChildren(...(sectioned(st) ? st.tabs.map(sectionOf) : [PAGES[CUR]()]), CUR === HOME ? "" : pageNav());
}
