/**
 * The help drawer, worked examples, glossary, timeline, keyboard shortcuts and the reporting checklist.
 * @module web/studio/shell/help
 */
import { $, h } from "../core/dom.js";
import { H, S } from "../core/state.js";
import { go, stage, stageName, stepOf } from "./navigation.js";
import { btn, copy, hlQuery, iconBtn, openNote, pill } from "../ui/components.js";
import { modal, restoreFocus } from "../ui/dialogs.js";

function refList(numbering) {
  return h("ol", { class: "refs" }, Object.entries(numbering).sort((a, b) => a[1] - b[1]).map(([k]) => {
    const r = H.refs[k];
    return h("li", {}, r.text, " ", r.doi ? h("a", { href: `https://doi.org/${r.doi}`, target: "_blank", rel: "noopener" }, `doi:${r.doi}`) : null);
  }));
}
function refMarks(refs, numbering) {
  refs.forEach(r => numbering[r] ??= Object.keys(numbering).length + 1);
  return refs.length ? h("span", { class: "refn", title: refs.map(r => H.refs[r].text).join("\n\n") }, ` [${refs.map(r => numbering[r]).join(", ")}]`) : null;
}
const lvl = key => h("span", { class: "lvl", style: `background:${H.levels[key].color}`, title: H.levels[key].explain }, H.levels[key].label);

// The drawer beside the page (help, examples). Opening it moves focus to its title; closing it makes it inert (its
// links leave the Tab order while it is off-screen) and gives focus back to what opened it.
let drawerOpener = null;
function drawer(title, ...body) {
  const dr = $("#drawer"), wasOpen = dr.classList.contains("open");
  dr.replaceChildren(h("div", { class: "dh" }, h("h2", { id: "drawerTitle", tabindex: "-1" }, title), iconBtn("✕", "Close help", closeHelp)), h("div", { class: "db" }, ...body));
  dr.inert = false;
  dr.classList.add("open");
  if (!wasOpen) { drawerOpener = document.activeElement; $("#drawerTitle").focus(); }   // not when it only follows the page
}

export function openHelp(key) {
  const x = (S.review_type?.key === "systematic" && H.stages_systematic?.[key]) || H.stages[key], s = stage(key), num = {};
  const rules = x.rules.map(([text, level, refs]) => h("div", { class: "rule" }, lvl(level), h("div", {}, withScr(text), refMarks(refs, num))));
  const terms = x.terms.map(t => h("div", { class: "term" }, h("b", {}, t), H.terms[t].definition, refMarks(H.terms[t].refs, num)));
  drawer("Help · " + stageName(key),
    h("p", { class: "lead" }, x.what),
    h("ol", { class: "steps" }, x.how.map(l => h("li", {}, l))),
    h("h3", {}, "Rule or choice?"), rules,
    h("div", { class: "row", style: "margin-top:14px" }, btn("💡 Show example", () => openExample(key), "sm")),
    h("details", { class: "fold" }, h("summary", {}, `Terms (${terms.length})`), terms),
    h("details", { class: "fold" }, h("summary", {}, "What the labels mean"),
      Object.keys(H.levels).map(k => h("div", { class: "rule" }, lvl(k), h("div", { class: "small muted" }, H.levels[k].explain)))),
    h("details", { class: "fold" }, h("summary", {}, `References (${Object.keys(num).length})`), refList(num)));
}

/**
 * The worked example's value for a field, as light-grey text in an empty field ("e.g. …"); "" when the example has none.
 * `name` is matched to the example's label, ignoring case and "_" (e.g. "main question", "study_type", "eligibility").
 */
/** The worked example for the review's type: a real scoping run, or an illustrative systematic review. */
const sysExample = () => S?.review_type?.key === "systematic" && H?.examples_systematic;
const examples = () => (sysExample() ? H.examples_systematic : H?.examples) ?? {};

export function exampleFor(stageKey, name, part) {
  const norm = t => String(t).toLowerCase().replace(/[_\s]+/g, " ").trim();
  const item = (examples()[stageKey]?.items || []).find(([label]) => norm(label) === norm(name) || norm(name).startsWith(norm(label)));
  if (!item) return "";
  const value = part === undefined ? item[1] : String(item[1]).split(" · ")[part];
  return value ? `e.g. ${value}` : "";
}

