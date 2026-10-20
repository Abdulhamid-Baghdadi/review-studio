/**
 * The one-minute tour: one highlighted part of the screen at a time.
 * @module web/studio/shell/tour
 */
import { h, store } from "../core/dom.js";
import { go } from "./navigation.js";
import { btn } from "../ui/components.js";

// A short, plain explanation of what the app is for, one highlighted part of the screen at a time.
// Offered once on the first visit; the button on the Homepage replays it.
const TOUR = [
  { title: "Welcome to Scoping Review Workbench 👋",
    text: "This app guides you through a scoping review, step by step: from your first idea to a finished PRISMA report. It keeps every step documented, so your review is transparent and easy to reproduce." },
  { target: ".flowmap", title: "Your review, step by step",
    text: "The map shows the whole review: plan (question, search, inclusion rules, methods, lock), the PRISMA flow with your live counts (records found, screened, included), then charting the data and the report. Click any step to open it; the ringed one is where you are. While you work it stays folded to this one line: Map ▾ unfolds it." },
  { target: "#topbar", title: "One step at a time",
    text: "Each step is one page; a step with several parts shows them as sections, so just scroll down. Each page says what to do; ? Help explains the method with a filled-in example, ✓ Mark done ticks it off, and Next at the bottom takes you on." },
  { target: "#draftBar", title: "Your files stay on your PC",
    text: "You start in a draft kept in this browser. Save it to a folder when you want to keep it: the review becomes plain notes, tables and PDFs on your PC. Nothing is uploaded." },
  { target: ".toolbar", title: "Tools for every step",
    text: "The timeline of everything you did, the PRISMA-ScR reporting checklist and, if you want it, AI help from Claude, which only ever suggests. The glossary and keyboard shortcuts are under ⚙ Settings." },
  { title: "Ready? Start with your question ✍️",
    text: "Step 1 is your research question: who or what, which topic, which setting, and the main question. You can replay this tour from the Homepage." },
];

export function offerTour() {
  const card = h("div", { class: "tour-offer", role: "region", "aria-label": "App tour" },
    h("div", { class: "tour-offer-text" }, h("b", {}, "New here?"), " Take the 1-minute tour to see what Scoping Review Workbench does."),
    h("div", { class: "row" },
      btn("🎓 Start tour", () => { card.remove(); startTour(); }, "sm primary"),
      btn("Not now", () => { card.remove(); store.set("toured", "skipped"); }, "sm ghost")));
  (document.getElementById("offer") ?? document.body).replaceChildren(card);   // in the page flow: it covers nothing
}

let tourClose = null;                         // closes the step on screen
export function startTour(i = 0) {
  tourClose?.();
  document.querySelector(".tour-offer")?.remove();
  store.set("toured", "yes");
  const steps = TOUR.filter(s => !s.target || (document.querySelector(s.target) && !document.querySelector(s.target).hidden));
  const step = steps[i];
  if (!step) return;
  const target = step.target && document.querySelector(step.target);
  const wrap = h("div", { class: "tour" });
  const spot = h("div", { class: "tour-spot" + (target ? "" : " none") });
  const close = () => { wrap.remove(); document.removeEventListener("keydown", keys, true); window.removeEventListener("resize", place); tourClose = null; };
  tourClose = close;
  const card = h("div", { class: "tour-card", role: "dialog", "aria-label": step.title },
    h("div", { class: "tour-count" }, `${i + 1} of ${steps.length}`),
    h("h2", {}, step.title), h("p", {}, step.text),
    h("div", { class: "row tour-buttons" },
      i < steps.length - 1 ? btn("Skip tour", close, "sm ghost") : null,
      h("span", { class: "spacer" }),
      i > 0 ? btn("← Back", () => startTour(i - 1), "sm") : null,
      i < steps.length - 1 ? btn("Next →", () => startTour(i + 1), "sm primary") : btn("Let's start", () => { close(); go("questions"); }, "sm primary")));
  wrap.append(spot, card);
  document.body.append(wrap);
  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight, m = 14;
    let left = r.right + m, top = r.top;                                         // right of the target …
    if (left + cw > innerWidth - m) { left = Math.max(m, Math.min(r.left, innerWidth - cw - m)); top = r.bottom + m; }   // … or below it
    if (top + ch > innerHeight - m) top = Math.max(m, r.top - ch - m);                                                   // … or above it
    Object.assign(card.style, { left: `${left}px`, top: `${Math.max(m, top)}px` });
  }
  function keys(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && i < steps.length - 1) startTour(i + 1);
    else if (e.key === "ArrowLeft" && i > 0) startTour(i - 1);
    else return;
    e.stopPropagation(); e.preventDefault();
  }
  place();
  window.addEventListener("resize", place);
  document.addEventListener("keydown", keys, true);
  card.querySelector(".btn.primary")?.focus();
}
