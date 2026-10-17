/**
 * Page: Screening.
 * @module web/studio/pages/screening
 */
import { api, busy } from "../core/api.js";
import { h, store } from "../core/dom.js";
import { D, REVIEW, S, SC } from "../core/state.js";
import { PAGE_KEYS, PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { bar, btn, decDot, decKind, field, highlight, labelBy, openNote, pill, segmented } from "../ui/components.js";
import { announce, confirmBox } from "../ui/dialogs.js";

// The screening keys: I include, U unsure (title/abstract), E then 1–9 exclude with a reason, Z undo, ← → move.
PAGE_KEYS.screening = (e, typing) => {
  if (typing || e.ctrlKey || e.metaKey || e.altKey || !SC.id) return false;
  const k = e.key.toLowerCase();
  if (k === "i") decide("include");
  else if (k === "u" && SC.stage === "ta") decide("unsure");
  else if (k === "e") { SC.excl = true; render(); }
  else if (/^[1-9]$/.test(k) && SC.excl) { const r = S.reasons[SC.stage][+k - 1]; if (r) decide("exclude", r.split(" ")[0]); }
  else if (k === "z" && lastDecision()) undo();
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
  const before = { decision: rec[dkey] ?? "", reason: rec[rkey] ?? "" };
  await api("decide", { record_id: SC.id, stage: SC.stage, decision, reason }, { silent: true });
  SC.last = { review: REVIEW, id: rec.record_id, stage: SC.stage, before, decision, reason };   // what Undo puts back
  announce(`${rec.record_id} ${DONE[decision]}${reason ? ", " + reason : ""}. Z to undo.`);
  SC.excl = false;
  if (SC.filter === "todo") SC.id = next ? next.record_id : null;
  render();
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
  await api("decide", { record_id: l.id, stage: l.stage, decision: l.before.decision, reason: l.before.reason, undo: true }, { silent: true });
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
    segmented([["ta", "Title / abstract"], ["ft", "Full text"]], SC.stage, v => { SC.stage = v; store.set("sc_stage", v); SC.id = null; if (SC.filter === "suggest" && !suggested(v).length) SC.filter = "todo"; render(); }, "Screening stage"),
    segmented([["todo", "To do"], ["all", "All"], ...(S.records.some(r => (r.notes || "").includes("[pilot]")) ? [["pilot", "Pilot"]] : []),
      ...(suggested().length ? [["suggest", `Suggested (${suggested().length})`]] : []),
      ...(SC.stage === "ta" && S.records.some(r => r.presort && r.ta_decision === "pending") ? [["presort", `Pre-sorted (${S.records.filter(r => r.presort && r.ta_decision === "pending").length})`]] : [])],
      SC.filter, v => { SC.filter = v; render(); }, "Show records"),
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
      h("h2", {}, total ? "Nothing left to screen here" : "No records yet"),
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
    const notes = h("input", { type: "text", placeholder: "e.g. other version of R0012", value: rec.notes || "",
      onchange: e => api("set_record", { record_id: rec.record_id, fields: { notes: e.target.value } }, { render: false, silent: true }) });
    main = h("div", { class: "card rec" },
      h("div", { class: "meta" }, h("b", { style: "font-family:var(--mono)" }, rec.record_id), rec.year ? pill(rec.year) : null, rec.journal ? h("span", {}, rec.journal) : null,
        rec.language && !/^english$/i.test(rec.language) ? pill("language: " + rec.language, "bad") : null,
        rec.publication ? pill("in your library", "accent") : null,
        cur && cur !== "pending" ? pill("decided: " + cur + (rec[rkey] ? " · " + rec[rkey] : ""), decKind(cur)) : null,
        rec.sample_ta && SC.stage === "ta" ? pill("in 2nd-reviewer sample", "info") : null),
      h("h2", {}, rec.title),
      h("button", { class: "file", style: "margin:-2px 0 6px", title: "This paper's note — your decision is written here", onclick: () => openNote(S.record_files[rec.record_id]) },
        "📝 ", S.record_files[rec.record_id] || "", h("span", { class: "muted" }, ` · ${SC.stage === "ta" ? "title_abstract_decision" : "full_text_decision"} is saved here`)),
      h("div", { class: "authors" }, rec.authors),
      h("div", { class: "row", style: "margin-top:8px" },
        rec.doi ? h("a", { href: "https://doi.org/" + rec.doi, target: "_blank", class: "btn sm" }, "DOI ↗") : null,
        rec.oa_url ? h("a", { href: rec.oa_url, target: "_blank", class: "btn sm" }, "Open access ↗") : null,
        SC.stage === "ft" ? pill(rec.pdf_status ? "PDF: " + rec.pdf_status : "PDF: not checked", rec.pdf_status === "found" ? "ok" : rec.pdf_status ? "bad" : "") : null),
      absBox,
      h("div", { style: "margin-top:12px" }, field("Note (optional)", notes)),
      decisionHistory(rec.record_id),
      decisionBar(rec, cur, reasonRow));
  }

  // the queue lists at most 400 records: those around the current one, so it is always in view
  const at = Math.max(0, q.findIndex(r => r.record_id === SC.id)), from = Math.max(0, Math.min(at - 100, q.length - 400));
  const shown = q.slice(from, from + 400);
  const side = h("div", {},
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
function decisionBar(rec, cur, reasonRow) {
  const last = lastDecision();
  const pressed = d => ({ "aria-pressed": String(cur === d) });
  return h("div", { class: "decide-bar" },
    h("div", { class: "decide-top" },
      last ? h("span", { class: "last-decision" }, decDot(last.decision), h("span", {}, h("b", {}, last.id), ` ${DONE[last.decision]}${last.reason ? " · " + last.reason : ""}`),
        btn(["↶ Undo ", h("kbd", {}, "Z")], undo, "sm ghost", `Put back the decision ${last.id} had before`))
        : h("span", { class: "kbdhint" }, "I include · U unsure · E exclude, then 1–9 reason · Z undo · ←/→ previous / next"),
      h("span", { class: "spacer" }),
      btn("← Previous", () => move(-1), "sm ghost", "Previous record (←)"), btn("Next →", () => move(1), "sm ghost", "Next record (→)")),
    h("div", { class: "decide" },
      h("button", { class: "inc" + (cur === "include" ? " on" : ""), ...pressed("include"), onclick: () => decide("include") }, "✓ Include", h("kbd", {}, "I")),
      SC.stage === "ta" ? h("button", { class: "uns" + (cur === "unsure" ? " on" : ""), ...pressed("unsure"), onclick: () => decide("unsure") }, "? Unsure", h("kbd", {}, "U"))
        : h("button", { class: "uns", onclick: () => api("mark_pdf", { record_id: rec.record_id, status: "not-retrieved" }) }, "⊘ Not retrieved"),
      h("button", { class: "exc" + (cur === "exclude" ? " on" : ""), ...pressed("exclude"), onclick: () => { SC.excl = true; reasonRow.style.display = ""; } }, "✕ Exclude", h("kbd", {}, "E"))),
    reasonRow);
}

function suggestView(q) {
  const batch = q.slice(0, 50);
  if (!batch.length) return h("div", { class: "card empty" }, h("div", { class: "big" }, "🎉"), h("h2", {}, "All suggestions reviewed"));
  const choice = D.sugg ??= {};
  const dec = r => r[aiKey("decision")], why = r => r[aiKey("why")], rsn = r => r[aiKey("reason")] || "";                       // record id -> "include" | "unsure" | "exclude:E1" …
  const opts = [["include", "Include"], ["unsure", "Unsure"], ...S.reasons[SC.stage].map(r => ["exclude:" + r.split(" ")[0], "Exclude " + r])];
  const val = r => choice[r.record_id] ?? (dec(r) === "exclude" ? "exclude:" + rsn(r) : dec(r));
  const order = { include: 0, unsure: 1, exclude: 2 };
  const rows = [...batch].sort((a, b) => order[dec(a)] - order[dec(b)] || rsn(a).localeCompare(rsn(b)));
  const counts = Counter => rows.reduce((m, r) => (m[val(r).split(":")[0]] = (m[val(r).split(":")[0]] || 0) + 1, m), {});
  const c = counts();
  const suggestHead = ["", "Record", "Claude suggests", "Your decision"].map(t => h("th", {}, t));
  return h("div", {},
    h("div", { class: "callout", style: "margin-bottom:12px" }, `Batch of ${batch.length} of ${q.length} remaining. Claude read each ${SC.stage === "ta" ? "abstract" : "full text"} and suggests a decision (cautious: unsure when in doubt). Check the suggestions — click a title to see the abstract — change any you disagree with, then confirm the batch. The decisions are recorded as yours; changes to suggestions are noted per record.`),
    h("div", { class: "row", style: "margin-bottom:10px" }, pill(`${c.include || 0} include`, "ok"), pill(`${c.unsure || 0} unsure`, "warn"), pill(`${c.exclude || 0} exclude`, "bad"),
      h("span", { style: "flex:1" }),
      btn(`✓ Confirm these ${batch.length} decisions`, async e => {
        if (!(await confirmBox("Confirm batch", `Save ${batch.length} decisions as yours?`, "Save"))) return;
        const items = batch.map(r => { const [d, reason] = val(r).split(":"); return { id: r.record_id, decision: d, reason: reason || "" }; });
        busy(e.target, () => api("apply_decisions", { items, stage: SC.stage }).then(() => { for (const r of batch) delete choice[r.record_id]; }));
      }, "primary")),
    h("table", { class: "tbl" }, h("tr", {}, suggestHead),
      rows.map(r => {
        const changed = choice[r.record_id] !== undefined && choice[r.record_id] !== (dec(r) === "exclude" ? "exclude:" + rsn(r) : dec(r));
        const id = h("b", { style: "font-family:var(--mono);font-size:12px" }, r.record_id);   // the choice is named by its column and this record
        const sel = labelBy(h("select", { onchange: e => { choice[r.record_id] = e.target.value; render(); } }, opts.map(([v, t]) => h("option", { value: v, selected: v === val(r) }, t))), [suggestHead[3], id]);
        const abs = h("div", { class: "small muted", style: "display:none;margin-top:6px;max-width:640px" });
        return h("tr", {},
          h("td", {}, decDot(val(r).split(":")[0])),
          h("td", { style: "max-width:560px" }, h("a", { href: "#", onclick: async e => {
            e.preventDefault();
            if (abs.style.display === "none") { if (!abs.textContent) { const j = await api("record_abstract", { record_id: r.record_id }, { silent: true }); abs.innerHTML = highlight(j.record.abstract || "No abstract."); } abs.style.display = ""; }
            else abs.style.display = "none";
          } }, id, " ", r.title), h("div", { class: "small muted" }, [r.year, r.journal].filter(Boolean).join(" · ")), abs),
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
