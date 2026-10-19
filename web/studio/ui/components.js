/**
 * Small building blocks shared by the pages: cards, buttons, pills, fields, drop zones, chips, highlighting.
 * @module web/studio/ui/components
 */
import { api, upload } from "../core/api.js";
import { esc, h } from "../core/dom.js";
import { S } from "../core/state.js";
import { toast } from "./dialogs.js";

/** The library folder chosen in Settings (e.g. "00 - Library"). */
export const libraryName = () => S.library_name || "your library folder";
export const pill = (text, kind = "") => h("span", { class: "pill " + kind }, text);
let ids = 0;
const idOf = el => el.id || (el.id = `lbl-${++ids}`);
const isField = el => ["INPUT", "SELECT", "TEXTAREA"].includes(el?.tagName);
/** A field with its visible label around it; the hint under it is linked as the field's description. */
export function field(label, input, hint, { hintFirst = false } = {}) {
  const note = hint ? h("div", { class: "small muted", style: hintFirst ? "margin:-2px 0 3px" : "margin-top:3px" }, hint) : null;
  if (note && isField(input)) input.setAttribute("aria-describedby", idOf(note));
  return h("label", { class: "field" }, h("span", {}, label), ...(hintFirst ? [note, input] : [input, note]));
}
/**
 * Names a field by text already visible on the page (a card title, a table's column and row): the field points to
 * those elements (aria-labelledby), and to its hint (aria-describedby). @returns {HTMLElement} the field
 */
export function labelBy(input, labels, hint) {
  input.setAttribute("aria-labelledby", [labels].flat().filter(Boolean).map(idOf).join(" "));
  if (hint) input.setAttribute("aria-describedby", idOf(hint));
  return input;
}
export const card = (title, sub, ...kids) => h("div", { class: "card" }, title ? h("h2", {}, title) : null, sub ? h("p", { class: "sub" }, sub) : null, ...kids);
export const btn = (label, onclick, cls = "", title) => h("button", { class: "btn " + cls, onclick, title }, label);
/** A button that shows only a symbol: its words are its name (read out) and its tooltip. */
export const iconBtn = (icon, label, onclick, cls = "") => h("button", { class: "btn ghost icon " + cls, onclick, title: label, "aria-label": label }, icon);
export const bar = frac => h("div", { class: "bar" }, h("i", { style: `width:${Math.round((frac || 0) * 100)}%` }));
export const statusKind = s => ({ done: "ok", "in-progress": "accent", skipped: "", "not-started": "" }[s]);
export const decKind = d => ({ include: "ok", exclude: "bad", unsure: "warn", pending: "", "": "" }[d] ?? "");
const DECIDED = { include: "included", exclude: "excluded", unsure: "unsure", pending: "not decided yet", "": "not decided yet" };
/**
 * A decision as a small round mark: ✓ include, ✕ exclude, ? unsure, an empty ring when open. The symbol and its name
 * (read out, and shown as a tooltip) carry the meaning, so it never rests on colour alone (WCAG 1.4.1).
 */
export const decDot = (decision, name = DECIDED[decision] ?? decision) =>
  h("span", { class: "dec-dot " + (decision || "pending"), role: "img", "aria-label": name, title: name });

/** A row of buttons of which one is on; each says whether it is pressed, so screen readers know the mode. */
export function segmented(options, value, onchange, label) {
  return h("div", { class: "seg", role: "group", "aria-label": label }, options.map(([v, text]) =>
    h("button", { class: v === value ? "on" : "", "aria-pressed": String(v === value), onclick: () => onchange(v) }, text)));
}

export function dropzone(label, accept, onFile) {
  const input = h("input", { type: "file", accept, style: "display:none", onchange: () => input.files[0] && take(input.files[0]) });
  const z = h("div", {
    class: "drop", onclick: () => input.click(),
    ondragover: e => { e.preventDefault(); z.classList.add("over"); },
    ondragleave: () => z.classList.remove("over"),
    ondrop: e => { e.preventDefault(); z.classList.remove("over"); e.dataTransfer.files[0] && take(e.dataTransfer.files[0]); },
  }, h("div", { html: `⬆︎ <b>Drop a file here</b> or click to choose` }), h("div", { class: "small" }, label), input);
  async function take(file) {
    z.classList.add("has");
    z.firstChild.innerHTML = `<span class="spin" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></span> Uploading <b>${esc(file.name)}</b>…`;
    try {
      const path = await upload(file);
      z.firstChild.innerHTML = `✓ <b>${esc(file.name)}</b> ready`;
      onFile(path, file);
    } catch (e) { toast(e.message, "err"); z.classList.remove("has"); }
  }
  return z;
}

/** Terms as removable chips, with a field to add more; `label` names that field (e.g. "Add a term to “Workplace”"). */
export function chipsInput(terms, onchange, placeholder = "type a term, press Enter", label = "Add a term") {
  const wrap = h("div", { class: "chips" });
  const draw = () => {
    wrap.replaceChildren(
      ...terms.map((t, i) => h("span", { class: "chip" }, t,
        h("button", { title: "Remove", "aria-label": `Remove “${t}”`, onclick: () => { terms.splice(i, 1); onchange(terms); draw(); } }, "×"))),
      input);
  };
  const input = h("input", {
    type: "text", placeholder, "aria-label": label,
    onkeydown: e => {
      if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
        e.preventDefault();
        input.value.split(/[;,\n]/).map(s => s.trim()).filter(Boolean).forEach(s => terms.includes(s) || terms.push(s));
        input.value = ""; onchange(terms); draw(); input.focus();
      } else if (e.key === "Backspace" && !input.value && terms.length) { terms.pop(); onchange(terms); draw(); input.focus(); }
    },
    onpaste: e => {
      const t = e.clipboardData.getData("text");
      if (/[;\n,]/.test(t)) {
        e.preventDefault();
        t.split(/[;,\n]/).map(s => s.trim()).filter(Boolean).forEach(s => terms.includes(s) || terms.push(s));
        onchange(terms); draw(); input.focus();
      }
    },
  });
  draw();
  return wrap;
}

export function autosize(t) { const f = () => { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 520) + "px"; }; t.addEventListener("input", f); setTimeout(f); return t; }

export function hlQuery(q) {
  const re = /("[^"]*")|\b(AND NOT|AND|OR|NOT)\b|(TITLE-ABS-KEY|TS=|"All Metadata")|(\*)/g;
  let out = "", last = 0, m;
  while ((m = re.exec(q))) {
    out += esc(q.slice(last, m.index));
    if (m[1]) out += m[1].startsWith('"All Metadata') ? `<span class="fld">${esc(m[1])}</span>` : `<span class="str">${esc(m[1]).replace(/\*/g, '<span class="wc">*</span>')}</span>`;
    else if (m[2]) out += `<span class="op">${m[2]}</span>`;
    else if (m[3]) out += `<span class="fld">${esc(m[3])}</span>`;
    else out += `<span class="wc">*</span>`;
    last = re.lastIndex;
  }
  return out + esc(q.slice(last));
}

function termRegex() {
  const terms = (S.state.concepts || []).flatMap(c => c.role === "NOT" ? [] : c.terms);
  const parts = terms.map(t => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "\\w*").replace(/\s+/g, "\\s+")).filter(Boolean);
  return parts.length ? new RegExp(`\\b(${parts.join("|")})`, "gi") : null;
}
export const highlight = text => { const re = termRegex(); return re ? esc(text).replace(re, "<mark>$1</mark>") : esc(text); };

export function copy(text) { navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard", "ok")); }

export function openNote(note) { api("open_note", { note }, { silent: true }).catch(() => {}); }
