/**
 * Building the page: h() for elements, $() to find one, and the browser storage for small preferences.
 * @module web/studio/core/dom
 */
export const $ = (s, r = document) => r.querySelector(s);
export const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// The browser's own replaceChildren prints null as the word "null" and an array as "a,b": skip empty items and
// flatten lists, as h() does, so an optional part of a page can never show up as text.
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  const own = proto.replaceChildren;
  proto.replaceChildren = function (...kids) { return own.apply(this, kids.flat(9).filter(k => k != null && k !== false)); };
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  // clickable non-controls (sidebar steps, queue rows…) are reachable by keyboard: Tab, then Enter or Space
  if (props?.onclick && !["button", "a", "input", "select", "textarea", "label", "summary"].includes(tag) && !el.hasAttribute("tabindex")) {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target === el) { e.preventDefault(); el.click(); } });
  }
  return el;
}
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pct = x => x == null ? "–" : Math.round(x * 100) + " %";
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
