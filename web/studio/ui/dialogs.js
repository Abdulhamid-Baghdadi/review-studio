/**
 * Toasts, modal dialogs, a text prompt and a confirmation box.
 * @module web/studio/ui/dialogs
 */
import { $, h } from "../core/dom.js";

export function toast(text, kind = "") {
  const t = h("div", { class: "toast " + kind }, text);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3200);
}

export function modal({ title, body, buttons = [{ label: "Close", value: null }], wide = false }) {
  return new Promise(resolve => {
    const close = v => { scrim.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    const box = h("div", { class: "modal" + (wide ? " wide" : "") },
      h("div", { class: "mh" }, title), h("div", { class: "mb" }, body),
      h("div", { class: "mf" }, buttons.map(b => h("button", {
        class: "btn " + (b.primary ? "primary" : b.danger ? "danger" : ""),
        onclick: () => close(typeof b.value === "function" ? b.value() : b.value),
      }, b.label))));
    const scrim = h("div", { class: "scrim", onclick: e => { if (e.target === scrim) close(null); } }, box);
    document.addEventListener("keydown", onKey, true);
    document.body.append(scrim);
    setTimeout(() => (box.querySelector("textarea, input") || box.querySelector(".btn.primary"))?.focus(), 30);
  });
}

export function promptText(title, message, placeholder = "", multiline = false, initial = "") {
  const input = multiline ? h("textarea", { placeholder, rows: 3 }) : h("input", { type: "text", placeholder });
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
