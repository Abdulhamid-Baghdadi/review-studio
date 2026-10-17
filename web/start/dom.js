/**
 * Small DOM helpers of the start screen (it runs before the Review Studio page is loaded).
 * @module web/start/dom
 */
export const $ = s => document.querySelector(s);

export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
};

export const button = (label, onclick, cls = "") => el("button", { className: `btn ${cls}`, onclick, type: "button" }, label);

/** A message on the start screen ("Opening…", an error). */
export const say = (text, kind = "") => $("#startBody").querySelector(".start-msg")?.replaceChildren(el("span", { className: kind }, text));

/** A small preference in the browser's storage (nothing happens in a private window). */
export const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
