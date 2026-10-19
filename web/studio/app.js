/**
 * The Scoping Review Workbench page: starts it, and imports every module that registers a page or listens to the page.
 * @module web/studio/app
 */
import "./core/dom.js";
import "./pages/home.js";
import "./pages/idea.js";
import "./pages/questions.js";
import "./pages/concepts.js";
import "./pages/queries.js";
import "./pages/pilot.js";
import "./pages/protocol.js";
import "./pages/registration.js";
import "./pages/searches.js";
import "./pages/screening.js";
import "./pages/reviewer.js";
import "./pages/retrieval.js";
import "./pages/charting.js";
import "./pages/appraisal.js";
import "./pages/report.js";
import "./core/autosave.js";
import "./shell/keyboard.js";
import "./shell/toolbar.js";
import "./shell/outside-changes.js";
import "./shell/reviews.js";
import "./shell/tooltips.js";
import { api, getJSON, view } from "./core/api.js";
import { $, h, store } from "./core/dom.js";
import { CUR, HOME, REVIEW, S, setCur, setH, setReview, setS } from "./core/state.js";
import { render, renderChrome } from "./shell/chrome.js";
import { openFinishedExample } from "./shell/reviews.js";
import { offerTour } from "./shell/tour.js";
import { confirmBox, promptText, toast } from "./ui/dialogs.js";

Object.assign(view, { render, renderChrome, toast, promptText });   // what core/api.js needs from the page

// the sticky top bar's height, for the page's scroll-padding: focus and jumps never end up hidden under it
new ResizeObserver(([e]) => document.documentElement.style.setProperty("--topbar-h", `${Math.round(e.target.getBoundingClientRect().height)}px`))
  .observe($("#topwrap"));

// main.js waits for this to time how long opening a review takes
window.studioReady = (async function start() {
  try {
    setH(await getJSON("/api/help"));
    try { setS(await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`)); }
    catch (e) {
      const { reviews } = await getJSON("/api/reviews");
      if (!reviews.length) throw new Error("No review anchor note found. Create a note with 'type: review' in its properties.");
      setReview(reviews[0]); store.set("review", REVIEW);
      setS(await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`));
    }
    const wantExample = CUR === "example";                         // …/web/#example opens the finished example
    if (wantExample) setCur(HOME);
    render();
    if (wantExample) await openFinishedExample();
    else if (!store.get("toured", "") && CUR !== HOME) offerTour();   // the Homepage has its own tour button
  } catch (e) {
    $("#page").replaceChildren(h("div", { class: "card empty" }, h("div", { class: "big" }, "⚠️"), h("h2", {}, "Could not load the review"), h("p", {}, e.message)));
  }
})();

$("#btnDev").addEventListener("click", async () => {
  if (!S.dev_mode && !(await confirmBox("Developer mode", "Lift the locks? Locked parts (questions, concepts, search strings, protocol text, exclusion reasons, charting form) become editable without amendment reasons. Each change is still noted in the timeline.", "Switch on", true))) return;
  api("dev_mode", { on: !S.dev_mode });
});
