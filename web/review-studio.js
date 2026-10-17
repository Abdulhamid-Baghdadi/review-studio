// The Review Studio page. It talks to `window.backend` (src/ui/backend.js), which runs the review engine in
// the browser on the folder the user opened.
const backend = window.backend;
/* Review Studio — the page. Plain JavaScript, no build step. */
"use strict";

// ================================================================ basics
const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

function h(tag, props, ...kids) {
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
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = x => x == null ? "–" : Math.round(x * 100) + " %";
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let S = null;            // server snapshot
let H = null;            // help texts
let REVIEW = store.get("review", "Project 2 review");
let CUR = location.hash.slice(1) || store.get("stage", "home");
const D = {};            // unsaved drafts per stage

// ================================================================ server calls
async function getJSON(url) {
  return backend.get(url);
}

async function api(action, args = {}, opts = {}) {
  const r = await backend.action(action, args);
  const j = r.body;
  if (r.status === 409 && j.amendment) {
    const reason = await promptText("Protocol is locked",
      `The protocol was registered on ${S.state.protocol.locked}. Changing the ${j.amendment} is a protocol amendment and will be listed in the timeline. Why is this change needed?`,
      "e.g. pilot showed that 'EEE' is a common synonym", true);
    if (!reason) throw new Error("cancelled");
    return api(action, { ...args, amendment: reason }, opts);
  }
  if (!r.ok) {
    if (!opts.quietError) toast(j.error || "Something went wrong", "err");
    throw new Error(j.error || "error");
  }
  if (j.state) { S = j.state; opts.render === false ? renderChrome() : render(); }
  if (j.message && !opts.silent) toast(j.message, "ok");
  return j;
}

async function upload(file) {
  return backend.upload(file);
}
const download = p => backend.download(p).catch(e => toast(e.message, "err"));

async function busy(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ${old}`;
  try { return await fn(); } catch (e) { /* toast already shown */ } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ================================================================ toasts & modals
function toast(text, kind = "") {
  const t = h("div", { class: "toast " + kind }, text);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3200);
}

function modal({ title, body, buttons = [{ label: "Close", value: null }], wide = false }) {
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

function promptText(title, message, placeholder = "", multiline = false, initial = "") {
  const input = multiline ? h("textarea", { placeholder, rows: 3 }) : h("input", { type: "text", placeholder });
  input.value = initial;
  return modal({
    title, body: h("div", { class: "stack" }, h("p", { class: "muted", style: "margin:0" }, message), input),
    buttons: [{ label: "Cancel", value: null }, { label: "OK", primary: true, value: () => input.value.trim() || null }],
  });
}
const confirmBox = (title, message, ok = "Continue", danger = false) => modal({
  title, body: h("p", { class: "muted" }, message),
  buttons: [{ label: "Cancel", value: false }, { label: ok, primary: !danger, danger, value: true }],
});

// ================================================================ small components
/** The library folder chosen in Settings (e.g. "00 - Library"). */
const libraryName = () => S.library_name || "your library folder";
const pill = (text, kind = "") => h("span", { class: "pill " + kind }, text);
const field = (label, input, hint) => h("label", { class: "field" }, h("span", {}, label), input, hint ? h("div", { class: "small muted", style: "margin-top:3px" }, hint) : null);
const card = (title, sub, ...kids) => h("div", { class: "card" }, title ? h("h3", {}, title) : null, sub ? h("p", { class: "sub" }, sub) : null, ...kids);
const btn = (label, onclick, cls = "", title) => h("button", { class: "btn " + cls, onclick, title }, label);
const iconBtn = (icon, label, onclick) => h("button", { class: "btn ghost icon", onclick, title: label, "aria-label": label }, icon);
const bar = frac => h("div", { class: "bar" }, h("i", { style: `width:${Math.round((frac || 0) * 100)}%` }));
const statusKind = s => ({ done: "ok", "in-progress": "accent", skipped: "", "not-started": "" }[s]);
const decKind = d => ({ include: "ok", exclude: "bad", unsure: "warn", pending: "", "": "" }[d] ?? "");

function segmented(options, value, onchange) {
  return h("div", { class: "seg" }, options.map(([v, label]) =>
    h("button", { class: v === value ? "on" : "", onclick: () => onchange(v) }, label)));
}

function dropzone(label, accept, onFile) {
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

function chipsInput(terms, onchange, placeholder = "type a term, press Enter") {
  const wrap = h("div", { class: "chips" });
  const draw = () => {
    wrap.replaceChildren(
      ...terms.map((t, i) => h("span", { class: "chip" }, t,
        h("button", { title: "Remove", onclick: () => { terms.splice(i, 1); onchange(terms); draw(); } }, "×"))),
      input);
  };
  const input = h("input", {
    type: "text", placeholder,
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

function autosize(t) { const f = () => { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 520) + "px"; }; t.addEventListener("input", f); setTimeout(f); return t; }

function hlQuery(q) {
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
const highlight = text => { const re = termRegex(); return re ? esc(text).replace(re, "<mark>$1</mark>") : esc(text); };

function copy(text) { navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard", "ok")); }

function openNote(note) { api("open_note", { note }, { silent: true }).catch(() => {}); }

// ================================================================ charts (SVG)
function svg(w, hgt, inner) { return h("div", { html: `<svg viewBox="0 0 ${w} ${hgt}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">${inner}</svg>` }); }

function gauge(k) {
  const v = k == null ? 0 : Math.max(-0.2, Math.min(1, k));
  const ang = Math.PI * (1 - (v + 0.2) / 1.2);
  const x = 90 + 70 * Math.cos(ang), y = 90 - 70 * Math.sin(ang);
  const color = k == null ? "var(--faint)" : k >= 0.6 ? "var(--ok)" : k >= 0.4 ? "var(--warn)" : "var(--bad)";
  const big = (v + 0.2) / 1.2 > 0.5 ? 1 : 0;
  return svg(180, 110, `
    <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--surface-2)" stroke-width="14" stroke-linecap="round"/>
    ${k == null ? "" : `<path d="M20 90 A70 70 0 ${big > 1 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>`}
    <text x="90" y="84" text-anchor="middle" font-size="26" font-weight="700" fill="var(--text)">${k == null ? "–" : k.toFixed(2)}</text>
    <text x="90" y="104" text-anchor="middle" font-size="11" fill="var(--muted)">Cohen's κ</text>`);
}

/** The PRISMA flow diagram; `here` (a box: identified, screened, sought, assessed, included) is highlighted instead of the screening boxes. */
function flowDiagram(f, here) {
  const mark = (id, dflt) => here === undefined ? dflt : here === id;
  const W = 760, bw = 330, gap = 60, x1 = 20, x2 = x1 + bw + gap;
  let y = 14, out = "";
  const box = (x, y, w, hh, lines, strong) => {
    out += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="10" fill="${strong ? "var(--accent-2)" : "var(--surface)"}" stroke="${strong ? "var(--accent)" : "var(--border)"}" stroke-width="${strong && here !== undefined ? 3 : 1.5}"/>`;
    lines.forEach((l, i) => out += `<text x="${x + w / 2}" y="${y + 22 + i * 17}" text-anchor="middle" font-size="${i ? 12 : 13}" ${i ? 'fill="var(--muted)"' : 'font-weight="600" fill="var(--text)"'}>${esc(l)}</text>`);
  };
  const arrow = (xa, ya, xb, yb) => out += `<line x1="${xa}" y1="${ya}" x2="${xb}" y2="${yb}" stroke="var(--faint)" stroke-width="1.6" marker-end="url(#ah)"/>`;
  out += `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--faint)"/></marker></defs>`;
  const dbl = f.db.map(d => `${d.name}: ${d.n}`).slice(0, 3), otl = f.other.map(d => `${d.name.replace(/ \(.*\)/, "")}: ${d.n}`).slice(0, 3);
  const hTop = 34 + Math.max(dbl.length, otl.length, 1) * 17;
  box(x1, y, bw, hTop, [`Identified — databases (n = ${f.n_db})`, ...dbl], mark("identified", false));
  box(x2, y, bw, hTop, [`Identified — other sources (n = ${f.n_other})`, ...otl], mark("identified", false));
  y += hTop + 26; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2); arrow(x2 + bw / 2, y - 26, x1 + bw / 2 + 40, y - 2);
  box(x1, y, bw, 50, [`Screened — title/abstract (n = ${f.unique})`, `${f.duplicates} duplicates removed · ${f.ta_pending} still open`], mark("screened", true));
  box(x2, y, bw, 50, [`Excluded (n = ${f.ta_excluded})`, Object.entries(f.ta_reasons).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 52)]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  box(x1, y, bw, 50, [`Sought for retrieval (n = ${f.sought})`, `include ${f.ta_include} · unsure ${f.ta_unsure}`], mark("sought", false));
  box(x2, y, bw, 50, [`Not retrieved (n = ${f.not_retrieved})`, ""]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  box(x1, y, bw, 50, [`Assessed — full text (n = ${f.assessed})`, `${f.ft_pending} still open`], mark("assessed", true));
  box(x2, y, bw, 50, [`Excluded (n = ${f.ft_excluded})`, Object.entries(f.ft_reasons).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 52)]);
  arrow(x1 + bw, y + 25, x2 - 2, y + 25);
  y += 76; arrow(x1 + bw / 2, y - 26, x1 + bw / 2, y - 2);
  out += `<rect x="${x1}" y="${y}" width="${bw}" height="50" rx="10" fill="var(--ok-bg)" stroke="var(--ok)" stroke-width="${here === "included" ? 3.5 : 1.5}"/><text x="${x1 + bw / 2}" y="${y + 30}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ok)">Included (n = ${f.included})</text>`;
  return h("div", { class: "flow" }, svg(W, y + 62, out));
}

function pilotChart(pilots) {
  const rows = pilots.slice(-8);
  if (!rows.length) return h("div", { class: "empty" }, h("div", { class: "big" }, "🧪"), "No pilots yet. Run one above.");
  const W = 760, rh = 34, H0 = rows.length * rh + 30;
  let out = `<text x="250" y="14" font-size="11" fill="var(--muted)">test-set recall</text><text x="${W - 4}" y="14" text-anchor="end" font-size="11" fill="var(--muted)">hits</text>`;
  rows.forEach((p, i) => {
    const y = 24 + i * rh, rec = p.test_set ? p.retrieved / p.test_set : null;
    const label = `${p.when.slice(5, 16)} · ${p.note || p.database}`.slice(0, 34);
    out += `<text x="0" y="${y + 15}" font-size="12" fill="var(--text)">${esc(label)}</text>`;
    out += `<rect x="250" y="${y + 4}" width="400" height="14" rx="7" fill="var(--surface-2)"/>`;
    if (rec != null) out += `<rect x="250" y="${y + 4}" width="${Math.max(4, 400 * rec)}" height="14" rx="7" fill="${rec >= .8 ? "var(--ok)" : rec >= .5 ? "var(--warn)" : "var(--bad)"}"/><text x="${256 + 400 * rec}" y="${y + 15}" font-size="11" font-weight="700" fill="var(--text)">${p.retrieved}/${p.test_set}</text>`;
    else out += `<text x="258" y="${y + 15}" font-size="11" fill="var(--muted)">not checked</text>`;
    out += `<text x="${W - 4}" y="${y + 15}" text-anchor="end" font-size="12" font-weight="600" fill="var(--text)">${Number(p.hits).toLocaleString()}</text>`;
  });
  return svg(W, H0, out);
}

// ================================================================ PRISMA flow map
// A small PRISMA flow diagram at the top of every page, with live counts, that marks where the user is.
// The boxes of the PRISMA diagram (identification, screening, included) sit between the planning before it and the
// analysis and report after it, which are drawn dashed because they are not part of the PRISMA diagram itself.

/** Which box of the map the page on screen belongs to. */
function flowHere() {
  if (CUR === HOME) return null;
  if (CUR === "screening") return SC.stage === "ft" ? "assessed" : "screened";
  return { idea: "plan", questions: "plan", concepts: "plan", queries: "plan", pilot: "plan", protocol: "plan", registration: "plan",
    searches: "identified", snowballing: "identified", reviewer: "screened", retrieval: "sought",
    charting: "analyse", appraisal: "analyse", synthesis: "analyse", report: "report" }[CUR] ?? null;
}

function flowNodes() {
  const f = S.flow, sys = S.review_type.key === "systematic";
  const screen = st => () => { SC.stage = st; store.set("sc_stage", st); SC.id = null; go("screening"); };
  return [
    { phase: "Plan", nodes: [{ id: "plan", label: "Plan", sub: "question · search", go: () => goStep(stepOf("questions")), outside: true }] },
    { phase: "Identification", nodes: [{ id: "identified", label: "Records found", n: f.n_db + f.n_other,
      minus: f.duplicates > 0 ? `${f.duplicates} duplicates` : "", go: () => go("searches"),
      tip: `Found in databases (${f.n_db}) and other sources such as citation searching (${f.n_other}); duplicates are removed before screening.` }] },
    { phase: "Screening", nodes: [
      { id: "screened", label: "Titles & abstracts", n: f.unique, minus: f.ta_excluded ? `${f.ta_excluded} excluded` : "", open: f.ta_pending,
        go: screen("ta"), tip: `Records screened on title and abstract (${f.ta_pending} still to do).` },
      { id: "sought", label: "Full texts sought", n: f.sought, minus: f.not_retrieved ? `${f.not_retrieved} not found` : "", go: () => go("retrieval"),
        tip: "Papers that passed the title and abstract check, whose full text you look for." },
      { id: "assessed", label: "Full texts read", n: f.assessed, minus: f.ft_excluded ? `${f.ft_excluded} excluded` : "", open: f.ft_pending,
        go: screen("ft"), tip: `Full texts assessed for eligibility (${f.ft_pending} still to do).` }] },
    { phase: "Included", nodes: [{ id: "included", label: sys ? "Studies included" : "Sources included", n: f.included, go: () => go("charting"), good: true,
      tip: "The papers your review is based on." }] },
    { phase: "Analyse", nodes: [{ id: "analyse", label: "Analyse", sub: sys ? "extract · synthesise" : "chart · appraise",
      go: () => go("charting"), outside: true }] },
    { phase: "Report", nodes: [{ id: "report", label: "Report", sub: "write it up", go: () => go("report"), outside: true }] },
  ];
}

function flowMap() {
  if (CUR === HOME || store.get("flowmap", "") === "hidden") return null;
  const groups = flowNodes(), here = flowHere(), order = groups.flatMap(g => g.nodes.map(n => n.id)), hi = order.indexOf(here);
  const node = n => {
    const k = order.indexOf(n.id), where = k === hi ? "here" : k < hi ? "past" : "ahead";
    return h("button", { class: `fm-node ${where} ${n.outside ? "outside" : ""} ${n.good ? "good" : ""}`, onclick: n.go,
      title: (n.tip || n.sub || n.label) + (where === "here" ? " — you are here" : ""), "aria-current": where === "here" ? "step" : null },
      where === "here" ? h("span", { class: "fm-here" }, "You are here") : null,
      h("span", { class: "fm-label" }, n.label),
      n.n === undefined ? h("span", { class: "fm-sub" }, n.sub) : h("span", { class: "fm-n" }, Number(n.n).toLocaleString(), n.open ? h("span", { class: "fm-open" }, ` · ${n.open} to do`) : null),
      n.minus ? h("span", { class: "fm-minus" }, "− " + n.minus) : null);
  };
  const arrow = () => h("span", { class: "fm-arrow", "aria-hidden": "true" }, "→");
  return h("nav", { class: "flowmap", "aria-label": "Where you are in the PRISMA flow" },
    h("div", { class: "fm-track" }, groups.flatMap((g, i) => [i ? arrow() : null,
      h("div", { class: `fm-group ${g.nodes.some(n => n.outside) ? "outside" : "prisma"}` }, g.nodes.some(n => n.outside) ? null : h("div", { class: "fm-phase" }, g.phase),
        h("div", { class: "fm-nodes" }, g.nodes.flatMap((n, j) => [j ? arrow() : null, node(n)])))])),
    h("div", { class: "fm-tools" },
      iconBtn("⤢", "Show the full PRISMA flow diagram", () => modal({ title: "PRISMA flow diagram", wide: true,
        body: h("div", {}, h("p", { class: "muted", style: "margin-top:0" }, "Live from your records; the box you are working on is highlighted."), flowDiagram(S.flow, here)) })),
      iconBtn("✕", "Hide the flow map (show it again under ⚙ Settings)", () => { store.set("flowmap", "hidden"); render(); })));
}

// ================================================================ chrome: sidebar, topbar, metrics
// The sidebar shows steps (src/domain/review-types.js): plain-language groups of stages. A step with more than
// one tab shows its stages as tabs at the top of the page. Statuses, files and links (#questions) stay per stage.
const stage = k => S.stages.find(s => s.key === k);
const HOME = "home";                                  // the introduction page above the stages (not a stage itself)
const PART = { protocol: store.get("part_protocol", "rules") };   // which part of a split stage page is shown
const stepOf = key => S.steps.find(st => st.tabs.some(t => t.stage === key));
const stepStages = st => [...new Set(st.tabs.map(t => t.stage))].map(stage).filter(Boolean);
/** The tab on screen: the stage, and for a split page the part chosen. */
const curTab = () => {
  const tabs = stepOf(CUR)?.tabs.filter(t => t.stage === CUR) ?? [];
  return tabs.find(t => t.part === (PART[CUR] ?? null)) ?? tabs[0];
};
/** Every tab of every step in order: what "Next" and "Back" walk through. */
const tabSequence = () => S.steps.flatMap(st => st.tabs.map(t => ({ step: st, tab: t })));

/** A step's status from its stages: done when every required stage is done or skipped. */
function stepStatus(st) {
  const ss = stepStages(st), req = ss.filter(s => !s.optional), count = req.length ? req : ss;
  if (count.every(s => s.status === "skipped")) return "skipped";
  if (count.every(s => s.status === "done" || s.status === "skipped")) return "done";
  return ss.some(s => ["in-progress", "done"].includes(s.status)) ? "in-progress" : "not-started";
}
/** What the page calls a stage: its tab label, or its step's title when the step has one tab. */
const stageName = key => { const st = stepOf(key); return st?.tabs.length > 1 ? st.tabs.find(t => t.stage === key).label : st?.title ?? stage(key)?.title; };
const stepOptional = st => stepStages(st).every(s => s.optional);

/** Opens a tab (a stage, and the part of a split page). */
function goTab(t) {
  if (t.part) { PART[t.stage] = t.part; store.set("part_" + t.stage, t.part); }
  go(t.stage);
}
/** Opens a step on the tab last used there, or its first tab. */
function goStep(st) {
  const last = store.get("tab_" + st.key, "");
  goTab(st.tabs.find(t => `${t.stage}:${t.part ?? ""}` === last) ?? st.tabs[0]);
}

/** "AI" next to a step where AI can help: grey while off, in the accent colour when the review switched it on. */
function aiMark(keys) {
  const steps = [keys].flat().filter(k => S.ai?.steps[k]);
  if (!steps.length) return null;
  const on = steps.some(k => (S.ai.modes[k] || "off") !== "off");
  return h("span", { class: "ai-mark" + (on ? " on" : ""), title: on ? "AI assistance is on here" : "AI can help here (off; switch it on in the AI assistance card)" }, "AI");
}

