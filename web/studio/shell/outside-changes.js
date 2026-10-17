/**
 * Changes made outside the app (Claude through bin/ai-assist.js, Obsidian): the review is read again.
 * @module web/studio/shell/outside-changes
 */
import { backend, getJSON } from "../core/api.js";
import { REVIEW, S, SC, setS } from "../core/state.js";
import { render } from "./chrome.js";
import { toast } from "../ui/dialogs.js";

// Changes made outside Review Studio (Claude through bin/ai-assist.js, another program): re-read the review
// when the window comes back into view, and every 15 s while it is visible.
let checkingOutside = false;
async function checkOutside() {
  if (checkingOutside || document.hidden || !S) return;
  checkingOutside = true;
  try {
    if (await backend.refreshIfChanged()) {
      setS(await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`));
      SC.cache = {};
      render();
      toast("Updated: the review was changed outside Review Studio (for example by Claude).", "ok");
    }
  } catch (e) { console.warn("checking for outside changes:", e); }
  finally { checkingOutside = false; }
}
window.addEventListener("focus", checkOutside);
document.addEventListener("visibilitychange", checkOutside);
setInterval(checkOutside, 15000);
