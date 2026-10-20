/**
 * Page: Screening.
 * @module web/studio/pages/screening
 */
import { api, busy } from "../core/api.js";
import { h, singleKeys, store } from "../core/dom.js";
import { D, REVIEW, S, SC } from "../core/state.js";
import { PAGE_KEYS, PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { bar, btn, decDot, decKind, field, highlight, openNote, pill, segmented } from "../ui/components.js";
import { announce, confirmBox } from "../ui/dialogs.js";

// The screening keys: I include, U unsure (title/abstract), E then 1–9 exclude with a reason, Z undo, ← → move;
// in the Suggested queue, Enter accepts Claude's suggestion (not while a button or link has focus: Enter is theirs).
PAGE_KEYS.screening = (e, typing) => {
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (e.key === "Enter" && SC.id && SC.filter === "suggest" && !e.target.closest?.("button, a, summary, [role=button]")) { acceptSuggestion(); return true; }
  if (!singleKeys.on()) return e.key === "ArrowRight" ? (move(1), true) : e.key === "ArrowLeft" ? (move(-1), true) : false;   // letters and digits switched off
  if (k === "z" && lastDecision()) { undo(); return true; }   // also when the last record of a queue was just decided
  if (!SC.id) return false;
  if (k === "i") decide("include");
  else if (k === "u" && SC.stage === "ta") decide("unsure");
  else if (k === "e") { SC.excl = true; render(); }
  else if (/^[1-9]$/.test(k) && SC.excl) { const r = S.reasons[SC.stage][+k - 1]; if (r) decide("exclude", r.split(" ")[0]); }
  else if (e.key === "ArrowRight") move(1);
  else if (e.key === "ArrowLeft") move(-1);
  else return false;
  return true;
};

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

const KEYS = stage => (stage === "ta" ? ["ta_decision", "ta_reason"] : ["ft_decision", "ft_reason"]);
const DONE = { include: "included", exclude: "excluded", unsure: "marked unsure", pending: "open again", "": "open again" };

async function decide(decision, reason = "") {
  const q = queue(), i = q.findIndex(r => r.record_id === SC.id);
  if (i < 0) return;
  const rec = q[i], [dkey, rkey] = KEYS(SC.stage), next = q[i + 1] || q[i - 1];
  const before = { decision: rec[dkey] ?? "", reason: rec[rkey] ?? "", notes: rec.notes ?? "" };
  // in the Suggested queue every decision is a reviewed AI suggestion: the log says so, and the record's note says
  // whether the reviewer kept Claude's suggestion or changed it
  const ai = SC.filter === "suggest" && rec[aiKey("decision")] ? rec : null;
  const kept = ai && decision === ai[aiKey("decision")] && (decision === "exclude" ? reason : "") === (decision === "exclude" ? ai[aiKey("reason")] || "" : "");
  if (ai) await api("apply_decisions", { items: [{ id: rec.record_id, decision, reason }], stage: SC.stage }, { silent: true });
  else await api("decide", { record_id: SC.id, stage: SC.stage, decision, reason }, { silent: true });
  SC.last = { review: REVIEW, id: rec.record_id, stage: SC.stage, before, decision, reason, ai: Boolean(ai) };   // what Undo puts back
  announce(`${rec.record_id} ${DONE[decision]}${reason ? ", " + reason : ""}${ai ? (kept ? ", as Claude suggested" : ", not as Claude suggested") : ""}. Z to undo.`);
  SC.excl = false;
  if (SC.filter === "todo" || SC.filter === "suggest") SC.id = next ? next.record_id : null;
  render();
}

/** Enter in the Suggested queue: Claude's suggestion becomes the reviewer's decision (still a reviewed suggestion). */
function acceptSuggestion() {
  const rec = S.records.find(r => r.record_id === SC.id), d = rec?.[aiKey("decision")];
  if (d) decide(d, d === "exclude" ? rec[aiKey("reason")] || "" : "");
}

/** The reviewer's last decision in this review, while its record is still there. */
const lastDecision = () => SC.last && SC.last.review === REVIEW && S.records.some(r => r.record_id === SC.last.id) ? SC.last : null;

/**
 * Undo (Z): puts back the decision the last record had before, and shows that record again. A slip in fast
 * keyboard screening costs one key; the decision log records it as undone.
 */
async function undo() {
  const l = lastDecision();
  if (!l) return;
  await api("decide", { record_id: l.id, stage: l.stage, decision: l.before.decision, reason: l.before.reason, undo: true,
    ...(l.ai ? { notes: l.before.notes } : {}) }, { silent: true });   // a reviewed suggestion also wrote to the note
  SC.last = null; SC.stage = l.stage; SC.id = l.id; SC.excl = false;
  announce(`Undone: ${l.id} is ${["", "pending"].includes(l.before.decision) ? "open" : DONE[l.before.decision]} again.`);
  if (!queue().some(r => r.record_id === l.id)) SC.filter = "all";
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
    segmented([["todo", "To do"], ["all", "All"], ...(S.records.some(r => (r.notes || "").includes("[pilot]")) ? [["pilot", "Pilot"]] : []),
      ...(suggested().length || SC.filter === "suggest" ? [["suggest", `Suggested (${suggested().length})`]] : []),
      ...(SC.stage === "ta" && S.records.some(r => r.presort && r.ta_decision === "pending") ? [["presort", `Pre-sorted (${S.records.filter(r => r.presort && r.ta_decision === "pending").length})`]] : [])],
      SC.filter, v => { SC.filter = v; render(); }, "Show records"),
    h("div", { style: "flex:1;min-width:160px" }, bar(total ? done / total : 0), h("div", { class: "small muted" }, `${done} of ${total} decided`)),
    btn("Check decisions", e => busy(e.currentTarget, () => api("check")), ""),
    btn("Open Screening.base", () => openNote("08 - Screening.base"), "ghost"));

  let main;
  if (SC.filter === "presort") {
    main = presortView(q);
  } else if (!rec) {
    main = h("div", { class: "card empty" }, h("div", { class: "big" }, total ? "🎉" : "📭"),
      h("h2", {}, SC.filter === "suggest" ? "All of Claude's suggestions are reviewed" : total ? "Nothing left to screen here" : "No records yet"),
      h("p", {}, total ? "Switch to 'All' to review earlier decisions, or continue with the next step." : "Import a database export first (step Search & import)."),
      lastDecisionLine());
  } else {
    const absBox = h("div", { class: "abstract" }, h("span", { class: "muted" }, "Loading abstract…"));
    const showAbs = r => absBox.innerHTML = r.abstract ? highlight(r.abstract) : `<span class="muted">No abstract in the export. Open the DOI to read it.</span>`;
    if (SC.cache[rec.record_id]) showAbs(SC.cache[rec.record_id]);
    else api("record_abstract", { record_id: rec.record_id }, { silent: true }).then(j => { SC.cache[rec.record_id] = j.record; if (SC.id === rec.record_id) showAbs(j.record); });
    const cur = rec[dkey];
    const reasonRow = h("div", { class: "reasons", style: SC.excl || cur === "exclude" ? "" : "display:none" },
      h("span", { class: "small muted", style: "align-self:center" }, "Reason:"),
      reasons.map((r, i) => h("button", { class: rec[rkey] && r.split(" ")[0] === rec[rkey].split(" ")[0] ? "on" : "", onclick: () => decide("exclude", r.split(" ")[0]) }, h("kbd", {}, i + 1), " ", r)));
    const notes = h("input", { type: "text", placeholder: "e.g. other version of R0012", value: rec.notes || "",
      onchange: e => api("set_record", { record_id: rec.record_id, fields: { notes: e.target.value } }, { render: false, silent: true }) });
    main = h("div", { class: "card rec" },
      h("div", { class: "meta" }, h("b", { style: "font-family:var(--mono)" }, rec.record_id), rec.year ? pill(rec.year) : null, rec.journal ? h("span", {}, rec.journal) : null,
        rec.language && !/^english$/i.test(rec.language) ? pill("language: " + rec.language, "bad") : null,
        rec.publication ? pill("in your library", "accent") : null,
        cur && cur !== "pending" ? pill("decided: " + cur + (rec[rkey] ? " · " + rec[rkey] : ""), decKind(cur)) : null,
        rec.sample_ta && SC.stage === "ta" ? pill("in 2nd-reviewer sample", "info") : null),
      h("h2", {}, rec.title),
      h("button", { class: "file", style: "margin:-2px 0 6px", title: `${S.record_files[rec.record_id] || ""}: your decision is saved in this note`, onclick: () => openNote(S.record_files[rec.record_id]) },
        "📝 Open this paper's note"),
      h("div", { class: "authors" }, rec.authors),
      h("div", { class: "row", style: "margin-top:8px" },
        rec.doi ? h("a", { href: "https://doi.org/" + rec.doi, target: "_blank", class: "btn sm" }, "DOI ↗") : null,
        rec.oa_url ? h("a", { href: rec.oa_url, target: "_blank", class: "btn sm" }, "Open access ↗") : null,
        SC.stage === "ft" ? pill(rec.pdf_status ? "PDF: " + rec.pdf_status : "PDF: not checked", rec.pdf_status === "found" ? "ok" : rec.pdf_status ? "bad" : "") : null),
      absBox,
      SC.filter === "suggest" && rec[aiKey("decision")] ? suggestionBox(rec) : null,
      h("div", { style: "margin-top:12px" }, field("Note (optional)", notes)),
      decisionHistory(rec.record_id),
      decisionBar(rec, cur, reasonRow));
  }

  // the queue lists at most 400 records: those around the current one, so it is always in view
  const at = Math.max(0, q.findIndex(r => r.record_id === SC.id)), from = Math.max(0, Math.min(at - 100, q.length - 400));
  const shown = q.slice(from, from + 400);
  const include = S.reasons.include ?? [];
  const side = h("div", {},
    include.length ? h("details", { class: "card", open: true, style: "padding:10px 14px;margin-bottom:12px" },
      h("summary", { style: "font-weight:700" }, `Include a paper if… (${include.length})`),
      h("ul", { class: "small", style: "margin:6px 0 0;padding-left:18px" }, include.map(c => h("li", {}, c)))) : null,
    h("div", { class: "card", style: "padding:12px" }, h("h2", { style: "padding:4px 6px" }, `Queue (${q.length})`,
      q.length > shown.length ? h("span", { class: "small muted" }, ` · showing ${from + 1}–${from + shown.length}`) : null),
      h("div", { class: "queue" }, shown.map(r => h("div", { class: "qitem" + (r.record_id === SC.id ? " cur" : ""), onclick: () => { SC.id = r.record_id; SC.excl = false; render(); } },
        decDot(r[dkey] || "pending"), h("span", { class: "id" }, r.record_id), h("span", { class: "t", title: r.title }, r.title))))),
    S.problems.length ? h("div", { class: "card", style: "padding:12px;border-left:4px solid var(--bad)" }, h("h2", {}, `${S.problems.length} problem(s)`),
      S.problems.slice(0, 30).map(p => h("div", { class: "small", style: "padding:3px 0;cursor:pointer", onclick: () => { SC.id = p.record_id; SC.filter = "all"; render(); } }, h("b", {}, p.record_id), " ", p.text))) : null);
  setTimeout(() => {                                    // keep the current record in view inside the queue list
    const list = document.querySelector(".queue"), cur = list?.querySelector(".qitem.cur");
    if (!cur) return;
    const box = list.getBoundingClientRect(), r = cur.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) list.scrollTop += r.top - box.top - box.height / 2;
  });
  return h("div", {}, head, h("div", { class: "screen" }, main, side));
};