export function openExample(key) {
  const ex = examples()[key] || {}, s = stage(key);
  drawer("Example · " + stageName(key),
    h("div", { class: "callout", style: "margin:8px 0 14px" }, h("b", {}, "Worked example: "), sysExample() ? H.example_topic_systematic : H.example_topic),
    ex.items ? h("table", { class: "tbl" }, ex.items.map(([k, v]) => h("tr", {}, h("td", { style: "width:34%;color:var(--muted);font-weight:600" }, k), h("td", {}, v)))) : null,
    ex.code ? h("div", { class: "code", style: "margin-top:10px", html: hlQuery(ex.code) }) : null,
    ex.lesson ? h("div", { class: "callout ok", style: "margin-top:14px" }, h("b", {}, "Lesson: "), ex.lesson) : null,
    h("p", { class: "small muted", style: "margin-top:16px" }, sysExample() ? H.example_note_systematic : "Real values from a run of this tool on 6 Oct 2026; screening decisions were illustrative."),
    h("div", { class: "row" }, btn("? Back to help", () => openHelp(key), "sm")));
}

export function closeHelp() {
  const dr = $("#drawer");
  if (!dr.classList.contains("open")) return;
  const hadFocus = dr.contains(document.activeElement);
  dr.classList.remove("open");
  dr.inert = true;
  if (hadFocus) restoreFocus(drawerOpener);
  drawerOpener = null;
}

// "Working with Claude": how to use an AI assistant with this review. The per-step part comes from the same
// settings as the AI assistance cards (review_stages.AI_STEPS), so it stays in step with the tool.
export function openClaudeGuide() {
  const sec = (title, ...body) => h("section", { style: "margin:0 0 18px" }, h("h3", { style: "margin:0 0 6px" }, title), ...body);
  const ol = items => h("ol", { style: "margin:4px 0 0;padding-left:20px;line-height:1.6" }, items.map(i => h("li", {}, i)));
  const ul = items => h("ul", { style: "margin:4px 0 0;padding-left:20px;line-height:1.6" }, items.map(i => h("li", {}, i)));
  const goStage = key => { document.querySelector(".scrim")?.remove(); go(key); };
  const steps = Object.entries(S.ai.steps).map(([key, step]) => {
    const mode = S.ai.modes[key] || "off";
    return h("div", { class: "card", style: "padding:12px 16px;margin:0 0 10px" },
      h("div", { class: "row", style: "margin-bottom:6px" },
        h("b", {}, stepOf(key).tabs.length > 1 ? `${stepOf(key).title} · ${stageName(key)}` : stepOf(key).title), pill(mode === "off" ? "off for this review" : "on: " + step.modes.find(m => m.key === mode).label, mode === "off" ? "" : "ok"),
        h("span", { style: "flex:1" }), btn("Open", () => goStage(key), "sm ghost"),
        mode === "off" ? null : btn("📋 Copy prompt", () => copy(step.prompt), "sm")),
      h("div", { class: "small" }, ul(step.modes.filter(m => m.key !== "off").map(m => [h("b", {}, m.label + ": "), m.desc]))),
      h("div", { class: "small", style: "margin-top:6px" }, h("b", {}, "You check: "), ul(step.checks)),
      h("div", { class: "small muted", style: "margin-top:6px" }, "Skill: ", step.skills.map((n, i) => [i ? ", " : "", h("code", {}, `.claude/skills/${n}/SKILL.md`)])));
  });
  modal({ title: "Working with Claude", wide: true, body: h("div", {},
    h("p", { class: "callout", style: "margin:0 0 16px" },
      "Claude can do the slow, repetitive parts of a review: pre-screening, finding PDFs, a blind second screening, filling the charting form. ",
      "It only ever suggests. You confirm every decision in Review Studio, every AI action is logged with the model and date, and the protocol reports it."),
    sec("1 · Set up once", ol([
      "Install Claude Code: the Claude desktop app (Code tab) or the claude command in a terminal.",
      ["Open the app's folder (the one that contains ", h("code", {}, ".claude/skills"), ") as the project in Claude Code. The review skills come with the app; Node.js, which the app already needs, runs them."],
      "Keep Review Studio open next to it: Claude writes, Review Studio is where you check and confirm.",
      "For paywalled papers: let Claude use a browser where you are signed in to your library (for example Claude in Chrome), only if you agree to that."])),
    sec("2 · How one step works", ol([
      "Open the step and choose a mode on its 🤖 AI assistance card. The choice is part of your method: after the protocol is locked it is an amendment.",
      "Press 📋 Copy prompt and paste it into Claude Code.",
      ["Claude follows the skill: it reads what it needs and writes its suggestions through ", h("code", {}, "bin/ai-assist.js"), ", which refuses when the mode is off and never sets a final decision. If two folders share the review's name (a review and its test copy), Claude asks you which one."],
      "Back in Review Studio, review the suggestions (Suggested queue, blind-sheet agreement, 'checked by AI' papers) and confirm or change each one.",
      "Work through the 'You check' list for that step."])),
    sec("3 · Steps Claude can help with", ...steps),
    sec("4 · Other things to ask Claude", ul([
      "Draft protocol sections from your decisions (marked 'Claude draft' until you approve them).",
      "Suggest synonyms and spellings for a concept block before you pilot the search.",
      "Summarise or compare included papers, or draft parts of the report from the charting table. Check every claim against the paper."])),
    sec("5 · Rules that keep the review sound", ul([
      "The reviewer decides. AI suggestions are never final decisions, and a confirmed batch is recorded as yours with a note per record.",
      "Report AI use in the methods (PRISMA-ScR item 9, selection of sources; PRISMA 2020 item 8 asks for automation tools explicitly): which steps, which model, how its output was checked. The protocol's 'Use of AI assistance' section is written for you.",
      "An AI second reviewer is not a second person. Say so; if you can, use a human for the second-reviewer sample.",
      "Never let AI solve CAPTCHAs, use shadow libraries or share logins when fetching PDFs."])),
    sec("6 · Other AI assistants", h("p", { style: "margin:0" },
      ["The skills are plain Markdown files in ", h("code", {}, ".claude/skills/"), ". Any assistant that can read files and run Node.js commands can follow them; the prompt on each card works the same way."])))
  });
}

