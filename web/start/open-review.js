/**
 * Opening a review: the backend reads the folder (with progress on the start screen), then the Systematic Review Workbench page
 * (web/studio/app.js) is loaded and draws its first page. How long that took is shown and kept as window.openTiming.
 * @module web/start/open-review
 */
import { $, remember, say } from "./dom.js";

/** @param {object} entry a review entry (a remembered folder, the draft or the example) */
export async function openReview(entry) {
  const backend = window.backend;
  const started = performance.now();
  say(`Opening ${entry.name}…`);
  let notes = 0;
  await backend.open(entry, { onProgress: (done, total) => { notes = total; say(`Reading notes: ${done.toLocaleString()} of ${total.toLocaleString()}…`); } });
  const read = performance.now();
  say(`Preparing the page (${((read - started) / 1000).toFixed(1)} s so far)…`);
  remember("review", entry.name);
  $("#start").hidden = true;
  $("#app").hidden = false;
  await import("../studio/app.js");
  await window.studioReady;                                              // the first page is drawn
  showOpenTiming({ review: entry.name, notes, readSeconds: (read - started) / 1000, totalSeconds: (performance.now() - started) / 1000 });
}

/** How long opening took, shown for 20 s (click to close) and kept as window.openTiming. */
function showOpenTiming(t) {
  window.openTiming = t;
  console.info("Systematic Review Workbench open timing", t);
  if (!t.notes) return;                         // nothing worth timing (the draft, a new review)
  const note = document.createElement("div");
  note.className = "toast";
  note.title = "Click to close";
  note.textContent = `Opened ${t.notes ? t.notes.toLocaleString() + " notes" : "the review"} in ${t.totalSeconds.toFixed(1)} s ` +
    `(reading the folder ${t.readSeconds.toFixed(1)} s, showing the page ${(t.totalSeconds - t.readSeconds).toFixed(1)} s)`;
  note.onclick = () => note.remove();
  $("#toastLog").append(note);
  setTimeout(() => note.remove(), 20000);
}
