/**
 * Everything around the page: top bar, tabs, metrics, AI card, where files are kept; render() draws it all.
 * @module web/studio/shell/chrome
 */
import { api, backend, busy } from "../core/api.js";
import { $, h, store } from "../core/dom.js";
import { CUR, HOME, REVIEW, S } from "../core/state.js";
import { PAGES } from "./registry.js";
import { openHelp } from "./help.js";
import { flowMap } from "./journey-map.js";
import { curTab, go, goTab, skipStage, stage, stepOf, tabSequence } from "./navigation.js";
import { openReviewFolder, renderDraftBar, saveDraft, switchReview } from "./reviews.js";
import { btn, copy, libraryName, openNote, pill, segmented, statusKind } from "../ui/components.js";

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
  const item = r => h("button", { class: "btn ghost" + (r === REVIEW ? " current" : ""), onclick: () => r !== REVIEW && switchReview(r) },
    h("span", { class: "rm-check" }, r === REVIEW ? "✓" : ""), r.startsWith("📘") ? "📘 " : r === S.reviews[0] ? "📝 " : "📁 ", reviewLabel(r),
    r === S.reviews[0] ? h("span", { class: "rm-note" }, "in this browser") : r.startsWith("📘") ? h("span", { class: "rm-note" }, "finished, not kept") : null);
  menu.replaceChildren(h("div", { class: "rm-head" }, "Your reviews"), ...S.reviews.map(item), h("div", { class: "rm-line" }),
    backend.entry?.draft ? btn("💾 Save my review to a folder…", e => busy(e.currentTarget, saveDraft), "ghost") : null,
    btn("📂 Open a review folder…", openReviewFolder, "ghost"));
}

// What a part of a split stage page is for (the stage's own description covers the rest)
const PART_DESC = {
  "protocol:rules": "Decide which papers belong in your review and which do not. The short exclusion reasons (E1, E2 …) are the only ones you can pick while screening.",
  "protocol:methods": "The rest of your plan: background, sources, and how you will select, chart and summarise. Together with your question and search it becomes the Protocol note.",
};

/** Why a step can't be marked done yet (nothing to work on), or "" when it can. */
function nothingYet(key) {
  const included = S.records.some(r => r.ft_decision === "include");
  if (key === "screening") return S.flow.unique ? "" : "No records yet: import a search first";
  if (["retrieval", "charting", "appraisal"].includes(key)) return included ? "" : "No included papers yet";
  return "";
}