function renderSidebar() {
  const sel = $("#reviewSel");
  const label = r => /[\\/]/.test(r) ? "📂 " + r.split(/[\\/]/).pop().replace(/ records$/, "") : r;
  sel.title = /[\\/]/.test(REVIEW) ? REVIEW : "Review";
  sel.replaceChildren(...S.reviews.map(r => h("option", { value: r, selected: r === REVIEW }, label(r))),
    h("option", { value: "__open__" }, "📂 Open folder…"));
  const nav = $("#stepper"), cur = CUR === HOME ? null : stepOf(CUR);
  nav.replaceChildren(h("div", { class: `step home ${CUR === HOME ? "active" : ""}`, onclick: () => go(HOME), title: "What Review Studio is and how it works" },
    h("span", { class: "dot" }, "⌂"), h("span", { class: "lbl" }, h("span", { class: "t" }, "Homepage"))));
  let phase = null;
  S.steps.forEach((st, i) => {
    if (st.phase !== phase) nav.append(h("div", { class: "phase" }, phase = st.phase));
    const status = stepStatus(st), opt = stepOptional(st);
    nav.append(h("div", {
      class: `step ${status} ${st === cur ? "active" : ""}`, onclick: () => goStep(st),
      title: st.tabs.length > 1 ? `${st.hint}: ${st.tabs.map(t => t.label).join(" · ")}` : st.hint,
    }, h("span", { class: "dot" }, status === "done" ? "✓" : status === "skipped" ? "–" : String(i + 1)),
      h("span", { class: "lbl" }, h("span", { class: "t" }, st.title), h("span", { class: "hint" }, st.hint + (opt && !/optional/.test(st.hint) ? " · optional" : ""))),
      aiMark(stepStages(st).map(s => s.key))));
  });
  nav.querySelector(".step.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });   // narrow layout: keep the current step in view
}

// What a part of a split stage page is for (the stage's own description covers the rest)
const PART_DESC = {
  "protocol:rules": "Decide which papers belong in your review and which do not. The short exclusion reasons (E1, E2 …) are the only ones you can pick while screening.",
  "protocol:methods": "The rest of your plan: background, sources, and how you will select, chart and summarise. Together with your question and search it becomes the Protocol note.",
};

function renderTop() {
  if (CUR === HOME) {
    $("#topbar").replaceChildren(
      h("div", { class: "titlerow" }, h("h1", {}, "Welcome to Review Studio")),
      h("p", { class: "desc" }, `From your first idea to the finished report in ${S.steps.length} steps: a ${S.review_type.label.toLowerCase()}, reported to ${S.review_type.guideline}.`),
      h("div", { class: "home-badges" }, [
        ["📝 Plain Markdown", "Every record is a Markdown note with properties; the searches are a CSV table. Any text editor can read them."],
        ["🟣 Opens in Obsidian", "A review folder is an Obsidian vault as it is: the notes, links and the screening and charting tables (.base files) work there too."],
        ["🔒 Stays on your PC", "Everything is saved in a folder you choose. Nothing is uploaded and there is no account."],
      ].map(([t, tip]) => h("span", { class: "home-badge", title: tip }, t)),
        h("a", { class: "home-badge download", href: "https://github.com/Abdulhamid-Baghdadi/review-studio/releases/latest/download/review-studio.zip",
          title: "The desktop version: a ZIP with launchers for Windows, Mac and Linux (needs Node.js). Or install it as an app from ⚙ Settings." }, "💾 Download desktop version")));
    return;
  }
  const s = stage(CUR), st = stepOf(CUR), n = S.steps.indexOf(st), tab = curTab();
  const locked = S.state.protocol.locked;
  const tabs = st.tabs.length > 1 ? h("div", { class: "steptabs", role: "tablist" }, st.tabs.map(t => {
    const ts = stage(t.stage), on = t === tab;
    return h("button", { class: `steptab ${ts.status} ${on ? "on" : ""}`, role: "tab", "aria-selected": String(on),
      title: ts.desc + (ts.optional ? " (optional)" : ""), onclick: () => goTab(t) },
      h("span", { class: "tdot" }, ts.status === "done" ? "✓" : ts.status === "skipped" ? "–" : ""), t.label,
      ts.optional ? h("span", { class: "topt" }, "optional") : null, aiMark(t.stage));
  })) : null;
  const what = st.tabs.length > 1 ? `“${tab.label}”` : "this step";
  $("#topbar").replaceChildren(
    h("div", { class: "crumbs" }, `${REVIEW} · ${S.review_type.label}, reported to ${S.review_type.guideline} · ${st.phase} · step ${n + 1} of ${S.steps.length}`),
    flowMap() || "",
    h("div", { class: "titlerow" },
      h("h1", {}, st.title),
      st.tabs.length > 1 ? null : pill(s.status.replace("-", " "), statusKind(s.status)),
      st.tabs.length > 1 || !s.optional ? null : pill("optional", "info"),
      S.dev_mode ? pill("🛠 developer mode — locks off", "bad")
        : locked && ["questions", "concepts", "queries", "protocol", "charting"].includes(CUR) ? pill("🔒 protocol locked — changes are amendments", "warn") : null,
      h("span", { class: "spacer" }),
      btn("? Help", () => openHelp(CUR), "ghost"),
      s.optional && !["skipped", "done"].includes(s.status) ? btn("Skip…", skipStage, "ghost", `Skip ${what} (it is optional)`) : null,
      s.status === "done" || s.status === "skipped" ? btn("Reopen", () => api("stage_status", { stage: CUR, status: "in-progress" }), "", `Reopen ${what}`)
        : btn("✓ Mark done", () => api("stage_status", { stage: CUR, status: "done" }), "primary", `Mark ${what} as done`)),
    tabs || "",
    h("p", { class: "desc" }, PART_DESC[`${CUR}:${tab.part}`] ?? s.desc, s.reason ? h("span", { class: "muted" }, ` — skipped: ${s.reason}`) : null),
    savedIn(CUR) || "", aiCard(CUR) || "");
}

/** Back and Next at the foot of every page: walks the tabs and steps in order. */
function pageNav() {
  const seq = tabSequence(), tab = curTab(), i = seq.findIndex(x => x.tab === tab);
  const name = x => x.step.tabs.length > 1 && x.step.tabs[0] !== x.tab ? `${x.step.title}: ${x.tab.label}` : x.step.title;
  const prev = seq[i - 1], next = seq[i + 1];
  return h("div", { class: "pagenav" },
    prev ? btn(`← ${name(prev)}`, () => goTab(prev.tab), "ghost") : h("span"),
    next ? btn(`Next: ${name(next)} →`, () => goTab(next.tab), "") : null);
}

// AI assistance for this step: the mode chosen for this review, the skill that does the work, what to check
function aiCard(key) {
  const step = S.ai?.steps[key];
  if (!step) return null;
  const mode = S.ai.modes[key] || "off", cur = step.modes.find(m => m.key === mode);
  // folded to one line by default; the details (what the mode does, the skill, what you check) open on request
  const open = store.get("ai_open", "") === "1";
  const toggle = () => { store.set("ai_open", open ? "" : "1"); render(); };
  return h("div", { class: "aicard" + (mode === "off" ? "" : " on") + (open ? " open" : "") },
    h("div", { class: "row" },
      h("b", {}, "🤖 AI assistance"),
      segmented(step.modes.map(m => [m.key, m.label]), mode, v => api("ai_mode", { stage: key, mode: v })),
      mode === "off" ? null : btn("📋 Copy prompt", () => copy(step.prompt), "sm primary"),
      h("span", { class: "spacer" }),
      h("button", { class: "btn sm ghost ai-toggle", "aria-expanded": String(open), onclick: toggle }, open ? "Hide details ▴" : "Details ▾")),
    open ? h("div", { class: "aibody" },
      h("div", { class: "small muted" }, cur.desc),
      mode === "off" ? null : h("div", { class: "small muted" }, step.skills.length > 1 ? "Skills: " : "Skill: ",
        step.skills.map((n, i) => [i ? ", " : "", h("code", {}, `.claude/skills/${n}/SKILL.md`)])),
      mode === "off" ? null : h("div", { class: "small" }, h("b", {}, "You check: "),
        h("ul", {}, step.checks.map(c => h("li", {}, c))))) : null);
}

// Where each stage writes its data (paths relative to the review folder; @library = the library folder chosen in Settings, e.g. 00 - Library)
const STORAGE = {
  idea: [["review_state.json", "data"], ["00 - Review timeline.md", "readable: idea log"]],
  questions: [["review_state.json", "data, with every version"], ["03 - Search strategy.md", "readable"]],
  concepts: [["review_state.json", "data"], ["03 - Search strategy.md", "readable: concept table"]],
  queries: [["review_state.json", "data, incl. hand edits"], ["03 - Search strategy.md", "readable: strings"]],
  pilot: [["review_state.json", "data"], ["03 - Search strategy.md", "readable: pilot runs"]],
  protocol: [["review_state.json", "method sections"], ["08 - Screening guide.md", "exclusion reasons"], ["05 - Protocol.md", "generated note"]],
  registration: [["review_state.json", "lock, amendments"], ["00 - Review timeline.md", "readable: amendments"]],
  searches: [["07 - Searches.csv", "one row per search"], ["07 - Exports", "copies of the export files"], ["08 - Records", "one note per paper"]],
  screening: [["08 - Records", "ta_ / ft_decision in each paper's note"], ["08 - Screening.base", "the same as an Obsidian table"], ["08 - Decision log.csv", "every change, with who and how"]],
  reviewer: [["09 - Second reviewer", "blind CSV sheets"], ["08 - Records", "sample_ / r2_ properties"]],
  snowballing: [["07 - Searches.csv", "one row per round"], ["08 - Records", "new papers"]],
  retrieval: [["08 - Records", "pdf_status, oa_url"], ["10 - Full texts", "attached PDFs"]],
  charting: [["08 - Records", "chart_ properties"], ["12 - Charting.base", "the same as an Obsidian table"], ["review_state.json", "the form"]],
  appraisal: [["08 - Records", "appraisal properties"], ["12 - Charting.base", "Appraisal view"]],
  synthesis: [["review_state.json", "what was done; the analysis files stay where you keep them"], ["00 - Review timeline.md", "readable: when it changed"]],
  report: [["14 - PRISMA flow.md", "flow diagram"], ["08 - Decision log.csv", "every decision change"], ["@checklist", "checklist"], ["07 - Exports", "BibTeX, CSV"], ["@library", "included_in on publication notes"]],
};

function savedIn(key) {
  const icon = p => p === "@library" ? "📚" : /\.(md)$/.test(p) ? "📝" : /\.base$/.test(p) ? "▦" : /\.(csv|json)$/.test(p) ? "🗎" : "📁";
  const files = STORAGE[key] || [];
  if (!files.length) return null;
  return h("details", { class: "savedin" }, h("summary", { title: "Which files in your review folder this step writes" }, `📁 Saved in your review folder · ${files.length} file${files.length > 1 ? "s" : ""} ▾`),
    h("div", { class: "files" }, files.map(([p, what]) => [p === "@checklist" ? S.review_type.checklistFile : p, what]).map(([p, what]) => h("button", { class: "file", title: `${S.folder}/${p === "@library" ? "../" + libraryName() : p} — click to open`, onclick: () => openNote(p) },
      icon(p), " ", p === "@library" ? libraryName() : p, h("span", { class: "muted" }, " · " + what)))));
}

function renderMetrics() {
  const f = S.flow, k = S.agreement.ta.kappa, t = S.test_set;
  const last = [...S.state.pilots].reverse().find(p => p.test_set !== "");
  const m = (v, l, to, cls = "") => h("div", { class: "metric " + cls, onclick: () => go(to) }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
  const inc = S.records.filter(r => r.ft_decision === "include");
  const pdfs = inc.filter(r => r.pdf_status === "found").length;
  const [cdone, ctotal] = S.charting_progress;
  const checked = inc.filter(r => String(r.chart?.checked_by || "").toLowerCase() === "reviewer").length;
  const tiles = {                                    // only the numbers that matter for the stage on screen
    unique: () => m(f.unique, "unique records", "searches"),
    ta: () => m(f.ta_pending, "to screen (title/abstract)", "screening", f.ta_pending ? "" : "good"),
    ft: () => m(f.ft_pending, "to screen (full text)", "screening", f.ft_pending ? "" : "good"),
    included: () => m(f.included, "included", "report", f.included ? "good" : ""),
    kappa: () => m(k == null ? "–" : k.toFixed(2), "κ title/abstract", "reviewer", k == null ? "" : k >= 0.6 ? "good" : "bad"),
    test: () => m(last ? `${last.retrieved}/${last.test_set}` : `–/${t.size}`, "test set (last pilot)", "pilot"),
    problems: () => m(S.problems.length, "problems", "screening", S.problems.length ? "bad" : "good"),
    pdfs: () => m(`${pdfs}/${inc.length}`, "included with PDF", "retrieval", inc.length && pdfs === inc.length ? "good" : ""),
    charted: () => m(`${cdone}/${ctotal}`, "charted (AI or you)", "charting"),
    checked: () => m(`${checked}/${ctotal}`, "checked by you", "charting", ctotal && checked === ctotal ? "good" : ""),
  };
  const PER_STAGE = {
    queries: ["test"], pilot: ["test"], searches: ["unique", "problems"],
    screening: ["unique", "ta", "ft", "included", "problems"], reviewer: ["kappa"],
    snowballing: ["unique", "included"], retrieval: ["included", "pdfs"],
    charting: ["included", "pdfs", "charted", "checked"], appraisal: ["included", "checked"],
    report: ["unique", "included", "pdfs", "checked", "problems"],
  };
  const keys = (PER_STAGE[CUR] || []).filter(x => x !== "kappa" || stage("reviewer").status !== "skipped");
  $("#metrics").replaceChildren(...keys.map(x => tiles[x]()));
  $("#metrics").style.display = keys.length ? "" : "none";
}

function renderDevButton() {
  const b = $("#btnDev");
  b.textContent = S.dev_mode ? "🛠 Developer mode: on — switch off" : "🛠 Developer mode…";
  b.classList.toggle("dev-on", !!S.dev_mode);
  const sb = $("#btnSettings");                       // the state stays visible while the menu is closed
  sb.textContent = S.dev_mode ? "⚙ Settings · dev mode on" : "⚙ Settings";
  sb.classList.toggle("dev-on", !!S.dev_mode);
  b.title = S.dev_mode ? "Developer mode is on: locked parts (protocol, criteria, charting form) can be edited without amendments; edits are still noted in the timeline. Click to switch off."
    : "Developer mode: lift the protocol locks while you develop the review. Edits are still noted in the timeline.";
}

function renderChrome() { renderSidebar(); renderTop(); renderMetrics(); renderDevButton(); }

function render() {
  renderChrome();
  renderDraftBar();
  for (const id of ["btnTimeline", "btnScr"]) $("#" + id).hidden = CUR === HOME;   // the Homepage is only an introduction
  $("#btnType").textContent = `🧭 ${S.review_type.label} · ${S.review_type.guideline}`;
  $("#btnType").hidden = S.review_type.key !== "scoping" || CUR === HOME;   // systematic is the standard; only a scoping review shows its type
  $("#btnClaude").hidden = !S.ai?.steps[CUR];                      // only on the stages where Claude can help (marked AI)
  const page = $("#page");
  page.replaceChildren(PAGES[CUR](), CUR === HOME ? "" : pageNav());
  nameFields(page);
}

function nameFields(root) {
  for (const el of root.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")) {
    if (el.closest("label") || el.getAttribute("aria-label") || el.id && root.querySelector(`label[for="${el.id}"]`)) continue;
    let n = el, text = "";
    const td = el.closest("td"), tr = td?.closest("table")?.querySelector("tr");
    if (td && tr) text = [tr.children[td.cellIndex]?.innerText, td.parentElement.cells[0]?.innerText].filter(Boolean).join(" — ").trim();
    else if (el.parentElement?.children.length > 1)                    // a row of fields: name / description…
      text = el.placeholder || "";
    while (n && n !== root && !/\w/.test(text)) {           // nearest text before the field: hint, heading, label-like span
      let sib = n.previousElementSibling;
      while (sib && !/\w/.test(text)) { text = sib.innerText?.trim().split("\n")[0] || ""; sib = sib.previousElementSibling; }
      n = n.parentElement;
    }
    const name = (text || el.placeholder || "").slice(0, 120);
    if (name) el.setAttribute("aria-label", name);
  }
}

function go(key) { CUR = key; store.set("stage", key); if (key !== HOME) { const st = stepOf(key), t = curTab(); if (st && t) store.set("tab_" + st.key, `${t.stage}:${t.part ?? ""}`); } history.replaceState(null, "", "#" + key); render(); $("#main").scrollTo({ top: 0 }); const dr = $("#drawer"); if (dr.classList.contains("open") && key !== HOME) (dr.querySelector("h2").textContent.startsWith("Example") ? openExample : openHelp)(key); }

async function skipStage() {
  const r = await promptText("Skip this part", "Skipping is fine for optional parts, but the reason is reported in the timeline and the reporting checklist.", "e.g. not planned in the protocol", true);
  if (r) api("stage_status", { stage: CUR, status: "skipped", reason: r });
}

// ================================================================ help drawer, glossary, timeline
function refList(numbering) {
  return h("ol", { class: "refs" }, Object.entries(numbering).sort((a, b) => a[1] - b[1]).map(([k]) => {
    const r = H.refs[k];
    return h("li", {}, r.text, " ", r.doi ? h("a", { href: `https://doi.org/${r.doi}`, target: "_blank", rel: "noopener" }, `doi:${r.doi}`) : null);
  }));
}
function refMarks(refs, numbering) {
  refs.forEach(r => numbering[r] ??= Object.keys(numbering).length + 1);
  return refs.length ? h("span", { class: "refn", title: refs.map(r => H.refs[r].text).join("\n\n") }, ` [${refs.map(r => numbering[r]).join(", ")}]`) : null;
}
const lvl = key => h("span", { class: "lvl", style: `background:${H.levels[key].color}`, title: H.levels[key].explain }, H.levels[key].label);

function drawer(title, ...body) {
  const dr = $("#drawer");
  dr.replaceChildren(h("div", { class: "dh" }, h("h2", {}, title), iconBtn("✕", "Close", closeHelp)), h("div", { class: "db" }, ...body));
  dr.classList.add("open");
}

function openHelp(key) {
  const x = (S.review_type?.key === "systematic" && H.stages_systematic?.[key]) || H.stages[key], s = stage(key), num = {};
  const rules = x.rules.map(([text, level, refs]) => h("div", { class: "rule" }, lvl(level), h("div", {}, withScr(text), refMarks(refs, num))));
  const terms = x.terms.map(t => h("div", { class: "term" }, h("b", {}, t), H.terms[t].definition, refMarks(H.terms[t].refs, num)));
  drawer("Help · " + stageName(key),
    h("p", { class: "lead" }, x.what),
    h("ol", { class: "steps" }, x.how.map(l => h("li", {}, l))),
    h("h4", {}, "Rule or choice?"), rules,
    h("div", { class: "row", style: "margin-top:14px" }, btn("💡 Show example", () => openExample(key), "sm")),
    h("details", { class: "fold" }, h("summary", {}, `Terms (${terms.length})`), terms),
    h("details", { class: "fold" }, h("summary", {}, "What the labels mean"),
      Object.keys(H.levels).map(k => h("div", { class: "rule" }, lvl(k), h("div", { class: "small muted" }, H.levels[k].explain)))),
    h("details", { class: "fold" }, h("summary", {}, `References (${Object.keys(num).length})`), refList(num)));
}

/**
 * The worked example's value for a field, as light-grey text in an empty field ("e.g. …"); "" when the example has none.
 * `name` is matched to the example's label, ignoring case and "_" (e.g. "main question", "study_type", "eligibility").
 */
/** The worked example for the review's type: a real scoping run, or an illustrative systematic review. */
const sysExample = () => S?.review_type?.key === "systematic" && H?.examples_systematic;
const examples = () => (sysExample() ? H.examples_systematic : H?.examples) ?? {};

function exampleFor(stageKey, name, part) {
  const norm = t => String(t).toLowerCase().replace(/[_\s]+/g, " ").trim();
  const item = (examples()[stageKey]?.items || []).find(([label]) => norm(label) === norm(name) || norm(name).startsWith(norm(label)));
  if (!item) return "";
  const value = part === undefined ? item[1] : String(item[1]).split(" · ")[part];
  return value ? `e.g. ${value}` : "";
}

function openExample(key) {
  const ex = examples()[key] || {}, s = stage(key);
  drawer("Example · " + stageName(key),
    h("div", { class: "callout", style: "margin:8px 0 14px" }, h("b", {}, "Worked example: "), sysExample() ? H.example_topic_systematic : H.example_topic),
    ex.items ? h("table", { class: "tbl" }, ex.items.map(([k, v]) => h("tr", {}, h("td", { style: "width:34%;color:var(--muted);font-weight:600" }, k), h("td", {}, v)))) : null,
    ex.code ? h("div", { class: "code", style: "margin-top:10px", html: hlQuery(ex.code) }) : null,
    ex.lesson ? h("div", { class: "callout ok", style: "margin-top:14px" }, h("b", {}, "Lesson: "), ex.lesson) : null,
    h("p", { class: "small muted", style: "margin-top:16px" }, sysExample() ? H.example_note_systematic : "Real values from a run of this tool on 6 Oct 2026; screening decisions were illustrative."),
    h("div", { class: "row" }, btn("? Back to help", () => openHelp(key), "sm")));
}

function closeHelp() { $("#drawer").classList.remove("open"); }

// "Working with Claude": how to use an AI assistant with this review. The per-step part comes from the same
// settings as the AI assistance cards (review_stages.AI_STEPS), so it stays in step with the tool.
function openClaudeGuide() {
  const sec = (title, ...body) => h("section", { style: "margin:0 0 18px" }, h("h3", { style: "margin:0 0 6px" }, title), ...body);
  const ol = items => h("ol", { style: "margin:4px 0 0;padding-left:20px;line-height:1.6" }, items.map(i => h("li", {}, i)));
  const ul = items => h("ul", { style: "margin:4px 0 0;padding-left:20px;line-height:1.6" }, items.map(i => h("li", {}, i)));
  const goStage = key => { document.querySelector(".scrim")?.remove(); go(key); };
  const steps = Object.entries(S.ai.steps).map(([key, step]) => {
    const mode = S.ai.modes[key] || "off";
    return h("div", { class: "card", style: "padding:12px 16px;margin:0 0 10px" },
      h("div", { class: "row", style: "margin-bottom:6px" },
        h("b", {}, stepOf(key).tabs.length > 1 ? `${stepOf(key).title} · ${stageName(key)}` : stepOf(key).title), pill(mode === "off" ? "off for this review" : "on: " + step.modes.find(m => m.key === mode).label, mode === "off" ? "" : "ok"),
        h("span", { style: "flex:1" }), btn("Open", () => goStage(key), "sm ghost"),
        mode === "off" ? null : btn("📋 Copy prompt", () => copy(step.prompt), "sm")),
      h("div", { class: "small" }, ul(step.modes.filter(m => m.key !== "off").map(m => [h("b", {}, m.label + ": "), m.desc]))),
      h("div", { class: "small", style: "margin-top:6px" }, h("b", {}, "You check: "), ul(step.checks)),
      h("div", { class: "small muted", style: "margin-top:6px" }, "Skill: ", step.skills.map((n, i) => [i ? ", " : "", h("code", {}, `.claude/skills/${n}/SKILL.md`)])));
  });
  modal({ title: "Working with Claude", wide: true, body: h("div", {},
    h("p", { class: "callout", style: "margin:0 0 16px" },
      "Claude can do the slow, repetitive parts of a review: pre-screening, finding PDFs, a blind second screening, filling the charting form. ",
      "It only ever suggests. You confirm every decision in Review Studio, every AI action is logged with the model and date, and the protocol reports it."),
    sec("1 · Set up once", ol([
      "Install Claude Code: the Claude desktop app (Code tab) or the claude command in a terminal.",
      ["Open the app's folder (the one that contains ", h("code", {}, ".claude/skills"), ") as the project in Claude Code. The review skills come with the app; Node.js, which the app already needs, runs them."],
      "Keep Review Studio open next to it: Claude writes, Review Studio is where you check and confirm.",
      "For paywalled papers: let Claude use a browser where you are signed in to your library (for example Claude in Chrome), only if you agree to that."])),
    sec("2 · How one step works", ol([
      "Open the step and choose a mode on its 🤖 AI assistance card. The choice is part of your method: after the protocol is locked it is an amendment.",
      "Press 📋 Copy prompt and paste it into Claude Code.",
      ["Claude follows the skill: it reads what it needs and writes its suggestions through ", h("code", {}, "bin/ai-assist.js"), ", which refuses when the mode is off and never sets a final decision. If two folders share the review's name (a review and its test copy), Claude asks you which one."],
      "Back in Review Studio, review the suggestions (Suggested queue, blind-sheet agreement, 'checked by AI' papers) and confirm or change each one.",
      "Work through the 'You check' list for that step."])),
    sec("3 · Steps Claude can help with", ...steps),
    sec("4 · Other things to ask Claude", ul([
      "Draft protocol sections from your decisions (marked 'Claude draft' until you approve them).",
      "Suggest synonyms and spellings for a concept block before you pilot the search.",
      "Summarise or compare included papers, or draft parts of the report from the charting table. Check every claim against the paper."])),
    sec("5 · Rules that keep the review sound", ul([
      "The reviewer decides. AI suggestions are never final decisions, and a confirmed batch is recorded as yours with a note per record.",
      "Report AI use in the methods (PRISMA-ScR item 9, selection of sources; PRISMA 2020 item 8 asks for automation tools explicitly): which steps, which model, how its output was checked. The protocol's 'Use of AI assistance' section is written for you.",
      "An AI second reviewer is not a second person. Say so; if you can, use a human for the second-reviewer sample.",
      "Never let AI solve CAPTCHAs, use shadow libraries or share logins when fetching PDFs."])),
    sec("6 · Other AI assistants", h("p", { style: "margin:0" },
      ["The skills are plain Markdown files in ", h("code", {}, ".claude/skills/"), ". Any assistant that can read files and run Node.js commands can follow them; the prompt on each card works the same way."])))
  });
}

function openGlossary() {
  const num = {}, list = h("div", {});
  const search = h("input", { type: "text", placeholder: "Search terms…", oninput: () => draw() });
  const draw = () => {
    const q = search.value.toLowerCase();
    list.replaceChildren(...Object.keys(H.terms).sort((a, b) => a.localeCompare(b))
      .filter(t => !q || (t + H.terms[t].definition).toLowerCase().includes(q))
      .map(t => h("div", { class: "term", style: "border-bottom:1px solid var(--border);padding:9px 0" }, h("b", {}, t), H.terms[t].definition, refMarks(H.terms[t].refs, num))));
  };
  draw();
  modal({ title: "Glossary", wide: true, body: h("div", { class: "stack" }, search, list, h("details", {}, h("summary", {}, "References"), refList(num))) });
}

function openTimeline() {
  const am = S.state.amendments;
  modal({
    title: "Timeline", wide: true, body: h("div", {},
      am.length ? h("div", { class: "callout warn", style: "margin-bottom:12px" }, h("b", {}, `${am.length} amendment(s) after locking`), h("ul", {}, am.map(a => h("li", {}, `${a.when} — ${a.what}: ${a.reason}`)))) : null,
      S.events.length ? h("div", { class: "tl" }, S.events.map(e => h("div", { class: "ev" }, h("div", { class: "when" }, `${e.when} · ${(stage(e.stage) || { title: e.stage }).title}`), e.text)))
        : h("div", { class: "empty" }, "Nothing recorded yet.")),
    buttons: [{ label: "Open timeline note in Obsidian", value: () => openNote("00 - Review timeline.md") }, { label: "Close", primary: true, value: null }],
  });
}

function openKeys() {
  const rows = [["?", "help for this page"], ["X", "example for this page"], ["G", "glossary"], ["T", "timeline"], ["[", "hide / show the steps"], ["Alt+↑ / Alt+↓", "previous / next page"],
    ["I / U / E", "include / unsure / exclude (screening)"], ["1–9", "exclusion reason (screening)"], ["← / →", "previous / next record"], ["Esc", "close panel"]];
  modal({ title: "Keyboard shortcuts", body: h("table", { class: "tbl" }, rows.map(([k, d]) => h("tr", {}, h("td", {}, h("kbd", {}, k)), h("td", {}, d)))) });
}


// ---------- Checklist item references: "PRISMA-ScR 3" or "PRISMA 2020 item 16a" → clickable chip, plus the full checklist
function scrChip(n) {
  n = String(n);
  const g = S.review_type.guideline;
  const it = S.checklist_items.find(x => x.n === n) ?? S.checklist_items.find(x => x.n === n + "a");    // "13" → 13a–f
  return h("button", { class: "scr", title: it ? `${g} item ${it.n}: ${it.item} — ${it.desc}` : `${g} item ${n}`,
    onclick: e => { e.preventDefault(); e.stopPropagation(); openChecklist(it?.n ?? n); } }, `${g === "PRISMA-ScR" ? "ScR" : "P2020"} ${n}`);
}

// Turns text such as "Rationale (PRISMA-ScR 3)", "(PRISMA-ScR items 10–11)" or "(PRISMA 2020 item 16a)" into text + clickable
// chips; a reference to the other guideline than the review's own stays plain text
function withScr(text) {
  const m = String(text).match(/^(.*?)\s*\((PRISMA-ScR|PRISMA 2020)(?: items?)?\s*([\da-f,\s–-]+)\)\s*(.*)$/);
  if (!m || m[2] !== S.review_type.guideline) return [text];
  const nums = [];
  m[3].split(/,\s*/).forEach(part => {
    const r = part.trim().split(/[–-]/);
    if (r.length === 2 && /^\d+$/.test(r[0]) && /^\d+$/.test(r[1])) for (let i = +r[0]; i <= +r[1]; i++) nums.push(String(i));
    else nums.push(r[0]);
  });
  return [m[1], " ", ...nums.map(scrChip), m[4] ? " " + m[4] : ""];
}

function openChecklist(focus) {
  const auto = S.checklist_auto, cl = S.state.checklist, rt = S.review_type, items = S.checklist_items;
  const at = n => items.findIndex(it => it.n === n);
  const intro = rt.key === "systematic"
    ? `PRISMA 2020 (${rt.guidelineCitation}): 27 items, 42 with their sub-items, for reporting a systematic review. Report the abstract with the PRISMA 2020 for Abstracts checklist. Tick items on the Report stage.`
    : `PRISMA-ScR (${rt.guidelineCitation}): 20 essential items and 2 optional ones (12 and 16, critical appraisal) for reporting a scoping review. Items 5–13 are written in the protocol; the rest come with the final paper. Tick items on the Report stage.`;
  const body = h("div", {},
    h("p", { class: "muted small", style: "margin-top:0" }, intro),
    rt.checklistParts.map(([part, a, b]) => h("div", {},
      h("h4", { style: "margin:14px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)" }, part),
      items.slice(at(a), at(b) + 1).map(it => {
        const done = cl[String(it.n)]?.done, ev = auto[String(it.n)];
        return h("div", { id: "scr" + it.n, class: "scr-row" + (it.n === focus ? " focus" : "") },
          h("span", { class: "scr-n" }, it.n),
          h("div", {}, h("b", {}, it.item), h("div", { class: "small muted" }, it.desc), ev ? h("div", { style: "margin-top:3px" }, pill(ev, "info")) : null),
          it.optional ? pill("optional", "info") : null, done ? pill("✓ reported", "ok") : null);
      }))));
  modal({ title: `${rt.guideline} checklist`, wide: true, body, buttons: [{ label: "Go to Report", value: () => go("report") }, { label: "Close", primary: true, value: null }] });
  if (focus) setTimeout(() => document.getElementById("scr" + focus)?.scrollIntoView({ block: "center" }), 60);
}

// ================================================================ pages
const PAGES = {};

// The animated demo on the Homepage: a small mock screen that plays through the five steps of a review.
// Plain DOM and CSS (no video file), so it works offline and follows the light/dark theme.
const DEMO = [
  { key: "plan", you: "Write your question (Population, Intervention, Comparator, Outcomes), pick the search terms and set the inclusion rules. Lock the plan before searching.", ai: null, label: "Plan", caption: "Write down your idea, then turn it into questions and search terms.",
    draw: el => { const t = h("div", { class: "demo-type" }); el.append(h("div", { class: "demo-lbl" }, "💡 Idea note"), t);
      const s = "How do researchers measure how repairable a phone is?"; let i = 0;
      return setInterval(() => { t.textContent = s.slice(0, ++i); }, 45); } },
  { key: "search", you: "Run each string in the databases, export the results and drop the files in. Every search is dated and logged.", ai: null, label: "Find", caption: "Run the search strings in the databases and import the exports. Duplicates are removed.",
    // the search string is typed, sent to the databases (arrow), and each returns its hits; duplicates come out
    draw: el => {
      const q = 'TITLE-ABS-KEY(("repairab*" OR "reparab*") AND (smartphone* OR laptop*))';
      const code = h("div", { class: "code demo-query" }), arrow = h("div", { class: "demo-arrow" }, h("i"), "send");
      const dbs = [["Scopus", 268], ["Web of Science", 205]].map(([name, hits]) => ({ hits, n: h("b", {}, "–"), el: null }));
      dbs[0].el = h("div", { class: "demo-db" }, "Scopus", dbs[0].n); dbs[1].el = h("div", { class: "demo-db" }, "Web of Science", dbs[1].n);
      const total = h("div", { class: "demo-total" }, h("b", {}, "412"), " unique records · 61 duplicates removed");
      el.append(h("div", { class: "demo-lbl" }, "🔎 Search string"), code,
        h("div", { class: "demo-send" }, arrow, h("div", { class: "demo-dbs" }, dbs.map(d => d.el))), total);
      let t = 0;
      return setInterval(() => {
        t++;
        if (t <= q.length / 2) code.innerHTML = hlQuery(q.slice(0, t * 2));               // typing, two characters a tick
        else if (t === Math.ceil(q.length / 2) + 2) { code.innerHTML = hlQuery(q); arrow.classList.add("go"); }
        else if (t > Math.ceil(q.length / 2) + 10 && t <= Math.ceil(q.length / 2) + 30) {
          const p = (t - Math.ceil(q.length / 2) - 10) / 20;
          dbs.forEach(d => { d.el.classList.add("on"); d.n.textContent = Math.round(d.hits * p); });
        } else if (t === Math.ceil(q.length / 2) + 33) total.classList.add("on");
      }, 40);
    } },
  { key: "screen", you: "Decide every record. You confirm each suggestion; nothing is decided for you.", ai: "Pre-screen titles, abstracts and full texts, and act as the blind second reviewer (agreement as κ).", label: "Select", caption: "Read each title and abstract: include, unsure or exclude with a reason. Then the full texts.",
    draw: el => { const papers = ["Repairability scoring of smartphones", "Battery chemistry review", "EN 45554 in practice", "Consumer repair behaviour"];
      const rows = papers.map(p => h("div", { class: "demo-row" }, h("span", {}, p), h("span", { class: "demo-dec" })));
      el.append(h("div", { class: "demo-lbl" }, "☑ Title/abstract screening"), ...rows);
      let i = 0; return setInterval(() => { if (i >= rows.length) return; const d = rows[i].lastChild, ex = i === 1;
        d.textContent = ex ? "✕ exclude · E2" : "✓ include"; d.className = "demo-dec " + (ex ? "bad" : "ok"); i++; }, 700); } },
  { key: "chart", you: "Check every charted paper and correct it; your check is recorded.", ai: "Find and attach the PDFs of the included papers, then prefill the charting form from them.", label: "Chart", caption: "Fill a charting form for every included paper (AI can prefill it; you check).",
    draw: el => { const cells = ["Method", "Index", "Products", "Scale"].map(k => [k, h("span", { class: "demo-cell" })]);
      el.append(h("div", { class: "demo-lbl" }, "▦ Data charting"), ...cells.map(([k, c]) => h("div", { class: "demo-row" }, h("span", { class: "muted" }, k), c)));
      const vals = ["Expert scoring", "EN 45554", "Smartphones", "1–10"]; let i = 0;
      return setInterval(() => { if (i < cells.length) cells[i][1].textContent = vals[i++]; }, 650); } },
  { key: "report", you: "Tick the reporting checklist items and export the tables and BibTeX for the paper.", ai: null, label: "Report", caption: "The PRISMA flow diagram and checklist are made from your decisions.",
    draw: el => { const box = (t, n) => h("div", { class: "demo-flow" }, t, h("b", {}, n));
      const bs = [box("Identified", 412), box("Screened", 318), box("Full text", 64), box("Included", 27)];
      bs.forEach(b => b.style.opacity = 0); el.append(h("div", { class: "demo-lbl" }, "📊 PRISMA flow"), h("div", { class: "demo-flows" }, bs));
      let i = 0; return setInterval(() => { if (i < bs.length) bs[i++].style.opacity = 1; }, 500); } },
];

function homeDemo() {
  let i = 0, timer = null, anim = null, playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STEP_MS = 4500, n = DEMO.length, C = 170, R = 100, gap = 0.07;
  const screen = h("div", { class: "demo-screen", "aria-live": "polite" }), caption = h("p", { class: "demo-caption" });
  const side = h("div", { class: "demo-side" });
  const play = btn("", () => { playing = !playing; show(i); }, "sm ghost");
  // the five steps as one circuit: a segment per step that fills as the walk goes round
  const pt = (r, t) => [C + r * Math.sin(t), C - r * Math.cos(t)].map(v => v.toFixed(1));
  const arc = (t0, t1) => { const [x0, y0] = pt(R, t0), [x1, y1] = pt(R, t1); return `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}`; };
  const ring = svg(340, 340, DEMO.map((d, k) => {
    const t0 = 2 * Math.PI * k / n + gap, t1 = 2 * Math.PI * (k + 1) / n - gap, [lx, ly] = pt(R + 34, (t0 + t1) / 2);
    return `<g class="seg" data-k="${k}"><title>${k + 1}. ${d.label}</title>
      <path class="track" d="${arc(t0, t1)}"/><path class="fill" pathLength="1" d="${arc(t0, t1)}"/>
      <text class="lbl" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${d.label}</text></g>`;
  }).join("") + `<text class="mid-n" x="${C}" y="${C - 14}" text-anchor="middle"></text><text class="mid-l" x="${C}" y="${C + 18}" text-anchor="middle"></text>
    <text class="mid-ai" x="${C}" y="${C + 42}" text-anchor="middle"></text>`);
  ring.className = "demo-ring";
  const segs = [...ring.querySelectorAll(".seg")];
  segs.forEach(g => g.addEventListener("click", () => show(+g.dataset.k)));
  function show(k) {
    clearInterval(anim); clearTimeout(timer);
    if (!screen.isConnected && timer !== null) return;          // the page was left: stop
    i = k; screen.replaceChildren(); anim = DEMO[i].draw(screen);
    caption.textContent = DEMO[i].caption;
    // who works in this step: the active card glows (you in green, Claude in the accent colour; both when both)
    side.replaceChildren(
      h("div", { class: "demo-who you active" }, h("b", {}, "👤 You"), h("p", {}, DEMO[i].you)),
      h("div", { class: "demo-who ai" + (DEMO[i].ai ? " active" : "") }, h("b", {}, DEMO[i].ai ? "🤖 Claude can help" : "🤖 Claude"),
        h("p", {}, DEMO[i].ai || "Not used in this step: it is your own work."),
        DEMO[i].ai ? h("p", { class: "demo-note" }, "Only if you switch it on; Claude suggests, you confirm.") : null));
    segs.forEach((g, m) => {
      g.classList.toggle("done", m < i); g.classList.toggle("on", m === i); g.classList.toggle("ai", !!DEMO[m].ai);
      const fill = g.querySelector(".fill");
      fill.style.animation = "none"; fill.getBoundingClientRect();
      fill.style.animation = m === i && playing ? `demo-fill ${STEP_MS}ms linear forwards` : "";
    });
    ring.querySelector(".mid-n").textContent = `${i + 1} of ${n}`;
    ring.querySelector(".mid-l").textContent = DEMO[i].label;
    ring.querySelector(".mid-ai").textContent = DEMO[i].ai ? "🤖 AI can help" : "";
    play.textContent = playing ? "⏸ Pause" : "▶ Play";
    timer = setTimeout(() => playing ? show((i + 1) % n) : null, STEP_MS);
  }
  setTimeout(() => show(0));
  return h("div", { class: "demo" }, h("div", { class: "demo-body" },
    h("div", { class: "demo-ringwrap" }, ring, play), h("div", {}, screen, caption), side));
}

// Homepage: the demo and the tour
PAGES.home = () => h("div", { class: "home" },
  card("See how it works", "A one-minute walk through a review: what you do, and where Claude can help (AI). Click a part of the circle to jump to it.", homeDemo()),
  h("div", { class: "home-tour" },
    h("div", {}, h("h3", {}, "🎓 New here? Take the tour"), h("p", { class: "sub" }, "One minute: what each part of the screen is for.")),
    btn("Start the tour", () => startTour(), "primary tour-big")));

/** Switches the review to type `v` (asks first; after locking it is an amendment with a reason). */
async function switchReviewType(v) {
  if (v === S.review_type.key) return;
  const other = S.review_types.find(t => t.key === v);
  const msg = `Switch to a ${other.label.toLowerCase()} reported to ${other.guideline}? The stages, the question framework and the checklist change; nothing you entered is deleted.`;
  if (S.state.protocol.locked && !S.dev_mode) {
    const why = await promptText("Change the review type", msg + " The protocol is locked, so this is an amendment: give the reason.", "reason for the amendment");
    if (why) api("review_type", { type: v, amendment: why }).then(() => delete D.questions);
  } else if (await confirmBox("Change the review type", msg, "Switch")) api("review_type", { type: v }).then(() => delete D.questions);
}

/** Settings → Review type (and the top-bar button of a scoping review): shows the type and offers the other one. */
async function openReviewType() {
  const rt = S.review_type;
  const v = await modal({ title: "Review type",
    body: h("p", { class: "muted" }, `This review is a ${rt.label.toLowerCase()}, reported to ${rt.guideline} (${rt.guidelineCitation}).`),
    buttons: [{ label: "Close", value: null }, ...S.review_types.filter(t => t.key !== rt.key)
      .map(t => ({ label: `Switch to ${t.label.toLowerCase()} · ${t.guideline}`, primary: true, value: t.key }))] });
  if (v) switchReviewType(v);
}

PAGES.idea = () => {
  const ta = autosize(h("textarea", { placeholder: exampleFor("idea", "Note") || "What do you want to find out, and why? What did you read or discuss? What changed?", rows: 4, value: D.idea || "", oninput: e => D.idea = e.target.value }));
  const ideas = [...S.state.idea].reverse();
  return h("div", {},
    card("New idea note", "Short and dated. It is fine to be vague here — the Question tab makes it precise.", ta,
      h("div", { class: "row end", style: "margin-top:10px" }, h("span", { class: "kbdhint" }, "Ctrl+Enter to add"),
        btn("Add note", e => { if (ta.value.trim()) busy(e.currentTarget, () => api("add_idea", { text: ta.value }).then(() => D.idea = "")); }, "primary"))),
    card("Idea log", `${ideas.length} note(s)`, ideas.length ? h("div", { class: "tl" }, ideas.map(i => h("div", { class: "ev" }, h("div", { class: "when" }, i.when), i.text)))
      : h("div", { class: "empty" }, h("div", { class: "big" }, "💡"), "No notes yet.")));
};

PAGES.questions = () => {
  const q = S.state.questions, rt = S.review_type, Q = rt.question;
  const d = D.questions ??= { population: q.population, concept: q.concept, context: q.context, outcome: q.outcome ?? "", main: q.main, sub: [...q.sub], why: "" };
  const bind = k => e => d[k] = e.target.value;
  const subs = h("div", { class: "stack" });
  const drawSubs = () => subs.replaceChildren(...d.sub.map((s, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
    h("span", { class: "muted", style: "width:22px" }, `${i + 1}.`), h("input", { type: "text", value: s, placeholder: exampleFor("questions", "Sub-questions", i), oninput: e => d.sub[i] = e.target.value }),
    iconBtn("✕", "Remove sub-question", () => { d.sub.splice(i, 1); drawSubs(); }))), btn("+ Add sub-question", () => { d.sub.push(""); drawSubs(); }, "sm"));
  drawSubs();
  const pcc = (k, label, hint, color) => h("div", { class: "card", style: `border-top:3px solid ${color};margin:0` },
    h("h3", {}, label), h("p", { class: "sub" }, hint), autosize(h("textarea", { rows: 2, value: d[k], placeholder: exampleFor("questions", label), oninput: bind(k) })));
  const hints = rt.key === "systematic"
    ? { population: "Who or what is studied, with the conditions that define it", concept: "The intervention or exposure being evaluated", context: "What it is compared with (another intervention, usual care, none)", outcome: "The outcomes measured, with the main outcome first" }
    : { population: "What is studied? (products, systems, people…)", concept: "The core phenomenon, method or intervention", context: "Setting, domain, period, publication types" };
  return h("div", {},
    h("div", { class: Q.outcome ? "grid4" : "grid3", style: "margin-bottom:16px" },
      pcc("population", Q.population, hints.population, "#4f46e5"),
      pcc("concept", Q.concept, hints.concept, "#0891b2"),
      pcc("context", Q.context, hints.context, "#16a34a"),
      Q.outcome ? pcc("outcome", Q.outcome, hints.outcome, "#d97706") : null),
    card("Review questions", null,
      field("Main question", autosize(h("textarea", { rows: 2, value: d.main, placeholder: exampleFor("questions", "Main question"), oninput: bind("main") }))),
      h("div", { style: "margin-top:12px" }, h("span", { class: "small muted", style: "font-weight:600" }, "Sub-questions"), subs),
      h("div", { class: "hr" }),
      h("div", { class: "row", style: "flex-wrap:nowrap" },
        h("input", { type: "text", placeholder: "What changed and why? (kept with this version)", value: d.why, oninput: bind("why") }),
        btn("Save new version", e => busy(e.currentTarget, () => api("save_questions", { q: { ...d, sub: d.sub.filter(s => s.trim()) }, why: d.why }).then(() => delete D.questions)), "primary"))),
    q.history.length ? card("Earlier versions", `${q.history.length} version(s), newest first`,
      [...q.history].reverse().map(v => h("details", { style: "padding:6px 0;border-bottom:1px solid var(--border)" },
        h("summary", {}, h("b", {}, v.when), " — ", v.why || "no reason given"),
        h("div", { class: "small", style: "padding:6px 0 0 14px" }, h("div", {}, "Main: ", v.main || "—"), h("div", { class: "muted" }, `${Q.population}: ${v.population || "—"} · ${Q.concept}: ${v.concept || "—"} · ${Q.context}: ${v.context || "—"}` + (Q.outcome ? ` · ${Q.outcome}: ${v.outcome || "—"}` : "")))))) : null);
};

PAGES.concepts = () => {
  const d = D.concepts ??= JSON.parse(JSON.stringify(S.state.concepts));
  const list = h("div", {}), preview = h("div", { class: "code" }), dirty = h("span", { class: "pill warn", style: "display:none" }, "unsaved changes");
  const tabs = h("div", { class: "tabs" });
  let db = D.previewDb || S.state.queries.databases[0];
  const refresh = debounce(async () => {
    dirty.style.display = JSON.stringify(d) === JSON.stringify(S.state.concepts) ? "none" : "";
    try {
      const r = await api("preview_queries", { concepts: d }, { silent: true, quietError: true });
      D.previews = r.queries; drawPreview();
    } catch (e) { /* ignore */ }
  }, 250);
  const drawPreview = () => {
    tabs.replaceChildren(...S.state.queries.databases.map(x => h("button", { class: x === db ? "on" : "", onclick: () => { db = D.previewDb = x; drawPreview(); } }, x)));
    preview.innerHTML = hlQuery((D.previews || S.queries)[db] || "(add a concept with terms)");
  };
  const draw = () => {
    list.replaceChildren(...d.flatMap((c, i) => [i ? h("div", { class: "joiner" }, c.role === "NOT" ? "AND NOT" : "AND") : [],
      h("div", { class: "concept " + (c.role === "NOT" ? "not" : "and") },
        h("div", { class: "head" },
          h("input", { type: "text", value: c.name, placeholder: "Concept name", oninput: e => { c.name = e.target.value; refresh(); } }),
          segmented([["AND", "AND"], ["NOT", "NOT"]], c.role || "AND", v => { c.role = v; draw(); refresh(); }),
          h("span", { class: "spacer", style: "flex:1" }),
          btn("↑", () => { if (i) { [d[i - 1], d[i]] = [d[i], d[i - 1]]; draw(); refresh(); } }, "ghost icon"),
          btn("↓", () => { if (i < d.length - 1) { [d[i + 1], d[i]] = [d[i], d[i + 1]]; draw(); refresh(); } }, "ghost icon"),
          btn("🗑", () => { d.splice(i, 1); draw(); refresh(); }, "ghost icon danger")),
        chipsInput(c.terms, () => refresh()),
        h("div", { class: "small muted", style: "margin-top:5px" }, `${c.terms.length} term(s) · joined with OR · * = any ending, e.g. repairab* → repairable, repairability`))]));
  };
  draw(); drawPreview(); refresh();
  return h("div", {},
    h("div", { class: "grid2" },
      h("div", {}, card("Keyword blocks", "One block per idea in your question. A paper needs any word from a block (OR) and a match in every block (AND).",
        list, h("div", { class: "row", style: "margin-top:12px" },
          btn("+ Add concept", () => { d.push({ name: "", role: "AND", terms: [] }); draw(); }, ""),
          h("span", { style: "flex:1" }), dirty,
          btn("Save concepts", e => busy(e.currentTarget, () => api("save_concepts", { concepts: d, why: D.cwhy || "" }).then(() => { delete D.concepts; D.cwhy = ""; })), "primary")),
        h("input", { type: "text", placeholder: "What changed and why? (kept with this version)", value: D.cwhy || "", style: "margin-top:8px", oninput: e => D.cwhy = e.target.value })),
        conceptHistory()),
      h("div", {}, card("Live search string", "Updates as you type. The final strings, and hand edits, are on the Search strings tab.", tabs, preview,
        h("div", { class: "row end", style: "margin-top:10px" }, btn("Copy", () => copy(preview.textContent), "sm"))))));
};

function conceptHistory() {
  const hist = [...(S.state.concepts_history || [])].reverse();
  if (!hist.length) return null;
  return card("Earlier versions", `${hist.length} earlier version(s), newest first — the reason for each change is reported with the search strategy`,
    hist.map((v, i) => h("details", { style: "padding:6px 0;border-bottom:1px solid var(--border)" },
      h("summary", {}, h("b", {}, `v${hist.length - i}`), ` · ${v.when} — `, v.why || "no reason given"),
      h("div", { class: "small", style: "padding:6px 0 0 14px" }, v.concepts.map(c => h("div", {}, h("b", {}, c.name), c.role === "NOT" ? " (NOT)" : "", ": ", c.terms.join(" · ")))))));
}

PAGES.queries = () => {
  const dbs = [...S.state.queries.databases];
  let db = D.qdb && dbs.includes(D.qdb) ? D.qdb : dbs[0];
  const box = h("div", {});
  const drawBox = () => {
    const q = S.queries[db] || "", manual = S.manual.includes(db);
    const editing = D.qedit === db;
    const ta = autosize(h("textarea", { class: "code", rows: 5, value: q }));
    box.replaceChildren(
      h("div", { class: "tabs" }, dbs.map(x => h("button", { class: x === db ? "on" : "", onclick: () => { db = D.qdb = x; D.qedit = null; drawBox(); } }, x, S.manual.includes(x) ? " ✎" : ""))),
      h("div", { class: "row", style: "margin-bottom:8px" }, pill(manual ? "edited by hand" : "generated from the concept table", manual ? "warn" : "accent"),
        db === "OpenAlex" ? pill("OpenAlex: no wildcards — stems completed to full words", "info") : null),
      editing ? ta : h("div", { class: "code", html: hlQuery(q || "(no concepts yet)") }),
      h("div", { class: "row end", style: "margin-top:10px" },
        editing ? [btn("Cancel", () => { D.qedit = null; drawBox(); }, "ghost"), btn("Save manual version", e => busy(e.currentTarget, () => api("save_manual_query", { db, text: ta.value }).then(() => D.qedit = null)), "primary")]
          : [manual ? btn("Use generated", () => api("save_manual_query", { db, text: null }), "ghost") : null, btn("✎ Edit by hand", () => { D.qedit = db; drawBox(); }), dbLink(db), btn("⧉ Copy", () => copy(q), "primary")]));
  };
  drawBox();
  const chips = chipsInput(dbs, () => {}, "add a database, press Enter");
  return h("div", {},
    card("Search strings", "Copy each string into the database's advanced search. Syntax differs per database; the tool translates it.", box),
    card("Databases", "Which sources this review searches. At least two bibliographic databases is the usual minimum (see Help).", chips,
      h("div", { class: "row end", style: "margin-top:10px" }, btn("Save databases", e => busy(e.currentTarget, () => api("save_databases", { databases: dbs })), "primary"))));
};

// Advanced-search pages of the databases (opened from the pilot and search-string pages)
const DB_LINKS = {
  "Scopus": "https://www.scopus.com/search/form.uri?display=advanced",
  "Web of Science": "https://www.webofscience.com/wos/woscc/advanced-search",
  "IEEE Xplore": "https://ieeexplore.ieee.org/search/advanced/command",
  "ACM Digital Library": "https://dl.acm.org/search/advanced",
  "PubMed": "https://pubmed.ncbi.nlm.nih.gov/advanced/",
  "OpenAlex": "https://openalex.org/",
};
const dbLink = db => DB_LINKS[db] ? h("a", { class: "btn sm", href: DB_LINKS[db], target: "_blank", rel: "noopener" }, `Open ${db} ↗`) : null;

function testCheckQuery(db, q) {
  const d = S.test_set.dois;
  if (!q || !d.length) return "";
  if (db === "Scopus") return `(${q}) AND (${d.map(x => `DOI(${x})`).join(" OR ")})`;
  if (db === "Web of Science") return `(${q}) AND DO=(${d.join(" OR ")})`;
  return "";
}

function copyBlock(text, label) {
  return h("div", {}, h("div", { class: "code", style: "max-height:150px;overflow:auto", html: hlQuery(text) }),
    h("div", { class: "row end", style: "margin-top:6px" }, btn("⧉ Copy " + label, () => copy(text), "sm primary")));
}

function testSetCard() {
  const sel = D.testsel ??= new Set(S.library.filter(x => x.test).map(x => x.stem));
  const results = h("div", { class: "queue", style: "max-height:220px" });
  const chosen = h("div", { class: "row", style: "gap:6px" });
  const dirty = () => JSON.stringify([...sel].sort()) !== JSON.stringify(S.library.filter(x => x.test).map(x => x.stem).sort());
  const saveBtn = btn("Save test set", null, "primary");
  saveBtn.onclick = e => busy(e.currentTarget, () => api("set_test_set", { stems: [...sel] }).then(() => delete D.testsel));
  const draw = () => {
    chosen.replaceChildren(...[...sel].sort().map(stem => h("span", { class: "chip", style: "font-family:var(--font)" }, stem.slice(0, 60),
      h("button", { title: "Remove", onclick: () => { sel.delete(stem); draw(); } }, "×"))),
      sel.size ? null : h("span", { class: "muted small" }, "No test papers yet — search below and click to add."));
    const q = search.value.toLowerCase().trim();
    results.replaceChildren(...(q ? S.library.filter(x => x.stem.toLowerCase().includes(q)) : []).slice(0, 40).map(x =>
      h("div", { class: "qitem" + (sel.has(x.stem) ? " cur" : ""), onclick: () => { sel.has(x.stem) ? sel.delete(x.stem) : sel.add(x.stem); draw(); } },
        h("span", { class: "dec-dot " + (sel.has(x.stem) ? "include" : "") }), h("span", { class: "t" }, x.stem), x.doi ? null : h("span", { class: "pill warn" }, "no DOI"))));
    saveBtn.style.display = dirty() ? "" : "none";
  };
  const search = h("input", { type: "text", placeholder: "Search your library (author, year, title words)…", oninput: draw });
  draw();
  return h("details", { class: "card", open: !S.test_set.size || dirty() },
    h("summary", { style: "font-weight:700;font-size:15.5px;color:var(--text)" }, `Test set · ${S.test_set.size} paper(s)`,
      h("span", { class: "muted small", style: "font-weight:400" }, " — papers you already know are relevant; a good search finds them")),
    h("div", { style: "margin-top:10px" }, chosen),
    h("div", { style: "margin-top:10px" }, search), results,
    h("div", { class: "row end", style: "margin-top:8px" }, h("span", { class: "small muted" }, "Papers without a DOI can only be checked by hand."), saveBtn));
}

PAGES.pilot = () => {
  const dbs = S.state.queries.databases.filter(x => x !== "OpenAlex");
  let db = D.pdb && dbs.includes(D.pdb) ? D.pdb : dbs[0];
  const note = h("input", { type: "text", placeholder: "What are you testing? e.g. 'v3: added decompos*'", value: D.pnote || "", oninput: e => D.pnote = e.target.value });
  const hits = h("input", { type: "number", placeholder: "e.g. 4090" }), got = h("input", { type: "number", placeholder: "found" });
  const avail = h("input", { type: "number", placeholder: "in database", value: S.test_set.dois.length || "" });
  const guide = h("div", {});
  const drawGuide = () => {
    const q = S.queries[db] || "", t = testCheckQuery(db, q);
    guide.replaceChildren(
      h("div", { class: "row", style: "margin:4px 0 10px" }, h("b", {}, "Step 1"), h("span", { class: "muted" }, `Open ${db}'s advanced search and paste your search string.`), h("span", { style: "flex:1" }), dbLink(db)),
      q ? copyBlock(q, "search string") : h("div", { class: "callout warn" }, "No search string yet — fill in the concept table first."),
      h("div", { class: "row", style: "margin:14px 0 10px" }, h("b", {}, "Step 2"), h("span", { class: "muted" }, t
        ? `Paste the test-set check: the same search, limited to your ${S.test_set.dois.length} test papers' DOIs. The number it shows = test papers found.`
        : `Check by hand which of your ${S.test_set.size} test papers appear in the results.`)),
      t ? copyBlock(t, "test-set check") : h("div", { class: "small muted" }, "Test papers: " + S.test_set.papers.join(" · ")),
      h("div", { class: "row", style: "margin:14px 0 6px" }, h("b", {}, "Step 3"), h("span", { class: "muted" }, "Enter what the database showed and log the pilot.")),
      h("div", { class: "grid3" }, field("Hits (documents found)", hits), field("Test papers found", got), field("Test papers in the database", avail, "lower if a test paper is not indexed there")),
      h("div", { class: "row end", style: "margin-top:10px" }, btn("Log pilot", () => {
        if (!hits.value) return toast("Enter the number of hits.", "err");
        api("pilot_manual", { database: db, hits: hits.value, retrieved: got.value, available: got.value ? avail.value : "", note: note.value }).then(() => D.pnote = "");
      }, "primary")));
  };
  drawGuide();
  const db2 = h("select", {}, dbs.map(x => h("option", {}, x)));
  const pilots = [...S.state.pilots].reverse();
  return h("div", {},
    testSetCard(),
    (() => {
      const method = D.pmethod || "db";
      const panels = {
        db: [h("div", { class: "row", style: "margin-bottom:6px" }, h("span", { class: "small muted" }, "Database"),
              segmented(dbs.map(x => [x, x]), db, v => { db = D.pdb = v; render(); })),
            field("Note for this run", note), h("div", { class: "hr" }), guide],
        file: [h("p", { class: "sub" }, "Run the string in the database, export the results (RIS, BibTeX or CSV) and drop the file here: the tool counts the records and checks the test set itself."),
            field("Note for this run", note), h("div", { class: "grid2", style: "margin-top:10px" }, field("Database", db2),
              dropzone("RIS, BibTeX or CSV", ".ris,.bib,.csv,.txt,.tsv", p => api("pilot_file", { path: p, database: db2.value, note: note.value })))],
        openalex: [h("p", { class: "sub" }, "Free and automatic, but rough: OpenAlex has no wildcards and searches differently, so its counts are only indicative. Good for a first impression, not for the final decision."),
            field("Note for this run", note),
            h("div", { class: "row end", style: "margin-top:10px" }, btn("Run OpenAlex check", e => busy(e.currentTarget, () => api("pilot_openalex", { note: note.value }).then(() => D.pnote = "")), "primary"))],
      };
      return card("How do you want to pilot?", `Pick one method per run — they are alternatives, not steps. Test set = ${S.test_set.size} paper(s) you already know are relevant (test_in).`,
        h("div", { class: "seg", style: "margin-bottom:14px" }, [["db", "In a database (recommended)"], ["file", "From an export file"], ["openalex", "Quick check in OpenAlex"]]
          .map(([k, t]) => h("button", { class: method === k ? "on" : "", onclick: () => { D.pmethod = k; render(); } }, t))),
        panels[method]);
    })(),
    card("Results", "Tune on recall first, then on the number of hits you can screen.", pilotChart(S.state.pilots),
      pilots.length ? h("div", { class: "scroll", style: "margin-top:12px" }, h("table", { class: "tbl" },
        h("tr", {}, ["When", "Source", "Hits", "Test set", "Missed papers"].map(t => h("th", {}, t))),
        pilots.map(p => h("tr", {}, h("td", { class: "small" }, p.when), h("td", {}, p.database, p.note ? h("div", { class: "small muted" }, p.note) : null),
          h("td", { class: "num" }, Number(p.hits).toLocaleString()), h("td", { class: "num" }, p.test_set === "" ? "–" : `${p.retrieved}/${p.test_set}`),
          h("td", { class: "small" }, p.missed.length ? h("details", {}, h("summary", {}, `${p.missed.length} missed`), h("ul", {}, p.missed.map(m => h("li", {}, m)))) : p.test_set === "" ? "" : "none"))))) : null));
};

function authorPill(key) {
  const m = (S.state.protocol_meta || {})[key];
  if (!m) return null;
  if (m.by === "approved") return h("span", { class: "pill info", style: "margin-left:8px", title: `Drafted by Claude, approved by you on ${m.when}` }, "Claude draft · approved by you");
  return m.by === "claude" ? h("span", { class: "pill warn", style: "margin-left:8px", title: `Drafted by Claude on ${m.when}. Read and edit it to make it yours.` }, "Draft by Claude")
    : h("span", { class: "pill ok", style: "margin-left:8px", title: `Last edited by you on ${m.when}` }, "Edited by you");
}

// One step, two tabs: the inclusion and exclusion rules (eligibility criteria and the exclusion reasons used in
// screening), and the other method sections of the protocol. Both are saved in the same protocol.
PAGES.protocol = () => {
  const d = D.protocol ??= { ...S.state.protocol_text };
  const r = D.reasons ??= { ta: [...S.reasons.ta], ft: [...S.reasons.ft] };
  const rules = (PART.protocol ?? "rules") === "rules";
  const reasonList = key => {
    const wrap = h("div", { class: "stack" });
    const draw = () => wrap.replaceChildren(...r[key].map((x, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
      h("input", { type: "text", value: x, oninput: e => r[key][i] = e.target.value }), iconBtn("✕", "Remove", () => { r[key].splice(i, 1); draw(); }))),
      btn("+ Add reason", () => { r[key].push(`E${r[key].length + 1} `); draw(); }, "sm"));
    draw(); return wrap;
  };
  const section = (sct, open) => h("details", { open, style: "border-bottom:1px solid var(--border);padding:8px 0" },
    h("summary", {}, h("b", { style: "color:var(--text)" }, withScr(sct.title)), authorPill(sct.key), d[sct.key] ? h("span", { class: "pill ok", style: "margin-left:8px" }, "written") : h("span", { class: "pill", style: "margin-left:8px" }, "empty")),
    h("div", { style: "margin-top:8px" }, autosize(h("textarea", { rows: rules ? 6 : 3, value: d[sct.key] || "", placeholder: exampleFor("protocol", sct.key) || exampleFor("protocol", sct.title), oninput: e => d[sct.key] = e.target.value })),
      ((S.state.protocol_meta || {})[sct.key] || {}).by === "claude" ? h("div", { class: "row end", style: "margin-top:6px" },
        btn("✓ Approve as is", () => api("approve_section", { key: sct.key }), "sm")) : null));
  const saveRow = (...extra) => h("div", { class: "row end", style: "margin-top:12px" }, ...extra,
    btn("Save", e => busy(e.currentTarget, () => api("save_protocol_text", { text: d }).then(() => delete D.protocol)), rules ? "primary" : ""),
    rules ? null : btn("Save & generate Protocol", e => busy(e.currentTarget, () => api("save_protocol_text", { text: d, generate: true }).then(() => delete D.protocol)), "primary"));
  if (rules) {
    const elig = S.protocol_sections.find(sct => sct.key === "eligibility");
    return h("div", {},
      card("Who is in, who is out", "Describe the papers you want (include) and the ones you don't (exclude), with a short reason for each rule. Your question's parts are a good checklist: who or what, which topic, which setting, which publication types.",
        elig ? section({ ...elig, title: elig.title.replace(/^Eligibility criteria/, "Inclusion and exclusion criteria") }, true) : null, saveRow()),
      card("Exclusion reasons for screening", "The only reasons you can choose when you exclude a paper. Short code first (E1, E2 …), so screeners can type just the code.",
        h("div", { class: "grid2" }, h("div", {}, h("b", {}, "Title and abstract"), reasonList("ta")), h("div", {}, h("b", {}, "Full text"), reasonList("ft"))),
        h("div", { class: "row end", style: "margin-top:12px" }, btn("Save reasons", e => busy(e.currentTarget, () => api("save_reasons", r).then(() => delete D.reasons)), "primary"))));
  }
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:16px" }, "Your question, search strings, test results and inclusion rules are added to the protocol automatically. Write the remaining sections below, then generate the Protocol note."),
    card("Method sections", null, S.protocol_sections.filter(sct => sct.key !== "eligibility").map(sct => section(sct, !d[sct.key])),
      saveRow(btn("Open Protocol in Obsidian", () => openNote("05 - Protocol.md"), "ghost"))));
};

function lockReadiness() {
  const checks = S.lock_checks, open = checks.filter(c => c.required && !c.ok).length;
  const sup = S.state.supervisor_review || {};
  const who = h("input", { type: "text", placeholder: "Supervisor's name", value: sup.by || "" });
  return card(open ? `Ready to lock? ${open} thing(s) still open` : "Ready to lock ✓", "Everything a reviewer will look for before the protocol is frozen.",
    h("div", {}, checks.map(c => h("div", { class: "rule", style: "grid-template-columns:26px 1fr" },
      h("span", { style: `font-size:16px;color:${c.ok ? "var(--ok)" : c.required ? "var(--bad)" : "var(--warn)"}` }, c.ok ? "✓" : c.required ? "✕" : "!"),
      h("div", {}, h("b", {}, c.label), c.required ? null : h("span", { class: "small muted" }, " (recommended)"), h("div", { class: "small muted" }, c.detail))))),
    h("div", { class: "row", style: "margin-top:12px;flex-wrap:nowrap" }, h("span", { class: "small muted", style: "white-space:nowrap" }, "Reviewed by"), who,
      btn(sup.by ? "Update" : "Mark as reviewed", () => api("supervisor_review", { by: who.value }), ""),
      sup.by ? btn("Remove", () => api("supervisor_review", { by: "" }), "ghost") : null));
}

PAGES.registration = () => {
  const p = S.state.protocol;
  const reg = h("input", { type: "text", placeholder: "OSF DOI or URL (optional)" });
  const commit = h("input", { type: "checkbox", checked: true });
  return h("div", {},
    p.locked ? h("div", { class: "card", style: "border-left:4px solid var(--ok)" },
      h("h3", {}, "🔒 Protocol locked on " + p.locked),
      h("p", { class: "sub" }, `Frozen copy: ${p.file}`),
      h("div", { class: "row" }, pill(p.registration ? "Registration: " + p.registration : "No public registration", p.registration ? "ok" : ""),
        pill(p.commit ? "Git commit " + p.commit.slice(0, 10) : "No git commit", p.commit ? "ok" : ""),
        btn("Open frozen protocol", () => openNote(p.file), "sm")))
      : lockReadiness(),
    p.locked ? null : card("Lock the protocol", "Do this before the final database searches. Afterwards, every change to questions, concepts, strings, protocol text, charting fields or exclusion reasons asks for an amendment reason.",
        field("Registration", reg, "Public registration is optional for scoping reviews. PROSPERO does not accept them; OSF Registries does."),
        h("label", { class: "check", style: "margin-top:10px" }, commit, "Commit the frozen protocol to git (local commit — proves the date)"),
        h("div", { class: "row end", style: "margin-top:12px" }, btn("🔒 Lock protocol…", async e => {
          const open = S.lock_checks.filter(c => c.required && !c.ok);
          if (open.length && !(await confirmBox("Not ready yet", `${open.length} required check(s) are still open: ${open.map(c => c.label).join("; ")}. Lock anyway? This is reported in the timeline.`, "Lock anyway", true))) return;
          if (await confirmBox("Lock the protocol?", "This freezes the protocol. It cannot be undone — only amended with a reason.", "Lock protocol"))
            busy(e.target, () => api("lock_protocol", { registration: reg.value, commit: commit.checked }));
        }, "primary"))),
    card("Amendments", "Changes made after locking, with their reasons. They are reported in the manuscript.",
      S.state.amendments.length ? h("div", { class: "tl" }, S.state.amendments.map(a => h("div", { class: "ev" }, h("div", { class: "when" }, `${a.when} · ${a.what}`), a.reason)))
        : h("div", { class: "empty" }, "No amendments.")));
};

// Step 4, Search & import: every record comes from a planned database search. One card per planned database with
// its search string from step 2 (read-only: a different string is planned in step 2), a link to the database, and
// a drop zone for the export. An illustrated strip on top shows the round trip.

/** Where the export button is in each database (the usual route; the importer reads RIS, BibTeX, CSV and WoS text). */
const EXPORT_HINTS = {
  "Scopus": "Select all → Export → CSV (or RIS), with abstracts.",
  "Web of Science": "Export → RIS (other reference software), record content: Full record.",
  "IEEE Xplore": "Select all → Export → Citations → RIS, Citation & Abstract.",
  "ACM Digital Library": "Select all → Export citations → BibTeX.",
  "PubMed": "Send to → Citation manager (.nbib).",
  "OpenAlex": "Export → CSV or RIS.",
};

/** The four pictures of the round trip: string from step 2 → database website → export file → drop here. */
function importStrip() {
  const A = "var(--accent)", M = "var(--faint)", S2 = "var(--surface-2)", SU = "var(--surface)", OK = "var(--ok)";
  const pics = [
    ["Copy the string", "from step 2, Search strategy", `
      <rect x="18" y="10" width="112" height="76" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <rect x="28" y="20" width="40" height="7" rx="3.5" fill="${M}" opacity=".5"/>
      <rect x="25" y="36" width="32" height="12" rx="4" fill="${S2}" stroke="${M}"/><text x="41" y="44.5" font-size="6.5" text-anchor="middle" fill="${M}" font-family="monospace">repair*</text>
      <rect x="60" y="36" width="22" height="12" rx="4" fill="${A}"/><text x="71" y="44.5" font-size="6.5" text-anchor="middle" fill="var(--accent-ink)" font-weight="700" font-family="monospace">AND</text>
      <rect x="85" y="36" width="41" height="12" rx="4" fill="${S2}" stroke="${M}"/><text x="105.5" y="44.5" font-size="6.5" text-anchor="middle" fill="${M}" font-family="monospace">appliance*</text>
      <rect x="28" y="56" width="70" height="5" rx="2.5" fill="${M}" opacity=".35"/><rect x="28" y="66" width="52" height="5" rx="2.5" fill="${M}" opacity=".35"/>
      <rect x="104" y="58" width="16" height="18" rx="3" fill="${SU}" stroke="${A}" stroke-width="1.6"/><rect x="99" y="63" width="16" height="18" rx="3" fill="${SU}" stroke="${A}" stroke-width="1.6"/>`],
    ["Run it in the database", "on its own website", `
      <rect x="10" y="10" width="128" height="78" rx="8" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <line x1="10" y1="24" x2="138" y2="24" stroke="${M}" stroke-width="1.2"/>
      <circle cx="19" cy="17" r="2.5" fill="${M}"/><circle cx="27" cy="17" r="2.5" fill="${M}"/><circle cx="35" cy="17" r="2.5" fill="${M}"/>
      <rect x="20" y="31" width="92" height="13" rx="6.5" fill="${S2}" stroke="${A}" stroke-width="1.4"/>
      <text x="27" y="40.5" font-size="7.5" fill="${A}" font-family="monospace">repair* AND appli…</text>
      <circle cx="122" cy="37.5" r="5" fill="none" stroke="${A}" stroke-width="1.8"/><line x1="125.5" y1="41" x2="129" y2="44.5" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/>
      ${[52, 62, 72].map(y => `<rect x="20" y="${y}" width="6" height="6" rx="1.5" fill="none" stroke="${M}"/><rect x="31" y="${y + 0.5}" width="${y === 62 ? 70 : 88}" height="5" rx="2.5" fill="${M}" opacity=".35"/>`).join("")}`],
    ["Export all results", "as CSV or RIS", `
      <path d="M46 10h40l18 18v58a4 4 0 0 1-4 4H46a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="${SU}" stroke="${M}" stroke-width="1.5"/>
      <path d="M86 10v14a4 4 0 0 0 4 4h14" fill="none" stroke="${M}" stroke-width="1.5"/>
      <rect x="50" y="38" width="32" height="15" rx="4" fill="${A}"/><text x="66" y="49" font-size="9" text-anchor="middle" font-weight="700" fill="var(--accent-ink)">CSV</text>
      <rect x="52" y="60" width="40" height="4.5" rx="2.25" fill="${M}" opacity=".35"/><rect x="52" y="69" width="30" height="4.5" rx="2.25" fill="${M}" opacity=".35"/>
      <line x1="122" y1="34" x2="122" y2="64" stroke="${A}" stroke-width="2.2" stroke-linecap="round"/><path d="M114 57l8 8 8-8" fill="none" stroke="${A}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="112" y1="74" x2="132" y2="74" stroke="${A}" stroke-width="2.2" stroke-linecap="round"/>`],
    ["Drop the file here", "into its database's card", `
      <rect x="14" y="40" width="120" height="48" rx="10" fill="${S2}" stroke="${A}" stroke-width="1.6" stroke-dasharray="5 4"/>
      <path d="M62 6h22l10 10v28a3 3 0 0 1-3 3H62a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" fill="${SU}" stroke="${M}" stroke-width="1.4"/>
      <rect x="64" y="22" width="22" height="10" rx="3" fill="${A}"/><text x="75" y="29.5" font-size="7" text-anchor="middle" font-weight="700" fill="var(--accent-ink)">CSV</text>
      <path d="M74 52v14m-6-6 6 6 6-6" fill="none" stroke="${A}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="116" cy="74" r="8" fill="${OK}"/><path d="M112 74l3 3 5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`],
  ];
  return h("div", { class: "imp-strip", role: "img", "aria-label": "Copy the search string from step 2, run it in the database, export all results as CSV or RIS, drop the file here" },
    pics.flatMap(([t, sub, art], i) => [i ? h("div", { class: "imp-arrow", "aria-hidden": "true" }, "→") : null,
      h("figure", { class: "imp-pic" }, h("div", { html: `<svg viewBox="0 0 148 96" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, system-ui, sans-serif">${art}</svg>` }),
        h("figcaption", {}, h("b", {}, `${i + 1} · ${t}`), h("span", {}, sub)))]));
}

PAGES.searches = () => {
  const dbs = S.state.queries.databases;
  const prog = D.importProgress ??= {};                      // per database: copied, opened, file (this visit)
  const runs = db => S.searches.filter(s => s.kind === "database" && s.database === db);
  const toStep2 = () => goTab(stepOf("queries").tabs.find(t => t.stage === "queries"));
  const dbCard = db => {
    const q = S.queries[db] || "", done = runs(db), p = prog[db] ??= {}, last = done.at(-1);
    let path = null;
    const date = h("input", { type: "date", value: new Date().toISOString().slice(0, 10) });
    const filters = h("input", { type: "text", placeholder: "e.g. 2010–2026; articles and reviews; English" });
    const tracker = h("div", { class: "imp-track" });
    const drawTracker = () => tracker.replaceChildren(...[["copied", "Copied"], ["opened", "Database opened"], ["file", "File chosen"], ["done", "Imported"]]
      .map(([k, label], i) => h("span", { class: "imp-dot " + ((k === "done" ? done.length : p[k]) ? "on" : "") }, h("i", {}, k === "done" ? "✓" : String(i + 1)), label)));
    drawTracker();
    const doImport = async (force = false) => {
      if (!path) return toast("Drop the export file first.", "err");
      try {
        await api("import", { path, database: db, query: q, date: date.value, filters: filters.value, force }, { quietError: true });
        prog[db] = {};
      } catch (e) {
        if (e.message === "NOT_LOCKED") {
          if (await confirmBox("Protocol not locked", "The protocol is not locked and registration was not skipped. Searches are normally run after locking. Import anyway?", "Import anyway")) doImport(true);
        } else if (e.message !== "cancelled") toast(e.message, "err");
      }
    };
    const body = [
      h("div", { class: "imp-row" }, h("span", { class: "imp-n" }, "1"), h("div", { class: "grow" },
        h("div", { class: "small muted" }, "Your search string for ", h("b", {}, db), ", from step 2 (read only):"),
        h("div", { class: "code", style: "margin-top:4px", html: hlQuery(q || "(no string yet)") }),
        h("div", { class: "row", style: "margin-top:6px" },
          btn("⧉ Copy", () => { copy(q); p.copied = true; drawTracker(); }, "sm primary"),
          btn("✎ Change it in step 2", toStep2, "sm ghost", "Search strategy → Search strings: the string is planned there")))),
      h("div", { class: "imp-row" }, h("span", { class: "imp-n" }, "2"), h("div", { class: "grow" },
        h("div", { class: "small muted" }, "Paste it into the database's advanced search, run it, and export ", h("b", {}, "all"), " results."),
        h("div", { class: "row", style: "margin-top:6px" },
          DB_LINKS[db] ? h("a", { class: "btn sm", href: DB_LINKS[db], target: "_blank", rel: "noopener", onclick: () => { p.opened = true; drawTracker(); } }, `Open ${db} ↗`) : null,
          h("span", { class: "small" }, "💾 ", EXPORT_HINTS[db] || "Export all results as CSV, RIS or BibTeX, with abstracts.")))),
      h("div", { class: "imp-row" }, h("span", { class: "imp-n" }, "3"), h("div", { class: "grow" },
        dropzone("Drop the export here (CSV, RIS, BibTeX or Web of Science TXT)", ".ris,.bib,.csv,.txt,.tsv,.nbib", f => { path = f; p.file = true; drawTracker(); }),
        h("div", { class: "grid2", style: "margin-top:8px" }, field("Date you ran it", date), field("Filters you used", filters)),
        h("div", { class: "row end", style: "margin-top:8px" }, btn(done.length ? "Import this export too" : "Import", e => busy(e.currentTarget, () => doImport()), "primary")))),
    ];
    return h("div", { class: "card imp-card" + (done.length ? " done" : "") },
      h("div", { class: "imp-head" }, h("h3", {}, db),
        done.length ? pill(`✓ imported ${last.date} · ${Number(last.records).toLocaleString()} records`, "ok") : pill("not imported yet", ""),
        h("span", { class: "spacer" }), done.length ? null : tracker),
      q ? (done.length ? h("details", {}, h("summary", { class: "small" }, "Import another export from this database (e.g. a re-run before submission)"), body) : body)
        : h("div", { class: "callout warn" }, "No search string for this database yet. ", h("a", { href: "#", onclick: e => { e.preventDefault(); toStep2(); } }, "Build it in step 2, Search strategy"), "."));
  };
  const imported = dbs.filter(db => runs(db).length).length;
  return h("div", {},
    card("How it works", `Every record comes from a search you planned in step 2. Do this once for each database (${imported} of ${dbs.length} done).`, importStrip()),
    dbs.length ? dbs.map(dbCard) : h("div", { class: "callout warn" }, "No databases planned yet. Choose them in step 2, Search strategy → Search strings."),
    h("p", { class: "small muted" }, "Papers found through the references of included studies are added later, in the step Citation search."),
    card("Searches", `${S.searches.length} run(s) logged — this is the table reported under ${S.review_type.refs.sources}.`,
      S.searches.length ? h("div", { class: "scroll" }, h("table", { class: "tbl" },
        h("tr", {}, ["ID", "Source", "Date", "08 - Records", "New", "Dupl.", "Query"].map(t => h("th", {}, t))),
        S.searches.map(s => h("tr", {}, h("td", {}, s.id), h("td", {}, s.database, " ", pill(s.kind, s.kind === "database" ? "accent" : "")), h("td", { class: "small" }, s.date),
          h("td", { class: "num" }, s.records), h("td", { class: "num" }, s.new), h("td", { class: "num" }, s.duplicates), h("td", { class: "small", style: "font-family:var(--mono);max-width:360px;word-break:break-word" }, s.query)))))
        : h("div", { class: "empty" }, h("div", { class: "big" }, "🔎"), "No searches imported yet.")));
};

// ---------- screening
const SC = { stage: store.get("sc_stage", "ta"), filter: "todo", id: null, cache: {}, excl: false };

// AI suggestions per screening stage: ai_decision / ai_reason / ai_why (title/abstract), ai_ft_* (full text)
const aiKey = (k, stage = SC.stage) => (stage === "ta" ? "ai_" : "ai_ft_") + k;
const ftOpen = r => ["include", "unsure"].includes(r.ta_decision) && ["", "pending"].includes(r.ft_decision);
const suggested = (stage = SC.stage) => S.records.filter(r => r[aiKey("decision", stage)] && (stage === "ta" ? r.ta_decision === "pending" : ftOpen(r)));

function queue() {
  const recs = S.records;
  if (SC.filter === "pilot") return recs.filter(r => (r.notes || "").includes("[pilot]"));
  if (SC.filter === "presort") return recs.filter(r => r.presort && r.ta_decision === "pending");
  if (SC.filter === "suggest") return suggested();
  if (SC.stage === "ta") return SC.filter === "todo" ? recs.filter(r => r.ta_decision === "pending" && !r.presort) : recs;
  const ft = recs.filter(r => ["include", "unsure"].includes(r.ta_decision));
  return SC.filter === "todo" ? ft.filter(r => ["", "pending"].includes(r.ft_decision) && r.pdf_status !== "not-retrieved") : ft;
}

async function decide(decision, reason = "") {
  const q = queue(), i = q.findIndex(r => r.record_id === SC.id);
  if (i < 0) return;
  const next = q[i + 1] || q[i - 1];
  await api("decide", { record_id: SC.id, stage: SC.stage, decision, reason }, { silent: true });
  SC.excl = false;
  if (SC.filter === "todo") SC.id = next ? next.record_id : null;
  render();
}

/** "History" under a record: every logged change of its decisions (08 - Decision log.csv), loaded when opened. */
function decisionHistory(id) {
  const body = h("div", { class: "small muted" }, "Loading…");
  return h("details", { class: "small", style: "margin-top:10px", ontoggle: async e => {
    if (!e.target.open) return;
    const { rows } = await api("record_history", { record_id: id }, { silent: true });
    body.replaceChildren(rows.length ? h("table", { class: "tbl" }, h("tr", {}, ["When", "Stage", "Change", "Reason", "By", "How"].map(t => h("th", {}, t))),
      rows.map(r => h("tr", {}, h("td", {}, r.when), h("td", {}, r.stage), h("td", {}, `${r.from} → ${r.to}`), h("td", {}, r.reason), h("td", {}, r.by || "—"), h("td", {}, r.how))))
      : h("span", { class: "muted" }, "No decisions logged yet."));
  } }, h("summary", { class: "muted" }, "History of this record's decisions"), body);
}

PAGES.screening = () => {
  const q = queue();
  if (!q.find(r => r.record_id === SC.id)) SC.id = q[0]?.record_id || null;
  const rec = S.records.find(r => r.record_id === SC.id);
  const done = SC.stage === "ta" ? S.flow.unique - S.flow.ta_pending : S.flow.assessed;
  const total = SC.stage === "ta" ? S.flow.unique : S.flow.sought;
  const reasons = S.reasons[SC.stage];
  const dkey = SC.stage === "ta" ? "ta_decision" : "ft_decision", rkey = SC.stage === "ta" ? "ta_reason" : "ft_reason";

  const head = h("div", { class: "row", style: "margin-bottom:14px" },
    segmented([["ta", "Title / abstract"], ["ft", "Full text"]], SC.stage, v => { SC.stage = v; store.set("sc_stage", v); SC.id = null; if (SC.filter === "suggest" && !suggested(v).length) SC.filter = "todo"; render(); }),
    segmented([["todo", "To do"], ["all", "All"], ...(S.records.some(r => (r.notes || "").includes("[pilot]")) ? [["pilot", "Pilot"]] : []),
      ...(suggested().length ? [["suggest", `Suggested (${suggested().length})`]] : []),
      ...(SC.stage === "ta" && S.records.some(r => r.presort && r.ta_decision === "pending") ? [["presort", `Pre-sorted (${S.records.filter(r => r.presort && r.ta_decision === "pending").length})`]] : [])],
      SC.filter, v => { SC.filter = v; render(); }),
    h("div", { style: "flex:1;min-width:160px" }, bar(total ? done / total : 0), h("div", { class: "small muted" }, `${done} of ${total} decided`)),
    btn("Check decisions", e => busy(e.currentTarget, () => api("check")), ""),
    btn("Open Screening.base", () => openNote("08 - Screening.base"), "ghost"));

  let main;
  if (SC.filter === "suggest") {
    main = suggestView(q);
  } else if (SC.filter === "presort") {
    main = presortView(q);
  } else if (!rec) {
    main = h("div", { class: "card empty" }, h("div", { class: "big" }, total ? "🎉" : "📭"),
      h("h3", {}, total ? "Nothing left to screen here" : "No records yet"),
      h("p", {}, total ? "Switch to 'All' to review earlier decisions, or continue with the next step." : "Import a database export first (step Search & import)."));
  } else {
    const absBox = h("div", { class: "abstract" }, h("span", { class: "muted" }, "Loading abstract…"));
    const showAbs = r => absBox.innerHTML = r.abstract ? highlight(r.abstract) : `<span class="muted">No abstract in the export. Open the DOI to read it.</span>`;
    if (SC.cache[rec.record_id]) showAbs(SC.cache[rec.record_id]);
    else api("record_abstract", { record_id: rec.record_id }, { silent: true }).then(j => { SC.cache[rec.record_id] = j.record; if (SC.id === rec.record_id) showAbs(j.record); });
    const cur = rec[dkey];
    const reasonRow = h("div", { class: "reasons", style: SC.excl || cur === "exclude" ? "" : "display:none" },
      h("span", { class: "small muted", style: "align-self:center" }, "Reason:"),
      reasons.map((r, i) => h("button", { class: rec[rkey] && r.split(" ")[0] === rec[rkey].split(" ")[0] ? "on" : "", onclick: () => decide("exclude", r.split(" ")[0]) }, h("kbd", {}, i + 1), " ", r)));
    const notes = h("input", { type: "text", placeholder: "Note (optional) — e.g. 'other version of R0012'", value: rec.notes || "",
      onchange: e => api("set_record", { record_id: rec.record_id, fields: { notes: e.target.value } }, { render: false, silent: true }) });
    main = h("div", { class: "card rec" },
      h("div", { class: "meta" }, h("b", { style: "font-family:var(--mono)" }, rec.record_id), rec.year ? pill(rec.year) : null, rec.journal ? h("span", {}, rec.journal) : null,
        rec.language && !/^english$/i.test(rec.language) ? pill("language: " + rec.language, "bad") : null,
        rec.publication ? pill("in your library", "accent") : null,
        cur && cur !== "pending" ? pill("decided: " + cur + (rec[rkey] ? " · " + rec[rkey] : ""), decKind(cur)) : null,
        rec.sample_ta && SC.stage === "ta" ? pill("in 2nd-reviewer sample", "info") : null),
      h("h2", {}, rec.title),
      h("button", { class: "file", style: "margin:-2px 0 6px", title: "This paper's note — your decision is written here", onclick: () => openNote(S.record_files[rec.record_id]) },
        "📝 ", S.record_files[rec.record_id] || "", h("span", { class: "muted" }, ` · ${dkey} is saved here`)),
      h("div", { class: "authors" }, rec.authors),
      h("div", { class: "row", style: "margin-top:8px" },
        rec.doi ? h("a", { href: "https://doi.org/" + rec.doi, target: "_blank", class: "btn sm" }, "DOI ↗") : null,
        rec.oa_url ? h("a", { href: rec.oa_url, target: "_blank", class: "btn sm" }, "Open access ↗") : null,
        SC.stage === "ft" ? pill(rec.pdf_status ? "PDF: " + rec.pdf_status : "PDF: not checked", rec.pdf_status === "found" ? "ok" : rec.pdf_status ? "bad" : "") : null),
      absBox,
      h("div", { class: "decide" },
        h("button", { class: "inc" + (cur === "include" ? " on" : ""), onclick: () => decide("include") }, "✓ Include", h("kbd", {}, "I")),
        SC.stage === "ta" ? h("button", { class: "uns" + (cur === "unsure" ? " on" : ""), onclick: () => decide("unsure") }, "? Unsure", h("kbd", {}, "U"))
          : h("button", { class: "uns", onclick: () => api("mark_pdf", { record_id: rec.record_id, status: "not-retrieved" }) }, "⊘ Not retrieved"),
        h("button", { class: "exc" + (cur === "exclude" ? " on" : ""), onclick: () => { SC.excl = true; reasonRow.style.display = ""; } }, "✕ Exclude", h("kbd", {}, "E"))),
      reasonRow,
      h("div", { style: "margin-top:12px" }, notes),
      decisionHistory(rec.record_id),
      h("div", { class: "row", style: "margin-top:12px;justify-content:space-between" },
        btn("← Previous", () => move(-1), "ghost"), h("span", { class: "kbdhint" }, "I include · U unsure · E exclude · 1–9 reason · ←/→ move"), btn("Next →", () => move(1), "ghost")));
  }

  // the queue lists at most 400 records: those around the current one, so it is always in view
  const at = Math.max(0, q.findIndex(r => r.record_id === SC.id)), from = Math.max(0, Math.min(at - 100, q.length - 400));
  const shown = q.slice(from, from + 400);
  const side = h("div", {},
    h("div", { class: "card", style: "padding:12px" }, h("h3", { style: "padding:4px 6px" }, `Queue (${q.length})`,
      q.length > shown.length ? h("span", { class: "small muted" }, ` · showing ${from + 1}–${from + shown.length}`) : null),
      h("div", { class: "queue" }, shown.map(r => h("div", { class: "qitem" + (r.record_id === SC.id ? " cur" : ""), onclick: () => { SC.id = r.record_id; SC.excl = false; render(); } },
        h("span", { class: "dec-dot " + r[dkey] }), h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title))))),
    S.problems.length ? h("div", { class: "card", style: "padding:12px;border-left:4px solid var(--bad)" }, h("h3", {}, `${S.problems.length} problem(s)`),
      S.problems.slice(0, 30).map(p => h("div", { class: "small", style: "padding:3px 0;cursor:pointer", onclick: () => { SC.id = p.record_id; SC.filter = "all"; render(); } }, h("b", {}, p.record_id), " ", p.text))) : null);
  setTimeout(() => {                                    // keep the current record in view inside the queue list
    const list = document.querySelector(".queue"), cur = list?.querySelector(".qitem.cur");
    if (!cur) return;
    const box = list.getBoundingClientRect(), r = cur.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) list.scrollTop += r.top - box.top - box.height / 2;
  });
  return h("div", {}, head, h("div", { class: "screen" }, main, side));
};

