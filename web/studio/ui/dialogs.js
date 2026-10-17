/**
 * Toasts, modal dialogs, a text prompt and a confirmation box.
 * @module web/studio/ui/dialogs
 */
import { $, h } from "../core/dom.js";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";
/** The elements of `root` that Tab reaches, in order. */
export const focusables = root => [...root.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length && !el.closest("[inert]"));

/**
 * Gives focus back after a dialog or drawer closes: to the control that opened it, or, when a redraw replaced that
 * control, to the page title (so keyboard and screen-reader users are not dropped at the top of the document).
 */
export function restoreFocus(opener) {
  if (opener?.isConnected && opener !== document.body) return opener.focus();
  const title = $("#topbar h1") || $(".home-hero h1");
  if (title) { title.tabIndex = -1; title.focus(); }
}

/**
 * A short message in the corner, read out by screen readers. Errors stay until closed (they may need reading and
 * acting on); other messages stay long enough to read (about 60 ms per character, at least 3.2 s) and while the
 * pointer is on them.
 */
export function toast(text, kind = "") {
  const error = kind === "err";
  const t = h("div", { class: "toast " + kind }, h("span", {}, text),
    error ? h("button", { class: "toast-x", "aria-label": "Dismiss this message", onclick: () => t.remove() }, "✕") : null);
  $(error ? "#toastAlert" : "#toastLog").append(t);
  if (error) return;
  const ms = Math.min(12000, Math.max(3200, String(text).length * 60));
  let timer = setTimeout(() => t.remove(), ms);
  t.addEventListener("mouseenter", () => clearTimeout(timer));
  t.addEventListener("mouseleave", () => { timer = setTimeout(() => t.remove(), 1500); });
}

let dialogs = 0;
/**
 * A modal dialog (WAI-ARIA dialog pattern): named by its title, focus moves in when it opens, Tab stays inside,
 * Escape or a click outside closes it, and focus returns to what opened it.
 */
export function modal({ title, body, buttons = [{ label: "Close", value: null }], wide = false }) {
  return new Promise(resolve => {
    const opener = document.activeElement, id = `dialog-title-${++dialogs}`;
    const close = v => { scrim.remove(); document.removeEventListener("keydown", onKey, true); restoreFocus(opener); resolve(v); };
    const onKey = e => {
      // removed from outside (e.g. a link in the dialog went to another page): let go of the keyboard
      if (!scrim.isConnected) { document.removeEventListener("keydown", onKey, true); resolve(null); return; }
      if (e.key === "Escape") { e.stopPropagation(); close(null); return; }
      if (e.key !== "Tab") return;
      const list = focusables(box), first = list[0], last = list.at(-1);
      if (!list.length) { e.preventDefault(); return; }
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const box = h("div", { class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-labelledby": id },
      h("h2", { class: "mh", id }, title), h("div", { class: "mb" }, body),
      h("div", { class: "mf" }, buttons.map(b => h("button", {
        class: "btn " + (b.primary ? "primary" : b.danger ? "danger" : ""),
        onclick: () => close(typeof b.value === "function" ? b.value() : b.value),
      }, b.label))));
    const scrim = h("div", { class: "scrim", onclick: e => { if (e.target === scrim) close(null); } }, box);
    document.addEventListener("keydown", onKey, true);
    document.body.append(scrim);
    setTimeout(() => (box.querySelector("textarea, input") || box.querySelector(".btn.primary") || focusables(box)[0])?.focus(), 30);
  });
}

export function promptText(title, message, placeholder = "", multiline = false, initial = "") {
  const input = multiline ? h("textarea", { placeholder, rows: 3, "aria-label": message }) : h("input", { type: "text", placeholder, "aria-label": message });
  input.value = initial;
  return modal({
    title, body: h("div", { class: "stack" }, h("p", { class: "muted", style: "margin:0" }, message), input),
    buttons: [{ label: "Cancel", value: null }, { label: "OK", primary: true, value: () => input.value.trim() || null }],
  });
}
export const confirmBox = (title, message, ok = "Continue", danger = false) => modal({
  title, body: h("p", { class: "muted" }, message),
  buttons: [{ label: "Cancel", value: false }, { label: ok, primary: !danger, danger, value: true }],
});