function renderTop() {
  const mapbar = $("#mapbar");
  if (CUR === HOME) {                                               // the Homepage explains; the page itself holds the choices
    mapbar.replaceChildren();
    $("#topbar").replaceChildren(h("div", { class: "home-hero" }, h("h1", {}, "Welcome to Review Studio"),
      h("p", {}, `A guided ${S.review_type.label.toLowerCase()}, from your question to the PRISMA report. Everything stays on your PC.`)));
    return;
  }
  mapbar.replaceChildren(flowMap());
  const s = stage(CUR), st = stepOf(CUR), tab = curTab();
  const locked = S.state.protocol.locked;
  const tabs = st.tabs.length > 1 ? h("div", { class: "steptabs", role: "tablist" }, st.tabs.map(t => {
    const ts = stage(t.stage), on = t === tab;
    return h("button", { class: `steptab ${ts.status} ${on ? "on" : ""}`, role: "tab", "aria-selected": String(on),
      title: ts.desc + (ts.optional ? " (optional)" : ""), onclick: () => goTab(t) },
      h("span", { class: "tdot" }, ts.status === "done" ? "✓" : ts.status === "skipped" ? "–" : ""), t.label,
      ts.optional ? h("span", { class: "topt" }, "optional") : null);
  })) : null;
  const what = st.tabs.length > 1 ? `“${tab.label}”` : "this step";
  const aiStep = S.ai?.steps[CUR], aiMode = aiStep && (S.ai.modes[CUR] || "off"), aiOpen = store.get("ai_open", "") === "1";
  $("#topbar").replaceChildren(
    h("div", { class: "titlerow" },
      h("h1", {}, st.title),
      st.tabs.length > 1 ? null : pill(s.status.replace("-", " "), statusKind(s.status)),
      tabs,
      S.dev_mode ? pill("🛠 developer mode", "bad")
        : locked && ["questions", "concepts", "queries", "protocol", "charting"].includes(CUR) ? h("span", { class: "pill warn", title: "The protocol is locked: changes here are amendments, with a reason" }, "🔒 locked") : null,
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

/** Back and Next at the foot of every page: walks the tabs and steps in order. */
function pageNav() {
  const seq = tabSequence(), tab = curTab(), i = seq.findIndex(x => x.tab === tab);
  const name = x => x.step.tabs.length > 1 && x.step.tabs[0] !== x.tab ? `${x.step.title}: ${x.tab.label}` : x.step.title;
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
      mode === "off" ? null : h("div", { class: "small muted" }, step.skills.length > 1 ? "Skills: " : "Skill: ",
        step.skills.map((n, i) => [i ? ", " : "", h("code", {}, `.claude/skills/${n}/SKILL.md`)])),
      mode === "off" ? null : h("div", { class: "small" }, h("b", {}, "You check: "),
        h("ul", {}, step.checks.map(c => h("li", {}, c))))) : null);
}

// Where each stage writes its data (paths relative to the review folder; @library = the library folder chosen in Settings, e.g. 00 - Library)
const STORAGE = {
  idea: [["review_state.json", "data"], ["00 - Review timeline.md", "readable: idea log"]],
  questions: [["review_state.json", "data, with every version"], ["03 - Search strategy.md", "readable"]],
  concepts: [["review_state.json", "data"], ["03 - Search strategy.md", "readable: concept table"]],
  queries: [["review_state.json", "data, incl. hand edits"], ["03 - Search strategy.md", "readable: strings"]],
  pilot: [["review_state.json", "data"], ["03 - Search strategy.md", "readable: pilot runs"]],
  protocol: [["review_state.json", "method sections"], ["08 - Screening guide.md", "exclusion reasons"], ["05 - Protocol.md", "generated note"]],
  registration: [["review_state.json", "lock, amendments"], ["00 - Review timeline.md", "readable: amendments"]],
  searches: [["07 - Searches.csv", "one row per search"], ["07 - Exports", "copies of the export files"], ["08 - Records", "one note per paper"]],
  screening: [["08 - Records", "title_abstract_ / full_text_decision in each paper's note"], ["08 - Screening.base", "the same as an Obsidian table"], ["08 - Decision log.csv", "every change, with who and how"]],
  reviewer: [["09 - Second reviewer", "blind CSV sheets"], ["08 - Records", "second_reviewer_ properties"]],
  snowballing: [["07 - Searches.csv", "one row per round"], ["08 - Records", "new papers"]],
  retrieval: [["08 - Records", "full_text_status, open_access_url"], ["10 - Full texts", "attached PDFs"]],
  charting: [["08 - Records", "extracted_ properties"], ["12 - Charting.base", "the same as an Obsidian table"], ["review_state.json", "the form"]],
  appraisal: [["08 - Records", "appraisal properties"], ["12 - Charting.base", "Appraisal view"]],
  synthesis: [["review_state.json", "what was done; the analysis files stay where you keep them"], ["00 - Review timeline.md", "readable: when it changed"]],
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
  const f = S.flow, k = S.agreement.ta.kappa, t = S.test_set;
  const last = [...S.state.pilots].reverse().find(p => p.test_set !== "");
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
    kappa: () => m(k == null ? "–" : k.toFixed(2), "κ title/abstract", "reviewer", k == null ? "" : k >= 0.6 ? "good" : "bad"),
    test: () => m(last ? `${last.retrieved}/${last.test_set}` : `–/${t.size}`, "test set (last pilot)", "pilot"),
    problems: () => m(S.problems.length, "problems", "screening", S.problems.length ? "bad" : "good"),
    pdfs: () => m(`${pdfs}/${inc.length}`, "included with PDF", "retrieval", inc.length && pdfs === inc.length ? "good" : ""),
    charted: () => m(`${cdone}/${ctotal}`, "charted (AI or you)", "charting"),
    checked: () => m(`${checked}/${ctotal}`, "checked by you", "charting", ctotal && checked === ctotal ? "good" : ""),
  };
  const PER_STAGE = {
    queries: ["test"], pilot: ["test"], searches: ["unique", "problems"],
    screening: ["unique", "ta", "ft", "included", "problems"], reviewer: ["kappa"],
    snowballing: ["unique", "included"], retrieval: ["included", "pdfs"],
    charting: ["included", "pdfs", "charted", "checked"], appraisal: ["included", "checked"],
    report: ["unique", "included", "pdfs", "checked", "problems"],
  };
  const keys = (PER_STAGE[CUR] || []).filter(x => x !== "kappa" || stage("reviewer").status !== "skipped");
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
  $("#btnType").textContent = `🧭 ${S.review_type.label} · ${S.review_type.guideline}`;
  $("#btnType").hidden = S.review_type.key !== "scoping" || CUR === HOME;   // systematic is the standard; only a scoping review shows its type
  $("#btnClaude").hidden = !S.ai?.steps[CUR];                      // only on the stages where Claude can help (marked AI)
  const page = $("#page");
  page.replaceChildren(PAGES[CUR](), CUR === HOME ? "" : pageNav());
}