function suggestView(q) {
  const batch = q.slice(0, 50);
  if (!batch.length) return h("div", { class: "card empty" }, h("div", { class: "big" }, "🎉"), h("h3", {}, "All suggestions reviewed"));
  const choice = D.sugg ??= {};
  const dec = r => r[aiKey("decision")], why = r => r[aiKey("why")], rsn = r => r[aiKey("reason")] || "";                       // record id -> "include" | "unsure" | "exclude:E1" …
  const opts = [["include", "Include"], ["unsure", "Unsure"], ...S.reasons[SC.stage].map(r => ["exclude:" + r.split(" ")[0], "Exclude " + r])];
  const val = r => choice[r.record_id] ?? (dec(r) === "exclude" ? "exclude:" + rsn(r) : dec(r));
  const order = { include: 0, unsure: 1, exclude: 2 };
  const rows = [...batch].sort((a, b) => order[dec(a)] - order[dec(b)] || rsn(a).localeCompare(rsn(b)));
  const counts = Counter => rows.reduce((m, r) => (m[val(r).split(":")[0]] = (m[val(r).split(":")[0]] || 0) + 1, m), {});
  const c = counts();
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:12px" }, `Batch of ${batch.length} of ${q.length} remaining. Claude read each ${SC.stage === "ta" ? "abstract" : "full text"} and suggests a decision (cautious: unsure when in doubt). Check the suggestions — click a title to see the abstract — change any you disagree with, then confirm the batch. The decisions are recorded as yours; changes to suggestions are noted per record.`),
    h("div", { class: "row", style: "margin-bottom:10px" }, pill(`${c.include || 0} include`, "ok"), pill(`${c.unsure || 0} unsure`, "warn"), pill(`${c.exclude || 0} exclude`, "bad"),
      h("span", { style: "flex:1" }),
      btn(`✓ Confirm these ${batch.length} decisions`, async e => {
        if (!(await confirmBox("Confirm batch", `Save ${batch.length} decisions as yours?`, "Save"))) return;
        const items = batch.map(r => { const [d, reason] = val(r).split(":"); return { id: r.record_id, decision: d, reason: reason || "" }; });
        busy(e.target, () => api("apply_decisions", { items, stage: SC.stage }).then(() => { for (const r of batch) delete choice[r.record_id]; }));
      }, "primary")),
    h("table", { class: "tbl" }, h("tr", {}, ["", "Record", "Claude suggests", "Your decision"].map(t => h("th", {}, t))),
      rows.map(r => {
        const changed = choice[r.record_id] !== undefined && choice[r.record_id] !== (dec(r) === "exclude" ? "exclude:" + rsn(r) : dec(r));
        const sel = h("select", { onchange: e => { choice[r.record_id] = e.target.value; render(); } }, opts.map(([v, t]) => h("option", { value: v, selected: v === val(r) }, t)));
        const abs = h("div", { class: "small muted", style: "display:none;margin-top:6px;max-width:640px" });
        return h("tr", {},
          h("td", {}, h("span", { class: "dec-dot " + val(r).split(":")[0] })),
          h("td", { style: "max-width:560px" }, h("a", { href: "#", onclick: async e => {
            e.preventDefault();
            if (abs.style.display === "none") { if (!abs.textContent) { const j = await api("record_abstract", { record_id: r.record_id }, { silent: true }); abs.innerHTML = highlight(j.record.abstract || "No abstract."); } abs.style.display = ""; }
            else abs.style.display = "none";
          } }, h("b", { style: "font-family:var(--mono);font-size:12px" }, r.record_id), " ", r.title), h("div", { class: "small muted" }, [r.year, r.journal].filter(Boolean).join(" · ")), abs),
          h("td", { style: "max-width:260px" }, pill(dec(r) + (rsn(r) ? " " + rsn(r) : ""), decKind(dec(r))), h("div", { class: "small muted" }, why(r))),
          h("td", {}, sel, changed ? h("div", { class: "small", style: "color:var(--warn)" }, "changed by you") : null));
      })));
}