export function openGlossary() {
  const num = {}, list = h("div", {});
  const search = h("input", { type: "text", placeholder: "Search terms…", oninput: () => draw() });
  const draw = () => {
    const q = search.value.toLowerCase();
    list.replaceChildren(...Object.keys(H.terms).sort((a, b) => a.localeCompare(b))
      .filter(t => !q || (t + H.terms[t].definition).toLowerCase().includes(q))
      .map(t => h("div", { class: "term", style: "border-bottom:1px solid var(--border);padding:9px 0" }, h("b", {}, t), H.terms[t].definition, refMarks(H.terms[t].refs, num))));
  };
  draw();
  modal({ title: "Glossary", wide: true, body: h("div", { class: "stack" }, search, list, h("details", {}, h("summary", {}, "References"), refList(num))) });
}

export function openTimeline() {
  const am = S.state.amendments;
  modal({
    title: "Timeline", wide: true, body: h("div", {},
      am.length ? h("div", { class: "callout warn", style: "margin-bottom:12px" }, h("b", {}, `${am.length} amendment(s) after locking`), h("ul", {}, am.map(a => h("li", {}, `${a.when} — ${a.what}: ${a.reason}`)))) : null,
      S.events.length ? h("div", { class: "tl" }, S.events.map(e => h("div", { class: "ev" }, h("div", { class: "when" }, `${e.when} · ${(stage(e.stage) || { title: e.stage }).title}`), e.text)))
        : h("div", { class: "empty" }, "Nothing recorded yet.")),
    buttons: [{ label: "Open timeline note in Obsidian", value: () => openNote("00 - Review timeline.md") }, { label: "Close", primary: true, value: null }],
  });
}

