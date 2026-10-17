/**
 * Keyboard shortcuts: next / previous page, help, worked example, glossary, timeline. A page's own keys (the
 * screening keys, Ctrl+Enter on the idea page) are its PAGE_KEYS handler, asked first.
 * @module web/studio/shell/keyboard
 */
import { CUR, HOME } from "../core/state.js";
import { closeHelp, openExample, openGlossary, openHelp, openTimeline } from "./help.js";
import { curTab, goTab, tabSequence } from "./navigation.js";
import { PAGE_KEYS } from "./registry.js";

document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || Boolean(document.querySelector(".scrim"));
  if (e.key === "Escape") { closeHelp(); return; }
  if (PAGE_KEYS[CUR]?.(e, typing)) return;
  if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    const seq = tabSequence(), i = (CUR === HOME ? -1 : seq.findIndex(x => x.tab === curTab())) + (e.key === "ArrowDown" ? 1 : -1);
    if (seq[i]) { e.preventDefault(); goTab(seq[i].tab); }
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "?" && CUR !== HOME) { openHelp(CUR); return; }
  if (e.key.toLowerCase() === "x" && CUR !== HOME) { openExample(CUR); return; }
  if (e.key.toLowerCase() === "g") { openGlossary(); return; }
  if (e.key.toLowerCase() === "t") openTimeline();
});