function presortView(q) {
  const keep = D.presortOff ??= new Set();          // record ids the reviewer unticked
  const groups = {};
  q.forEach(r => (groups[r.presort] ??= []).push(r));
  const body = h("div", {});
  const draw = () => body.replaceChildren(...Object.entries(groups).sort().map(([code, rs]) => h("details", { class: "card", open: true, style: "padding:12px 16px" },
    h("summary", { style: "font-weight:700;color:var(--text)" }, `${code} · ${rs[0].presort_reason} — ${rs.length} record(s), ${rs.filter(r => !keep.has(r.record_id)).length} ticked`),
    h("div", { class: "queue", style: "max-height:420px;margin-top:8px" }, rs.map(r => h("label", { class: "qitem", style: "cursor:pointer" },
      h("input", { type: "checkbox", checked: !keep.has(r.record_id), onchange: e => { e.target.checked ? keep.delete(r.record_id) : keep.add(r.record_id); draw(); } }),
      h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title)))))));
  draw();
  const ticked = () => q.filter(r => !keep.has(r.record_id)).map(r => r.record_id);
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:12px" }, "These records were pre-sorted by fixed rules (non-English language; proceedings volumes; network-science or software topics without any product or design term). Glance through the titles and untick anything that might be relevant — unticked records go back to the normal queue. Confirming records the decision as yours."),
    h("div", { class: "row", style: "margin-bottom:12px" },
      btn("✓ Confirm ticked as excluded", async e => {
        if (await confirmBox("Confirm exclusions", `Exclude ${ticked().length} record(s) with their pre-sort reason, as your decision?`, "Exclude"))
          busy(e.target, async () => { const off = [...keep]; await api("bulk_decide", { ids: ticked() }); if (off.length) await api("clear_presort", { ids: off }); keep.clear(); });
      }, "primary"),
      keep.size ? btn(`Return ${keep.size} unticked to the queue`, () => api("clear_presort", { ids: [...keep] }).then(() => keep.clear()), "") : null),
    body);
}

