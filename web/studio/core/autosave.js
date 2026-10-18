/**
 * Saving as you type: each field saves itself a second after the last keystroke, like an online document.
 * @module web/studio/core/autosave
 */
import { $ } from "./dom.js";
import { S } from "./state.js";

// ---------- saving as you type: like an online document, there is no Save button
// Each field saves itself a second after you stop typing (and when you leave it). After the protocol is locked, a
// change to a protected part (questions, concepts, strings, protocol text, exclusion reasons, charting form) is an
// amendment that needs a reason: those fields save when you leave them, and ask for the reason once.
const PENDING = new Map();                 // what is waiting to be saved: key -> {timer, save}
export let SAVE_STATE = ["", ""];
const lockedFor = guard => Boolean(guard && S?.state.protocol.locked && !S.dev_mode);
function setSaveState(state, text) {
  SAVE_STATE = [state, text];
  const el = $("#saveState");
  if (el) { el.className = "save-state " + state; el.textContent = text; }
}
export async function runSave(key, save) {
  const p = PENDING.get(key);
  if (p?.timer) clearTimeout(p.timer);
  PENDING.delete(key);
  setSaveState("saving", "Saving…");
  try { await save(); setSaveState("saved", "✓ Saved"); }
  catch (e) { setSaveState("error", e.message === "cancelled" ? "Not saved: no reason given" : "Not saved"); }
}
/** A saver for one part of a page: `watch(el)` saves el's edits; `schedule()` / `commit()` for edits made in code. */
export function autoSave(key, save, guard = null) {
  const schedule = () => {
    const old = PENDING.get(key);
    if (old?.timer) clearTimeout(old.timer);
    if (lockedFor(guard)) { PENDING.set(key, { timer: null, save }); setSaveState("locked", "🔒 Saved when you leave the field: it is an amendment"); return; }
    setSaveState("saving", "Saving…");
    PENDING.set(key, { timer: setTimeout(() => runSave(key, save), 1000), save });
  };
  const commit = () => { const p = PENDING.get(key); if (p) runSave(key, p.save); };
  return { schedule, commit, watch: el => { el.addEventListener("input", schedule); el.addEventListener("focusout", commit); return el; } };
}
/** Saves whatever is still waiting (before leaving a page, switching review or hiding the window). */
export function flushSaves() { for (const [key, p] of [...PENDING]) runSave(key, p.save); }
document.addEventListener("visibilitychange", () => { if (document.hidden) flushSaves(); });