/**
 * The decision buttons, kept in view at the foot of the window while the abstract is read (sticky), so a decision
 * never needs a scroll first (Fitts). Above them: the last decision with its Undo, and Previous / Next.
 */
/** The last decision with its Undo button (also shown when the queue has just been emptied). */
function lastDecisionLine() {
  const last = lastDecision();
  return last ? h("span", { class: "last-decision" }, decDot(last.decision), h("span", {}, h("b", {}, last.id), ` ${DONE[last.decision]}${last.reason ? " · " + last.reason : ""}`),
    btn(["↶ Undo ", h("kbd", {}, "Z")], undo, "sm ghost", `Put back the decision ${last.id} had before`)) : null;
}

function decisionBar(rec, cur, reasonRow) {
  const pressed = d => ({ "aria-pressed": String(cur === d) });
  return h("div", { class: "decide-bar" },
    h("div", { class: "decide-top" },
      lastDecisionLine() ?? h("span", { class: "kbdhint" }, `${SC.filter === "suggest" ? "Enter accept · " : ""}I include · U unsure · E exclude, then 1–9 reason · Z undo · ←/→ previous / next`),
      h("span", { class: "spacer" }),
      btn("← Previous", () => move(-1), "sm ghost", "Previous record (←)"), btn("Next →", () => move(1), "sm ghost", "Next record (→)")),
    h("div", { class: "decide" },
      h("button", { class: "inc" + (cur === "include" ? " on" : ""), ...pressed("include"), onclick: () => decide("include") }, "✓ Include", h("kbd", {}, "I")),
      SC.stage === "ta" ? h("button", { class: "uns" + (cur === "unsure" ? " on" : ""), ...pressed("unsure"), onclick: () => decide("unsure") }, "? Unsure", h("kbd", {}, "U"))
        : h("button", { class: "uns", onclick: () => api("mark_pdf", { record_id: rec.record_id, status: "not-retrieved" }) }, "⊘ Not retrieved"),
      h("button", { class: "exc" + (cur === "exclude" ? " on" : ""), ...pressed("exclude"), onclick: () => { SC.excl = true; reasonRow.style.display = ""; } }, "✕ Exclude", h("kbd", {}, "E"))),
    reasonRow);
}