function move(d) {
  const q = queue(), i = q.findIndex(r => r.record_id === SC.id);
  const n = q[i + d];
  if (n) { SC.id = n.record_id; SC.excl = false; render(); }
}

PAGES.reviewer = () => {
  const stage = h("select", {}, h("option", { value: "ta" }, "Title / abstract"), h("option", { value: "ft" }, "Full text"));
  const frac = h("input", { type: "number", step: "0.05", min: "0.05", max: "1", value: "0.2" });
  const seed = h("input", { type: "text", placeholder: "empty = random (logged)" });
  const g = st => {
    const a = S.agreement[st];
    return h("div", { class: "card", style: "margin:0;text-align:center" }, h("h3", {}, st === "ta" ? "Title / abstract" : "Full text"), gauge(a.kappa),
      h("div", { class: "small muted" }, `${a.sampled} sampled · ${a.decided} decided by both · agreement ${pct(a.agreement)}`),
      a.kappa != null ? h("div", { style: "margin-top:6px" }, a.kappa >= 0.6 ? pill("meets the usual 0.6 convention", "ok") : pill("below 0.6 — discuss and clarify criteria", "bad")) : null);
  };
  const dis = [...S.agreement.ta.disagreements.map(d => ({ ...d, st: "ta" })), ...S.agreement.ft.disagreements.map(d => ({ ...d, st: "ft" }))];
  return h("div", {},
    h("div", { class: "grid2" },
      card("1 · Draw the sample", "A random sample with a recorded seed. The sheet contains none of your decisions.",
        h("div", { class: "grid3" }, field("Stage", stage), field("Fraction", frac), field("Seed", seed)),
        h("div", { class: "row end", style: "margin-top:12px" }, btn("Draw sample & write sheet", async e => {
          const exists = S.records.some(r => r["sample_" + stage.value]);
          if (exists && !(await confirmBox("Sample exists", "A sample for this screening round already exists. Draw a new one? The old draw stays in the log.", "Draw new sample"))) return;
          busy(e.target, () => api("sample", { stage: stage.value, fraction: frac.value, seed: seed.value, redo: exists }));
        }, "primary")),
        S.sheets.length ? h("div", { style: "margin-top:12px" }, h("b", { class: "small" }, "Sheets — send to your second reviewer:"),
          S.sheets.map(s => h("div", {}, h("a", { href: "#", onclick: e => { e.preventDefault(); download("09 - Second reviewer/" + s); } }, "⬇ " + s)))) : null),
      card("2 · Import the returned sheet", "The reviewer fills 'decision' (include / exclude / unsure) and 'reason'.",
        field("Stage of the sheet", (() => { const s2 = stage.cloneNode(true); D.r2stage = s2; return s2; })()),
        h("div", { style: "margin-top:10px" }, dropzone("The CSV sheet as returned", ".csv", p => api("import_r2", { path: p, stage: D.r2stage.value }))))),
    h("div", { class: "grid2", style: "margin-top:16px" }, g("ta"), g("ft")),
    card("Disagreements", "Resolve each by discussion; change your decision if needed and note the outcome.",
      dis.length ? h("table", { class: "tbl" }, h("tr", {}, ["Record", "You", "Second reviewer", ""].map(t => h("th", {}, t))),
        dis.map(d => h("tr", {}, h("td", {}, h("b", {}, d.record_id), " ", h("span", { class: "small" }, d.title)), h("td", {}, pill(d.mine, decKind(d.mine))),
          h("td", {}, pill(d.theirs, decKind(d.theirs)), d.reason ? h("span", { class: "small muted" }, " " + d.reason) : null),
          h("td", {}, btn("Open", () => { SC.stage = d.st; SC.filter = "all"; SC.id = d.record_id; go("screening"); }, "sm")))))
        : h("div", { class: "empty" }, "No disagreements (yet).")));
};

