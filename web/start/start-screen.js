/**
 * The start screen: the steps of a review (a preview of each), light / dark, and the ways in: a new review, a review
 * folder, or one opened before. It is shown before the app runs, and when opening the draft review fails.
 * @module web/start/start-screen
 */
import { stages } from "../../src/index.js";
import { Backend } from "../../src/ui/backend.js";
import { $, button, el, remember, say } from "./dom.js";
import { openReview } from "./open-review.js";

/** The steps of a review in the start screen's sidebar; clicking one shows what it is for. */
export function startSteps() {
  const nav = $("#startSteps"), box = $("#startStage");
  const type = stages.REVIEW_TYPES[stages.NEW_REVIEW_TYPE];
  let phase = null;
  type.steps.forEach((st, i) => {
    if (st.phase !== phase) nav.append(el("div", { className: "phase" }, phase = st.phase));
    const step = el("div", { className: "step", title: st.hint },
      el("span", { className: "dot" }, String(i + 1)),
      el("span", { className: "lbl" }, el("span", { className: "t" }, st.title), el("span", { className: "hint" }, st.hint)));
    step.onclick = () => {                    // a preview of what the step is for
      nav.querySelectorAll(".step.active").forEach(x => x.classList.remove("active"));
      step.classList.add("active");
      const desc = k => type.stages.find(x => x.key === k).description;
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

/** The message shown instead of the app in a browser that cannot open folders. */
export function unsupportedBrowser() {
  $("#start").hidden = false;
  $("#startBody").replaceChildren(el("div", { className: "callout" },
    "This browser cannot open folders on your PC. Use Google Chrome or Microsoft Edge on a computer."));
}

/** The start screen with the ways in; `error` (why the app could not open) is shown below them. */
export async function showStartScreen(error) {
  $("#app").hidden = true;
  $("#start").hidden = false;
  await drawChoices();
  if (error) explain(error);
}

async function drawChoices() {
  const backend = window.backend;
  const recent = await backend.recentReviews();
  const list = recent.map(r => el("div", { className: "recent" },
    el("span", { className: "name", title: r.name }, "📁 ", r.name.replace(/ records$/, "")),
    el("span", { className: "muted small" }, new Date(r.opened).toLocaleDateString()),
    button("Forget", async () => { await backend.forgetReview(r.id); drawChoices(); }, "sm ghost"),
    button("Continue →", () => openReview(r).catch(explain), "sm primary")));
  $("#startBody").replaceChildren(...[
    el("div", { className: "start-actions" },
      button("＋ New review…", () => newReview().catch(explain), list.length ? "" : "primary"),
      button("📂 Open a review folder…", () => openFolder().catch(explain), "")),
    list.length ? el("div", { className: "recents" }, el("h2", {}, "Continue where you left off"), ...list) : null,
    el("p", { className: "start-msg small muted" }, "Works in Chrome or Edge on a computer. The browser asks once per visit before the app may use a folder."),
  ].filter(Boolean));
}

/** A new review: a folder "<name> records" inside the folder the user picks. */
async function newReview() {
  const name = prompt("Name of the review (e.g. 'Repairability review'):")?.trim();
  if (!name) return;
  await openReview(await window.backend.newReview(name));
}

async function openFolder() {
  const backend = window.backend;
  say("Choose the review folder in the window that opened…");
  const entry = await backend.pickFolder();
  say(`Got "${entry.name}". Asking permission to edit files in it…`);
  if (!(await Backend.isReviewFolder(entry.handle))
    && !confirm(`"${entry.name}" has no review files yet (no 08 - Records, 07 - Searches.csv or review_state.json). Start a new review in it?`)) return;
  await openReview(entry);
}

/** Shows any failure on the start screen, in words (a refused or cancelled folder included). */
function explain(e) {
  console.error(e);
  if (e?.name === "AbortError") return say(`No folder was opened: the folder window was closed, or the browser refused that folder or the permission to edit it. Try again and choose the review folder itself. (Browser: "${e.message}")`, "err");
  if (e?.name === "SecurityError") return say("The browser blocked the folder window. Click the button again (it must be a direct click).", "err");
  say(`${e?.name ?? "Error"}: ${e?.message ?? e}`, "err");
}