export function openKeys() {
  const rows = [["?", "help for this page"], ["X", "example for this page"], ["G", "glossary"], ["T", "timeline"], ["Alt+↑ / Alt+↓", "previous / next page"],
    ["I / U / E", "include / unsure / exclude (screening)"], ["1–9", "exclusion reason (screening)"], ["← / →", "previous / next record"], ["Esc", "close panel"]];
  modal({ title: "Keyboard shortcuts", body: h("table", { class: "tbl" }, rows.map(([k, d]) => h("tr", {}, h("td", {}, h("kbd", {}, k)), h("td", {}, d)))) });
}

// ---------- Checklist item references: "PRISMA-ScR 3" or "PRISMA 2020 item 16a" → clickable chip, plus the full checklist
function scrChip(n) {
  n = String(n);
  const g = S.review_type.guideline;
  const it = S.checklist_items.find(x => x.n === n) ?? S.checklist_items.find(x => x.n === n + "a");    // "13" → 13a–f
  return h("button", { class: "scr", title: it ? `${g} item ${it.n}: ${it.item} — ${it.desc}` : `${g} item ${n}`,
    onclick: e => { e.preventDefault(); e.stopPropagation(); openChecklist(it?.n ?? n); } }, `${g === "PRISMA-ScR" ? "ScR" : "P2020"} ${n}`);
}

// Turns text such as "Rationale (PRISMA-ScR 3)", "(PRISMA-ScR items 10–11)" or "(PRISMA 2020 item 16a)" into text + clickable
// chips; a reference to the other guideline than the review's own stays plain text
export function withScr(text) {
  const m = String(text).match(/^(.*?)\s*\((PRISMA-ScR|PRISMA 2020)(?: items?)?\s*([\da-f,\s–-]+)\)\s*(.*)$/);
  if (!m || m[2] !== S.review_type.guideline) return [text];
  const nums = [];
  m[3].split(/,\s*/).forEach(part => {
    const r = part.trim().split(/[–-]/);
    if (r.length === 2 && /^\d+$/.test(r[0]) && /^\d+$/.test(r[1])) for (let i = +r[0]; i <= +r[1]; i++) nums.push(String(i));
    else nums.push(r[0]);
  });
  return [m[1], " ", ...nums.map(scrChip), m[4] ? " " + m[4] : ""];
}

export function openChecklist(focus) {
  const auto = S.checklist_auto, cl = S.state.checklist, rt = S.review_type, items = S.checklist_items;
  const at = n => items.findIndex(it => it.n === n);
  const intro = rt.key === "systematic"
    ? `PRISMA 2020 (${rt.guidelineCitation}): 27 items, 42 with their sub-items, for reporting a systematic review. Report the abstract with the PRISMA 2020 for Abstracts checklist. Tick items on the Report stage.`
    : `PRISMA-ScR (${rt.guidelineCitation}): 20 essential items and 2 optional ones (12 and 16, critical appraisal) for reporting a scoping review. Items 5–13 are written in the protocol; the rest come with the final paper. Tick items on the Report stage.`;
  const body = h("div", {},
    h("p", { class: "muted small", style: "margin-top:0" }, intro),
    rt.checklistParts.map(([part, a, b]) => h("div", {},
      h("h3", { style: "margin:14px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)" }, part),
      items.slice(at(a), at(b) + 1).map(it => {
        const done = cl[String(it.n)]?.done, ev = auto[String(it.n)];
        return h("div", { id: "scr" + it.n, class: "scr-row" + (it.n === focus ? " focus" : "") },
          h("span", { class: "scr-n" }, it.n),
          h("div", {}, h("b", {}, it.item), h("div", { class: "small muted" }, it.desc), ev ? h("div", { style: "margin-top:3px" }, pill(ev, "info")) : null),
          it.optional ? pill("optional", "info") : null, done ? pill("✓ reported", "ok") : null);
      }))));
  modal({ title: `${rt.guideline} checklist`, wide: true, body, buttons: [{ label: "Go to Report", value: () => go("report") }, { label: "Close", primary: true, value: null }] });
  if (focus) setTimeout(() => document.getElementById("scr" + focus)?.scrollIntoView({ block: "center" }), 60);
}