PAGES.snowballing = () => {
  const seeds = h("select", {}, h("option", { value: "included" }, "Included (full text)"), h("option", { value: "ta" }, "Include/unsure at title-abstract"));
  const back = h("input", { type: "checkbox", checked: true }), fwd = h("input", { type: "checkbox", checked: true });
  const per = h("input", { type: "number", value: "200", min: "5" });
  const rounds = S.rounds;
  const lastZero = rounds.length && rounds[rounds.length - 1].included === 0 && rounds[rounds.length - 1].added > 0;
  const max = Math.max(1, ...rounds.map(r => r.added));
  return h("div", {},
    card("Run a round", "References (backward) and citing papers (forward) of the seeds are fetched from OpenAlex and imported for screening.",
      h("div", { class: "grid3" }, field("Seeds", seeds), h("div", {}, h("span", { class: "small muted", style: "font-weight:600" }, "Directions"),
        h("div", { class: "stack", style: "margin-top:6px" }, h("label", { class: "check" }, back, "Backward (references)"), h("label", { class: "check" }, fwd, "Forward (citations)"))),
        field("Max per seed and direction", per, "Large rounds use more of the free OpenAlex daily budget.")),
      h("div", { class: "row end", style: "margin-top:12px" }, btn("Run next round", e => {
        const dirs = [back.checked && "backward", fwd.checked && "forward"].filter(Boolean);
        if (dirs.length) busy(e.currentTarget, () => api("snowball", { directions: dirs, seeds: seeds.value, per_seed: per.value }));
      }, "primary"))),
    lastZero ? h("div", { class: "callout ok", style: "margin-bottom:16px" }, "The last round has been screened and added no included study — the usual stopping rule is met. You can mark this step done.") : null,
    card("Rounds", "Stop when a round adds no new included study.",
      rounds.length ? h("table", { class: "tbl" }, h("tr", {}, ["Round", "Records added", "", "Included so far"].map(t => h("th", {}, t))),
        rounds.map(r => h("tr", {}, h("td", {}, h("b", {}, "#" + r.round)), h("td", { class: "num" }, r.added),
          h("td", { style: "width:45%" }, bar(r.added / max)), h("td", { class: "num" }, r.included))))
        : h("div", { class: "empty" }, h("div", { class: "big" }, "❄️"), "No rounds yet.")));
};

// PDFs already on this PC: scan a folder, show the matches, copy the ticked ones into the review
async function scanPdfs(folder) {
  const j = await api("scan_pdfs", folder ? { folder } : {}, { render: false });
  D.scan = j.scan;
  D.scanPick = new Set(j.scan.matches.filter(m => m.how !== "likely").map(m => m.record_id));
  render();
}

function scanResults() {
  const sc = D.scan, pick = D.scanPick;
  const how = { doi: ["DOI matches", "ok"], title: ["title + first author", "ok"], likely: ["likely — check", "warn"] };
  if (!sc.matches.length) return h("div", { class: "callout", style: "margin-bottom:12px" },
    `No matches in ${sc.folder} (${sc.pdfs} PDFs read, ${sc.records} records without a full text). `, btn("Close", () => { D.scan = null; render(); }, "sm ghost"));
  return h("div", { class: "card", style: "padding:12px 16px;margin-bottom:14px;border-left:4px solid var(--accent);border-radius:0 12px 12px 0" },
    h("div", { class: "row", style: "margin-bottom:8px" },
      h("b", {}, `${sc.matches.length} match(es) in ${sc.folder.split(/[\\/]/).pop()}`),
      h("span", { class: "small muted" }, `${sc.pdfs} PDFs read. Ticked matches are copied (not moved) into 10 - Full texts under the record's name. Untick anything that is not the same paper.`),
      h("span", { class: "spacer", style: "flex:1" }),
      btn(`Copy ${pick.size} ticked PDF(s)`, e => busy(e.currentTarget, async () => {
        const items = sc.matches.filter(m => pick.has(m.record_id)).map(m => ({ record_id: m.record_id, pdf: m.pdf }));
        await api("attach_found", { items, folder: sc.folder }); D.scan = null; render();
      }), "primary"),
      btn("Close", () => { D.scan = null; render(); }, "ghost")),
    h("div", { class: "scroll", style: "max-height:360px;overflow:auto" }, h("table", { class: "tbl", style: "width:100%" },
      h("tr", {}, ["", "Record", "Match", "PDF found"].map(t => h("th", {}, t))),
      sc.matches.map(m => h("tr", {},
        h("td", {}, h("input", { type: "checkbox", checked: pick.has(m.record_id), "aria-label": `Copy the PDF for ${m.record_id}`,
          onchange: e => { e.target.checked ? pick.add(m.record_id) : pick.delete(m.record_id); render(); } })),
        h("td", {}, h("b", { style: "font-family:var(--mono)" }, m.record_id), " ", m.title, m.year ? h("span", { class: "muted" }, " · " + m.year) : null),
        h("td", {}, pill(how[m.how][0], how[m.how][1])),
        h("td", { class: "small", title: m.pdf }, m.name))))));
}

