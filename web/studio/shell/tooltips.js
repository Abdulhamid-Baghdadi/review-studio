/**
 * Tooltips for keyboard users. Browsers show a control's `title` only on mouse hover, so what a map step or a
 * step tab says in its tooltip was out of reach from the keyboard (rule C1). Here the same text appears next to the
 * control while it has keyboard focus; Escape hides it, and it never covers the control itself (WCAG 1.4.13).
 * Screen readers already read the title as the control's description.
 * @module web/studio/shell/tooltips
 */
import { h } from "../core/dom.js";

const tip = h("div", { class: "focus-tip", "aria-hidden": "true" });
const hide = () => tip.remove();

document.addEventListener("focusin", e => {
  const el = e.target;
  if (!(el instanceof Element) || !el.title?.trim() || !el.matches(":focus-visible")) return hide();   // mouse users get the browser's own
  tip.textContent = el.title;
  document.body.append(tip);
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, ht = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
  tip.style.top = `${r.bottom + 8 + ht < innerHeight ? r.bottom + 8 : Math.max(8, r.top - ht - 8)}px`;   // below, else above
});
document.addEventListener("focusout", hide);
document.addEventListener("keydown", e => { if (e.key === "Escape") hide(); }, true);
document.addEventListener("scroll", hide, true);