/**
 * Claude's suggestion for the record on screen, under its abstract: read the record first, then the suggestion
 * (a cognitive forcing order against automation bias; Buçinca et al. 2021). Nothing is preselected: Enter accepts,
 * I / U / E decide otherwise, and either way the decision is the reviewer's.
 */
function suggestionBox(rec) {
  const d = rec[aiKey("decision")], code = rec[aiKey("reason")] || "", why = rec[aiKey("why")] || "";
  const reason = d === "exclude" ? S.reasons[SC.stage].find(r => r.split(" ")[0] === code) ?? code : "";
  return h("div", { class: "ai-suggestion", role: "note", "aria-label": "Claude's suggestion" },
    h("div", { class: "row" }, h("span", { class: "ai-label" }, "🤖 Claude suggests"), decDot(d), h("b", {}, { include: "Include", exclude: "Exclude", unsure: "Unsure" }[d] ?? d),
      h("span", { class: "spacer" }), btn(["Accept ", h("kbd", {}, "Enter")], acceptSuggestion, "sm", "Make Claude's suggestion your decision")),
    reason ? h("div", { class: "ai-reason" }, reason) : null,
    why ? h("p", {}, why) : null,
    h("div", { class: "small muted" }, "Enter accepts · I, U or E decides otherwise · the log notes whether you kept the suggestion"));
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