PAGES.retrieval = () => {
  const all = S.records.filter(r => ["include", "unsure"].includes(r.ta_decision));
  const st = r => r.pdf_status === "found" ? "found" : r.pdf_status === "not-retrieved" ? "not" : "find";
  const f = D.rfilter ??= "find";
  const inc = D.rinc ?? true;                       // included sources first: they are the ones to read
  const pool = all.filter(r => !inc || r.ft_decision === "include");
  const n = k => pool.filter(r => st(r) === k).length;
  const recs = pool.filter(r => f === "all" || st(r) === f);
  const stat = r => ({ found: pill("found", "ok"), not: pill("not retrieved", "bad"), find: pill("to find", "warn") })[st(r)];
  const actions = r => {
    const file = h("input", { type: "file", accept: ".pdf", style: "display:none", onchange: async () => { const p = await upload(file.files[0]); api("attach_pdf", { record_id: r.record_id, path: p }); } });
    const box = h("div", { style: "display:flex;flex-direction:column;gap:4px;align-items:stretch;min-width:120px" }, file);
    if (st(r) === "found") box.append(btn("📄 Open PDF", () => api("open_note", { note: `10 - Full texts/${r.file}.pdf` }, { silent: true }), "sm"),
      btn("Replace", () => file.click(), "sm ghost"));
    else if (st(r) === "not") box.append(btn("Undo", () => api("mark_pdf", { record_id: r.record_id, status: "" }), "sm ghost"));
    else box.append(btn("Attach PDF", () => file.click(), "sm"), btn("Not retrieved", () => api("mark_pdf", { record_id: r.record_id, status: "not-retrieved" }), "sm ghost"));
    return box;
  };
  return h("div", {},
    card("10 - Full texts", `${n("found")} found · ${n("not")} not retrieved · ${n("find")} to find`,
      h("div", { class: "row", style: "margin-bottom:12px" },
        btn("📁 Find PDFs in a folder…", e => busy(e.currentTarget, () => scanPdfs()), "primary"),
        S.pdf_folders.slice(0, 3).map(f => btn("↻ " + f.split(/[\\/]/).pop(), e => busy(e.currentTarget, () => scanPdfs(f)), "sm ghost")),
        btn("🔓 Find open-access links", e => busy(e.currentTarget, () => api("find_oa")), ""),
        h("span", { class: "small muted" }, "First the PDFs you already have, then open access, then your university access via the DOI. A missing PDF is not an exclusion.")),
      D.scan ? scanResults() : null,
      h("div", { class: "row", style: "margin-bottom:10px" },
        segmented([["find", `To find (${n("find")})`], ["found", `Found (${n("found")})`], ["not", `Not retrieved (${n("not")})`], ["all", "All"]], f, v => { D.rfilter = v; render(); }),
        h("label", { class: "small", style: "display:flex;gap:6px;align-items:center" },
          h("input", { type: "checkbox", checked: inc, onchange: e => { D.rinc = e.target.checked; render(); } }), "Included sources only")),
      recs.length ? h("div", { class: "scroll", style: "max-height:600px;overflow-x:auto" }, h("table", { class: "tbl", style: "width:100%" },
        h("tr", {}, ["Record", "Status", "Links", "Actions"].map(t => h("th", {}, t))),
        recs.map(r => h("tr", {},
          h("td", {}, h("b", { style: "font-family:var(--mono)" }, r.record_id), " ", r.title, h("div", { class: "small muted" }, r.authors.split(";")[0], r.year ? " · " + r.year : "")),
          h("td", {}, stat(r)),
          h("td", { style: "white-space:nowrap" }, r.doi ? h("a", { href: "https://doi.org/" + r.doi, target: "_blank" }, "DOI ↗") : null, r.oa_url ? [" · ", h("a", { href: r.oa_url, target: "_blank" }, "OA ↗")] : null),
          h("td", { style: "width:1%" }, actions(r)))))) : h("div", { class: "empty" }, all.length ? "Nothing in this view." : "No records have passed title/abstract screening yet.")));
};

PAGES.charting = () => {
  const fields = D.fields ??= S.state.charting.fields.map(f => ({ ...f }));
  const inc = S.records.filter(r => r.ft_decision === "include");
  const kind = r => (r.chart.checked_by || "").toLowerCase() === "reviewer" ? "me" : (r.chart.basis || "").toLowerCase() === "full text" ? "ft" : "abs";
  const n = k => inc.filter(r => kind(r) === k).length;
  const flt = D.cfilter ??= "all";
  const list = inc.filter(r => flt === "all" || kind(r) === flt);
  let sel = D.chartSel && inc.find(r => r.record_id === D.chartSel) ? D.chartSel : list[0]?.record_id;

  // field editor (rarely needed; protocol amendments) — collapsed
  const fl = h("div", { class: "stack" });
  const drawF = () => fl.replaceChildren(...fields.map((f, i) => h("div", { class: "row", style: "flex-wrap:nowrap" },
    h("input", { type: "text", value: f.name, placeholder: "field_name", style: "max-width:200px;font-family:var(--mono)", oninput: e => f.name = e.target.value }),
    h("input", { type: "text", value: f.description, placeholder: "What to record", oninput: e => f.description = e.target.value }),
    iconBtn("✕", "Remove field", () => { fields.splice(i, 1); drawF(); }))), btn("+ Add field", () => { fields.push({ name: "", description: "" }); drawF(); }, "sm"));
  drawF();

  const next = () => {                                  // next paper in the current filter that you have not checked
    const i = list.findIndex(r => r.record_id === sel);
    return list.slice(i + 1).find(r => kind(r) !== "me") || list.find(r => kind(r) !== "me" && r.record_id !== sel);
  };
  const form = h("div", {});
  const drawForm = () => {
    const r = inc.find(x => x.record_id === sel);
    if (!r) return form.replaceChildren(h("div", { class: "empty" }, "Nothing in this view."));
    const hasCols = Object.keys(r.chart).length > 0;
    const k = kind(r);
    form.replaceChildren(
      h("div", { class: "row", style: "align-items:flex-start;gap:10px;margin-bottom:6px" },
        h("div", { style: "flex:1" }, h("h3", { style: "margin:0" }, r.record_id + " · " + r.title),
          h("div", { class: "small muted", style: "margin-top:4px" }, r.authors, r.year ? " · " + r.year : "", r.journal ? " · " + r.journal : "")),
        pill(k === "me" ? "checked by you" : k === "ft" ? "AI · full text" : "AI · abstract", k === "me" ? "ok" : k === "ft" ? "info" : "warn")),
      h("div", { class: "row", style: "margin:8px 0 12px" },
        r.pdf_status === "found" ? btn("📄 Open PDF", () => api("open_note", { note: `10 - Full texts/${r.file}.pdf` }, { silent: true }), "")
          : h("span", { class: "small muted" }, "No PDF yet — values come from the abstract."),
        r.doi ? h("a", { href: "https://doi.org/" + r.doi, target: "_blank", class: "small" }, "DOI ↗") : null,
        h("span", { style: "flex:1" }),
        k !== "me" ? btn("✓ Checked — next", e => busy(e.currentTarget, async () => {
          const nx = next();
          await api("set_record", { record_id: r.record_id, fields: { chart_checked_by: "reviewer" } }, { silent: true });
          if (nx) D.chartSel = nx.record_id;
        }), "primary") : btn("Undo checked", () => api("set_record", { record_id: r.record_id, fields: { chart_checked_by: "AI" } }), "ghost"),
        btn("Next ›", () => { const nx = next(); if (nx) { D.chartSel = nx.record_id; render(); } }, "ghost")),
      r.notes ? h("details", { class: "small", style: "margin-bottom:10px" }, h("summary", { class: "muted" }, "Notes on this record"), h("div", { class: "muted", style: "margin-top:4px;white-space:pre-wrap" }, r.notes)) : null,
      ...(hasCols ? S.state.charting.fields.filter(f => f.name !== "checked_by").map(f => field(f.name, autosize(h("textarea", {
        rows: 2, value: r.chart[f.name] || "", placeholder: exampleFor("charting", f.name),
        onchange: e => { r.chart[f.name] = e.target.value; api("set_record", { record_id: r.record_id, fields: { ["chart_" + f.name]: e.target.value } }, { render: false, silent: true }).then(() => toast("Saved", "ok")); },
      })), f.description)) : [h("div", { class: "callout warn" }, "Add the charting columns first (Charting form, below).")]));
  };
  drawForm();
  return h("div", {},
    h("div", { class: "row", style: "margin-bottom:12px" },
      h("div", { style: "flex:1" }, bar(inc.length ? n("me") / inc.length : 0),
        h("div", { class: "small muted" }, `Checked by you: ${n("me")} of ${inc.length} included sources · AI from full text ${n("ft")} · AI from abstract ${n("abs")}`)),
      btn("Open Charting.base", () => openNote("12 - Charting.base"), "ghost")),
    h("div", { style: "display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:16px;align-items:start" },
      card("Included sources", null,
        segmented([["all", `All ${inc.length}`], ["ft", `Full text ${n("ft")}`], ["abs", `Abstract ${n("abs")}`], ["me", `Checked ${n("me")}`]], flt,
          v => { D.cfilter = v; D.chartSel = null; render(); }),
        h("div", { class: "queue", style: "max-height:640px;margin-top:10px" }, list.map(r => h("div", { class: "qitem" + (r.record_id === sel ? " cur" : ""), onclick: () => { D.chartSel = r.record_id; render(); } },
          h("span", { class: "dec-dot " + (kind(r) === "me" ? "include" : r.pdf_status === "found" ? "unsure" : "") }), h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title))))),
      card(null, null, form)),
    h("details", { class: "card", style: "margin-top:16px" },
      h("summary", { style: "font-weight:700;color:var(--text)" }, "Charting form (fields)", h("span", { class: "muted small", style: "font-weight:400" }, ` — the data items (${S.review_type.refs.dataItems}); changing them after locking is an amendment`)),
      h("div", { style: "margin-top:10px" }, fl), h("div", { class: "row end", style: "margin-top:10px" },
        btn("Save form", e => busy(e.currentTarget, () => api("save_fields", { fields }).then(() => delete D.fields)), ""),
        btn("Add columns to included records", e => busy(e.currentTarget, () => api("prepare_charting", {})), "primary"))));
};

PAGES.appraisal = () => {
  const sys = S.review_type.key === "systematic";
  const tool = h("input", { type: "text", value: S.state.charting.appraisal_tool || "", placeholder: sys ? "e.g. RoB 2, ROBINS-I, JBI checklist" : "e.g. MMAT 2018" });
  const inc = S.records.filter(r => r.ft_decision === "include");
  return h("div", {},
    card("Approach", sys ? "Choose a risk-of-bias tool that suits the study designs (RoB 2 for randomised trials, ROBINS-I for non-randomised studies). Required in a systematic review."
      : "Choose a tool that suits the study designs. If you skip appraisal, use 'Skip' above and give the reason.",
      h("div", { class: "row", style: "flex-wrap:nowrap" }, tool, btn("Save", () => api("appraisal_tool", { tool: tool.value }), ""),
        btn("Add appraisal columns", () => api("prepare_charting", { appraisal: true }), "primary"))),
    card(sys ? "Risk-of-bias judgements" : "Ratings", `${inc.length} included ${sys ? "stud" + (inc.length === 1 ? "y" : "ies") : "source(s)"}` +
        (inc.some(r => r.appraisal_by === "AI") ? ` · ${inc.filter(r => r.appraisal_by === "AI").length} suggested by AI, to confirm` : ""),
      inc.length ? h("table", { class: "tbl" }, h("tr", {}, [sys ? "Study" : "Source", sys ? "Overall risk of bias" : "Rating", "Reasons (with page locators)", ""].map(t => h("th", {}, t))),
      inc.map(r => {
        const mine = { appraisal_by: "reviewer" };      // any change by the reviewer makes the rating theirs
        return h("tr", {}, h("td", { style: "width:34%" }, h("b", {}, r.record_id), " ", r.title),
          h("td", { style: "width:170px" }, h("select", { onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal: e.target.value, ...mine } }, { silent: true }) },
            ["", ...S.review_type.appraisalRatings].map(v => h("option", { value: v, selected: (r.appraisal || "") === v }, v || "—")))),
          h("td", {}, h("input", { type: "text", value: r.appraisal_note || "", onchange: e => api("set_record", { record_id: r.record_id, fields: { appraisal_note: e.target.value, ...mine } }, { silent: true }) })),
          h("td", { style: "width:120px" }, r.appraisal_by === "AI" ? h("div", { class: "row" }, pill("AI", "warn"),
            btn("Confirm", () => api("set_record", { record_id: r.record_id, fields: mine }), "sm")) : null));
      }))
      : h("div", { class: "empty" }, "No included sources yet.")));
};

PAGES.synthesis = () => {
  const sy = D.synthesis ??= { ...(S.state.synthesis ?? {}) };
  const area = (k, label, hint, rows = 2) => field(label, autosize(h("textarea", { rows, value: sy[k] || "", placeholder: hint, oninput: e => sy[k] = e.target.value })));
  const line = (k, label, hint) => field(label, h("input", { type: "text", value: sy[k] || "", placeholder: hint, oninput: e => sy[k] = e.target.value }));
  return h("div", {},
    D.outcome ? outcomeEditor() : metaAnalysisCard(),
    h("div", { class: "callout" }, "Record what you did. These answers feed PRISMA 2020 items 13–15 and 20–22; for outcomes analysed above, the notes in 14 - Synthesis and the R scripts are your results file."),
    card("Synthesis", "PRISMA 2020 items 12–13 (methods) and 20 (results).",
      area("approach", "Approach", "e.g. random-effects meta-analysis of mean differences; narrative synthesis (SWiM) where studies could not be pooled", 3),
      line("software", "Software", "e.g. R 4.4, metafor 4.6"),
      line("results_file", "Results file", "e.g. Analysis/forest plots.pdf, or a link to the analysis code"),
      area("heterogeneity", "Heterogeneity and sensitivity", "e.g. I², τ²; subgroups by setting; leave-one-out")),
    card("Reporting bias and certainty", "PRISMA 2020 items 14–15 (methods) and 21–22 (results).",
      area("reporting_bias", "Reporting bias", "e.g. funnel plot and Egger's test for outcomes with ≥ 10 studies"),
      area("certainty", "Certainty of the evidence", "e.g. GRADE per outcome, summary-of-findings table"),
      area("notes", "Notes", "Anything else a reader needs to reproduce the synthesis", 2)),
    h("div", { class: "row end" }, btn("Save", e => busy(e.currentTarget, () => api("save_synthesis", { fields: sy }).then(() => delete D.synthesis)), "primary")));
};

// ---------------------------------------------------------------- meta-analysis and GRADE (synthesis stage)

const plot = svgText => h("div", { class: "plot", style: "overflow-x:auto", html: svgText.replace(' color="#222"', "") });
const outcomesOf = () => S.state.synthesis?.outcomes ?? [];
const saveOutcome = (outcome, el) => (el ? busy(el, () => api("save_outcome", { outcome })) : api("save_outcome", { outcome }, { silent: true }));

function metaAnalysisCard() {
  const included = S.records.filter(r => r.ft_decision === "include");
  const add = () => {
    D.outcome = { name: "", comparison: "", type: "binary", measure: "RR", model: "random", hk: false, design: "rct", rows: [] };
    render();
  };
  const outcomes = outcomesOf();
  return card("Meta-analysis and certainty (GRADE)",
    "One outcome at a time: enter each study's numbers, and the app pools them (inverse variance; random effects by DerSimonian–Laird, optional Hartung–Knapp), draws the forest and funnel plots and suggests GRADE judgements for you to confirm. "
    + "Every save writes a note, the plots, the data and an R script (metafor) to 14 - Synthesis, and updates 14 - Summary of findings.",
    outcomes.length ? h("div", {}, ...outcomes.map(o => outcomeResult(o, S.synthesis_results.find(x => x.id === o.id)))) : h("div", { class: "empty" },
      included.length ? "No outcomes yet." : "No included studies yet: full-text screening comes first."),
    h("div", { class: "row end", style: "margin-top:8px" },
      outcomes.length ? btn("Open summary of findings", () => openNote("14 - Summary of findings.md"), "ghost") : null,
      btn("+ Add outcome", add, "primary")));
}

function outcomeResult(o, res) {
  if (!res) return null;
  const g = res.grade, opt = S.synthesis_options;
  const setDomain = (key, value) => {
    const grade = { ...(o.grade ?? {}) };
    if (value) grade[key] = { ...value, confirmed: true }; else delete grade[key];
    saveOutcome({ ...o, grade });
  };
  const levelText = l => (l === 0 ? "not serious" : l === -1 ? "serious (−1)" : "very serious (−2)");
  return h("div", { class: "card", style: "margin:10px 0" },
    h("div", { class: "row" }, h("h3", { style: "flex:1;margin:0" }, o.name),
      pill(`${g.symbol} ${g.label}${g.confirmed ? "" : " · suggested"}`, g.confirmed ? "ok" : "warn"),
      btn("Edit data", () => { D.outcome = structuredClone(o); render(); }, "sm"),
      btn("Open note", () => openNote(`14 - Synthesis/${o.name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim()}.md`), "sm ghost"),
      btn("Remove", async () => { if (await confirmBox(`Remove "${o.name}"?`, "It leaves the analysis and the summary of findings. Its files in 14 - Synthesis are kept.", "Remove", true)) api("delete_outcome", { id: o.id }); }, "sm ghost")),
    h("p", { class: "sub" }, `${opt.measures[o.measure].label}; ${o.model === "fixed" ? "fixed effect" : "random effects" + (o.hk ? " (Hartung–Knapp)" : "")}; ${o.design === "obs" ? "observational studies" : "randomised trials"}${o.comparison ? " · " + o.comparison : ""}`),
    h("p", {}, h("b", {}, res.sentence),
      res.pooled && res.pooled.k > 1 ? ` Heterogeneity: I² = ${res.pooled.i2}%, τ² = ${res.pooled.tau2}, Q = ${res.pooled.q} (df ${res.pooled.df}, p ${res.pooled.pQ}).` : ""),
    res.studies.length ? plot(res.forest) : h("div", { class: "empty" }, "No study data yet: use Edit data."),
    res.funnel ? h("details", {}, h("summary", {}, `Funnel plot and Egger's test${res.egger ? ` (p ${res.egger.p}${res.egger.k < 10 ? "; fewer than 10 studies, little power" : ""})` : ""}`), plot(res.funnel)) : null,
    h("table", { class: "tbl", style: "margin-top:10px" },
      h("tr", {}, ["GRADE domain", "Judgement", "Reason", ""].map(t => h("th", {}, t))),
      opt.domains.map(([key, label]) => {
        const d = g.domains[key], sug = d.suggested ?? { level: 0, reason: "" };
        const reason = h("input", { type: "text", value: d.reason, onchange: e => setDomain(key, { level: d.level, reason: e.target.value }) });
        return h("tr", {}, h("td", { style: "width:150px" }, label),
          h("td", { style: "width:170px" }, h("select", { onchange: e => setDomain(key, { level: Number(e.target.value), reason: d.reason }) },
            [0, -1, -2].map(l => h("option", { value: l, selected: d.level === l }, levelText(l))))),
          h("td", {}, reason, !d.confirmed ? null : sug.level !== d.level ? h("div", { class: "small muted" }, `Suggested: ${levelText(sug.level)}. ${sug.reason}`) : null),
          h("td", { style: "width:110px" }, d.confirmed ? h("div", { class: "row" }, pill("confirmed", "ok"), btn("Undo", () => setDomain(key, null), "sm ghost"))
            : h("div", { class: "row" }, pill("suggested", "warn"), btn("Confirm", () => setDomain(key, { level: d.level, reason: d.reason }), "sm"))));
      })),
    h("p", { class: "small muted" }, `Certainty starts ${o.design === "obs" ? "low (observational studies)" : "high (randomised trials)"} and goes down one level per serious concern. The suggestions are rules of thumb: confirm or change each one and give your reason.`));
}

function outcomeEditor() {
  const o = D.outcome, opt = S.synthesis_options;
  const included = S.records.filter(r => r.ft_decision === "include").sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)));
  const rows = new Map((o.rows ?? []).map(r => [r.record_id, r]));
  const sel = (key, choices, after) => h("select", { onchange: e => { o[key] = e.target.value; after?.(); render(); } },
    choices.map(([v, label]) => h("option", { value: v, selected: o[key] === v }, label)));
  const cols = opt.types[o.type].columns;
  const label = r => `${String(r.authors || "").split(";")[0].split(",")[0].trim() || r.record_id} ${r.year || ""}`.trim();
  const save = async e => {
    o.rows = included.map(r => rows.get(r.record_id)).filter(r => r && cols.some(c => String(r[c] ?? "").trim() !== ""));
    const j = await busy(e.currentTarget, () => api("save_outcome", { outcome: o }));
    if (j) { delete D.outcome; render(); }
  };
  return card(o.id ? `Edit outcome: ${o.name}` : "New outcome", "Leave a study's row empty if it did not report this outcome. Group 1 is the intervention (or exposure), group 2 the comparator.",
    h("div", { class: "grid2" },
      field("Outcome", h("input", { type: "text", value: o.name, placeholder: "e.g. All-cause mortality at 12 months", oninput: e => o.name = e.target.value })),
      field("Comparison", h("input", { type: "text", value: o.comparison ?? "", placeholder: "e.g. exercise vs usual care", oninput: e => o.comparison = e.target.value }))),
    h("div", { class: "row", style: "gap:12px;flex-wrap:wrap" },
      field("Data", sel("type", Object.entries(opt.types).map(([k, t]) => [k, t.label]), () => { o.measure = opt.types[o.type].measures[0]; })),
      field("Effect measure", sel("measure", opt.types[o.type].measures.map(m => [m, opt.measures[m].label]))),
      field("Model", sel("model", [["random", "Random effects (DerSimonian–Laird)"], ["fixed", "Fixed effect (inverse variance)"]])),
      o.model === "random" ? field("CI method", h("label", { class: "row small" }, h("input", { type: "checkbox", checked: o.hk, onchange: e => o.hk = e.target.checked }), "Hartung–Knapp (recommended with few studies)")) : null,
      field("Study design", sel("design", [["rct", "Randomised trials (GRADE starts high)"], ["obs", "Observational (GRADE starts low)"]]))),
    included.length ? h("div", { style: "overflow-x:auto" }, h("table", { class: "tbl" },
      h("tr", {}, h("th", {}, "Study"), ...cols.map(c => h("th", {}, opt.columns[c]))),
      included.map(r => h("tr", {}, h("td", { title: r.title }, h("b", {}, r.record_id), " ", label(r)),
        ...cols.map(c => h("td", { style: "width:90px" }, h("input", { type: "text", inputmode: "decimal", value: rows.get(r.record_id)?.[c] ?? "",
          oninput: e => {      // kept on the draft, so switching the data type or measure keeps what was typed
            let row = rows.get(r.record_id);
            if (!row) { row = { record_id: r.record_id }; rows.set(r.record_id, row); (o.rows ??= []).push(row); }
            row[c] = e.target.value;
          } })))))))
      : h("div", { class: "empty" }, "No included studies yet."),
    h("div", { class: "row end", style: "margin-top:10px" }, btn("Cancel", () => { delete D.outcome; render(); }, "ghost"), btn("Save and analyse", save, "primary")));
}

PAGES.report = () => {
  const auto = S.checklist_auto;
  const kept = S.records.filter(r => r.ft_decision === "include");
  return h("div", {},
    kept.length ? card("Your library", `When the review is finished, copy the papers you kept to ${libraryName()}. Everything else stays in this review's folder.`,
      h("div", { class: "row" }, h("span", { class: "small muted", style: "flex:1" },
        `${kept.length} included paper(s); ${kept.filter(r => r.publication).length} already linked to a library note. Each gets a publication note from the template (or, if it is already in your library, this review is added to its 'included_in') and a copy of its PDF.`),
        btn("📚 Add kept papers to library", async e => {
          if (await confirmBox("Add to library", `Copy ${kept.length} included paper(s) to ${libraryName()}? Do this when screening is final.`, "Add"))
            busy(e.target, () => api("add_to_library"));
        }, "primary"))) : null,
    card("Traceability", "Every change of a screening decision is in 08 - Decision log.csv (when, who, how), chained with SHA-256 so that an edited row shows. The review package collects the protocol, searches, decisions, log, second-reviewer sheets, charting, flow, checklist and AI use, with a checksum per file, ready to deposit on OSF or Zenodo.",
      h("div", { class: "row" },
        btn("Check the decision log", async e => {
          const v = await busy(e.currentTarget, () => api("verify_log", {}, { silent: true }));
          if (v) toast(v.intact ? `Decision log: ${v.rows} rows, chain intact` : `Decision log: chain broken at row ${v.brokenAt} — a row was edited or removed`, v.intact ? "ok" : "err");
        }, ""),
        btn("Open the log", () => openNote("08 - Decision log.csv"), "ghost"),
        btn("📦 Make review package", async e => { const j = await busy(e.currentTarget, () => api("review_package")); if (j?.download) download(j.download); }, "primary"))),
    h("div", { class: "grid2" },
      card("PRISMA flow", "Live from your records. The PRISMA flow note in Obsidian shows the same.", flowDiagram(S.flow),
        h("div", { class: "row end", style: "margin-top:8px" }, btn("Open note", () => openNote("14 - PRISMA flow.md"), "ghost"), btn("Refresh note", e => busy(e.currentTarget, () => api("report")), ""))),
      h("div", {},
        card("Exports", "For your reference manager and the tables in your manuscript.",
          h("div", { class: "row" },
            btn("⬇ BibTeX of included", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "bib" })); if (j?.download) download(j.download); }, ""),
            btn("⬇ Included for Zotero (RIS)", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "ris" })); if (j?.download) download(j.download); }, ""),
            btn("⬇ Charting table (CSV)", async e => { const j = await busy(e.currentTarget, () => api("export", { kind: "csv" })); if (j?.download) download(j.download); }, "")),
          h("details", { class: "sub", style: "margin-top:8px" },
            h("summary", {}, "Working with Zotero"),
            h("ol", {},
              h("li", {}, "In Zotero, install the Better BibTeX add-on (Tools → Plugins) so every paper gets a stable citation key."),
              h("li", {}, "Zotero → Review Studio: right-click a collection → Export Collection… → Better BibTeX, and import that .bib in Search & import. The citation keys are kept on the records."),
              h("li", {}, "Review Studio → Zotero: click “Included for Zotero (RIS)”, then in Zotero use File → Import… and pick the file from this review's 07 - Exports folder (not your Downloads), so the full texts in 10 - Full texts are attached."),
              h("li", {}, "Imported papers are tagged review:<name>, included and record:R…; the BibTeX export uses the same citation keys.")))),
        card("Sync with the library", `Marks included papers in ${libraryName()} (included_in). Preview first.`,
          h("div", { class: "row" },
            btn("Preview", async e => { const j = await busy(e.currentTarget, () => api("sync", { apply: false }, { silent: true })); if (j) modal({ title: "Sync preview", body: h("pre", { class: "code" }, j.message || "Nothing to change.") }); }, ""),
            btn("Apply", async e => { if (await confirmBox("Apply sync?", "This writes included_in / candidate_in to the publication notes.", "Apply")) busy(e.target, () => api("sync", { apply: true })); }, "primary"))),
        card("Checklist progress", null, (() => {
          const required = S.checklist_items.filter(it => !it.optional);
          const n = required.filter(it => S.state.checklist[it.n]?.done).length;
          return h("div", {}, h("div", { class: "big", style: "font-size:28px;font-weight:700" }, `${n} / ${required.length}`), bar(n / required.length),
            h("div", { class: "small muted", style: "margin-top:4px" }, `${S.review_type.guideline} items marked as reported` + (required.length < S.checklist_items.length ? " (optional items not counted)" : "")));
        })()))),
    card(`${S.review_type.guideline} checklist`, "Tick each item and note where it is reported. 'Evidence' is what the tool can see in the vault.",
      h("table", { class: "tbl" }, h("tr", {}, ["#", "Item", "Evidence in the vault", "Location in manuscript", "Reported"].map(t => h("th", {}, t))),
        S.checklist_items.map(it => {
          const c = S.state.checklist[it.n] || {};
          const loc = h("input", { type: "text", value: c.location || "", placeholder: "e.g. Methods 2.1" });
          const ok = h("input", { type: "checkbox", checked: !!c.done });
          const save = () => api("checklist", { n: it.n, location: loc.value, done: ok.checked }, { render: false, silent: true });
          loc.addEventListener("change", save); ok.addEventListener("change", save);
          return h("tr", {}, h("td", { class: "num" }, it.n), h("td", {}, h("b", {}, it.item), it.optional ? [" ", pill("optional", "info")] : null, h("div", { class: "small muted" }, it.desc)),
            h("td", { class: "small" }, auto[String(it.n)] ? pill(auto[String(it.n)], "info") : h("span", { class: "muted" }, "—")),
            h("td", { style: "width:200px" }, loc), h("td", { style: "text-align:center" }, h("label", { class: "check" }, ok)));
        }))));
};

// ================================================================ keyboard
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector(".scrim");
  if (e.key === "Escape") { closeHelp(); return; }
  if (e.ctrlKey && e.key === "Enter" && CUR === "idea") { $("#page .btn.primary")?.click(); return; }
  if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    const seq = tabSequence(), i = (CUR === HOME ? -1 : seq.findIndex(x => x.tab === curTab())) + (e.key === "ArrowDown" ? 1 : -1);
    if (seq[i]) { e.preventDefault(); goTab(seq[i].tab); }
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "?" && CUR !== HOME) { openHelp(CUR); return; }
  if (e.key.toLowerCase() === "x" && CUR !== HOME) { openExample(CUR); return; }
  if (e.key.toLowerCase() === "g") { openGlossary(); return; }
  if (e.key === "[") { $("#btnNav").click(); return; }
  if (e.key.toLowerCase() === "t") { openTimeline(); return; }
  if (CUR !== "screening" || !SC.id) return;
  const k = e.key.toLowerCase();
  if (k === "i") decide("include");
  else if (k === "u" && SC.stage === "ta") decide("unsure");
  else if (k === "e") { SC.excl = true; render(); }
  else if (/^[1-9]$/.test(k) && SC.excl) { const r = S.reasons[SC.stage][+k - 1]; if (r) decide("exclude", r.split(" ")[0]); }
  else if (e.key === "ArrowRight") move(1);
  else if (e.key === "ArrowLeft") move(-1);
});

// ================================================================ start
$("#reviewSel").addEventListener("change", async e => {
  if (e.target.value !== "__open__") return switchReview(e.target.value);
  e.target.value = REVIEW;
  openReviewFolder();
});
$("#btnTheme").onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; store.set("theme", t); };
$("#btnGlossary").onclick = openGlossary;
$("#btnTypeMenu").onclick = openReviewType;
$("#btnFlowMap").onclick = () => { store.set("flowmap", store.get("flowmap", "") === "hidden" ? "" : "hidden"); render(); };
$("#btnClaude").onclick = openClaudeGuide;
$("#btnTimeline").onclick = openTimeline;
$("#btnType").onclick = openReviewType;
$("#btnKeys").onclick = openKeys;
$("#btnScr").onclick = () => openChecklist();
// The sidebar folds away (☰ or [) to give the content the whole width; remembered in this browser
function setNav(open) { $("#app").classList.toggle("nav-hidden", !open); $("#btnNav").setAttribute("aria-expanded", String(open)); store.set("nav", open ? "" : "hidden"); }
$("#btnNav").onclick = () => setNav($("#app").classList.contains("nav-hidden"));
setNav(store.get("nav", "") !== "hidden");
$("#main").addEventListener("scroll", () => $("#topwrap").classList.toggle("scrolled", $("#main").scrollTop > 4));

// Settings menu (theme, developer mode): opens on click, closes on Escape, outside click or after a choice
{
  const sb = $("#btnSettings"), menu = $("#settingsMenu");
  const show = on => { menu.hidden = !on; sb.setAttribute("aria-expanded", on); if (on) menu.querySelector("button").focus(); };
  sb.onclick = e => { e.stopPropagation(); show(menu.hidden); };
  menu.addEventListener("click", () => show(false));
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) show(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { show(false); sb.focus(); } });
}

// The draft (a review in the browser's own storage, where the app starts): save it to a folder, or open one.
function renderDraftBar() {
  const bar = $("#draftBar");
  bar.hidden = !backend.entry?.draft || CUR === HOME;              // the Homepage is only an introduction
  bar.classList.toggle("has-content", draftHasContent());
  if (bar.hidden) return;
  const recent = S.reviews.filter(r => r !== REVIEW).slice(0, 2);
  bar.replaceChildren(
    h("span", { class: "draft-text" }, h("span", { class: "unsaved-badge" }, "● Not saved"),
      draftHasContent()
        ? " This draft exists only in this browser. Save it to a folder on your PC to keep it."
        : " Start writing here; save it to a folder on your PC when you want to keep it."),
    h("span", { class: "draft-actions" },
      btn("💾 Save to a folder…", e => busy(e.currentTarget, saveDraft), "sm primary"),
      btn("📂 Open a review folder…", openReviewFolder, "sm"),
      ...recent.map(r => btn(`▶ ${r.replace(/ records$/, "")}`, () => switchReview(r), "sm ghost"))));
}

// Closing or leaving the page with a draft that has content: the browser asks first (it shows its own wording).
// The draft is kept in the browser either way, but only a saved folder is safe from clearing the browser's data.
const draftHasContent = () => Boolean(backend.entry?.draft && S && (S.events.length || S.records.length || S.state.idea?.length));
window.addEventListener("beforeunload", e => {
  if (!draftHasContent()) return;
  e.preventDefault();
  e.returnValue = "";
});

async function saveDraft() {
  const name = (await promptText("Save the draft", "Name of the review. A folder \"<name> records\" is made in the place you choose next.", "e.g. Repairability review"))?.trim();
  if (!name) return;
  try {
    const entry = await backend.saveDraft(name);
    await switchReview(entry.name);
    toast(`Saved: ${entry.name}. From now on every change is written there.`, "ok");
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}

async function openReviewFolder() {
  try {
    const entry = await backend.pickFolder();
    await backend.open(entry);
    switchReview(entry.name);
  } catch (err) { if (err.name !== "AbortError") toast(err.message, "err"); }
}

async function switchReview(name) {
  try {
    S = await getJSON(`/api/state?review=${encodeURIComponent(name)}`);
    REVIEW = name; store.set("review", name);
    for (const k of Object.keys(D)) delete D[k];
    SC.id = null; SC.cache = {};
    if (CUR !== HOME && !S.stages.find(s => s.key === CUR)) CUR = HOME;
    render();
  } catch (e) { toast(e.message, "err"); }
}

// Changes made outside Review Studio (Claude through bin/ai-assist.js, another program): re-read the review
// when the window comes back into view, and every 15 s while it is visible.
let checkingOutside = false;
async function checkOutside() {
  if (checkingOutside || document.hidden || !S) return;
  checkingOutside = true;
  try {
    if (await backend.refreshIfChanged()) {
      S = await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`);
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

// ================================================================ app tour
// A short, plain explanation of what the app is for, one highlighted part of the screen at a time.
// Offered once on the first visit; the button on the Homepage replays it.
const TOUR = [
  { title: "Welcome to Review Studio 👋",
    text: "This app guides you through a systematic review, step by step: from your first idea to a finished PRISMA report. It keeps every step documented, so your review is transparent and easy to reproduce." },
  { target: "#stepper", title: "Your review, step by step",
    text: "Plan (question, search, inclusion rules), find and select papers, analyse them, report. Each step says in one line what it is for. Steps marked AI are where Claude can help, if you want. Click any step to open it." },
  { target: "#topbar", title: "One step at a time",
    text: "Some steps have tabs for their parts. Each page says what to do; ? Help explains the method with a filled-in example, ✓ Mark done ticks it off, and Next at the bottom takes you on." },
  { target: "#draftBar", title: "Your files stay on your PC",
    text: "You start in a draft kept in this browser. Save it to a folder when you want to keep it: the review becomes plain notes, tables and PDFs on your PC. Nothing is uploaded." },
  { target: ".toolbar", title: "Tools for every step",
    text: "The timeline of everything you did, the PRISMA 2020 reporting checklist and, if you want it, AI help from Claude, which only ever suggests. The glossary and keyboard shortcuts are under ⚙ Settings." },
  { title: "Ready? Start with your question ✍️",
    text: "Step 1 is your research question. Not sure yet? Jot your idea down under Idea notes first; the Question tab makes it precise. You can replay this tour from the Homepage." },
];

function offerTour() {
  const card = h("div", { class: "tour-offer", role: "dialog", "aria-label": "App tour" },
    h("div", { class: "tour-offer-text" }, h("b", {}, "New here?"), " Take the 1-minute tour to see what Review Studio does."),
    h("div", { class: "row" },
      btn("🎓 Start tour", () => { card.remove(); startTour(); }, "sm primary"),
      btn("Not now", () => { card.remove(); store.set("toured", "skipped"); }, "sm ghost")));
  document.body.append(card);
}

let tourClose = null;                         // closes the step on screen
function startTour(i = 0) {
  tourClose?.();
  document.querySelector(".tour-offer")?.remove();
  store.set("toured", "yes");
  const steps = TOUR.filter(s => !s.target || (document.querySelector(s.target) && !document.querySelector(s.target).hidden));
  const step = steps[i];
  if (!step) return;
  const target = step.target && document.querySelector(step.target);
  const wrap = h("div", { class: "tour" });
  const spot = h("div", { class: "tour-spot" + (target ? "" : " none") });
  const close = () => { wrap.remove(); document.removeEventListener("keydown", keys, true); window.removeEventListener("resize", place); tourClose = null; };
  tourClose = close;
  const card = h("div", { class: "tour-card", role: "dialog", "aria-label": step.title },
    h("div", { class: "tour-count" }, `${i + 1} of ${steps.length}`),
    h("h3", {}, step.title), h("p", {}, step.text),
    h("div", { class: "row tour-buttons" },
      i < steps.length - 1 ? btn("Skip tour", close, "sm ghost") : null,
      h("span", { class: "spacer" }),
      i > 0 ? btn("← Back", () => startTour(i - 1), "sm") : null,
      i < steps.length - 1 ? btn("Next →", () => startTour(i + 1), "sm primary") : btn("Let's start", () => { close(); go("questions"); }, "sm primary")));
  wrap.append(spot, card);
  document.body.append(wrap);
  function place() {
    if (!target) return;
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px` });
    const cw = card.offsetWidth, ch = card.offsetHeight, m = 14;
    let left = r.right + m, top = r.top;                                         // right of the target …
    if (left + cw > innerWidth - m) { left = Math.max(m, Math.min(r.left, innerWidth - cw - m)); top = r.bottom + m; }   // … or below it
    if (top + ch > innerHeight - m) top = Math.max(m, r.top - ch - m);                                                   // … or above it
    Object.assign(card.style, { left: `${left}px`, top: `${Math.max(m, top)}px` });
  }
  function keys(e) {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" && i < steps.length - 1) startTour(i + 1);
    else if (e.key === "ArrowLeft" && i > 0) startTour(i - 1);
    else return;
    e.stopPropagation(); e.preventDefault();
  }
  place();
  window.addEventListener("resize", place);
  document.addEventListener("keydown", keys, true);
  card.querySelector(".btn.primary")?.focus();
}

// main.js waits for this to time how long opening a review takes
window.studioReady = (async function start() {
  try {
    H = await getJSON("/api/help");
    try { S = await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`); }
    catch (e) {
      const { reviews } = await getJSON("/api/reviews");
      if (!reviews.length) throw new Error("No review anchor note found. Create a note with 'type: review' in its properties.");
      REVIEW = reviews[0]; store.set("review", REVIEW);
      S = await getJSON(`/api/state?review=${encodeURIComponent(REVIEW)}`);
    }
    render();
    if (!store.get("toured", "") && CUR !== HOME) offerTour();   // the Homepage has its own tour button
  } catch (e) {
    $("#page").replaceChildren(h("div", { class: "card empty" }, h("div", { class: "big" }, "⚠️"), h("h3", {}, "Could not load the review"), h("p", {}, e.message)));
  }
})();

$("#btnDev").addEventListener("click", async () => {
  if (!S.dev_mode && !(await confirmBox("Developer mode", "Lift the locks? Locked parts (questions, concepts, search strings, protocol text, exclusion reasons, charting form) become editable without amendment reasons. Each change is still noted in the timeline.", "Switch on", true))) return;
  api("dev_mode", { on: !S.dev_mode });
});
