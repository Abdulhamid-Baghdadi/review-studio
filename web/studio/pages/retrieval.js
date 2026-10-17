/**
 * Page: Full texts.
 * @module web/studio/pages/retrieval
 */
import { api, busy, upload } from "../core/api.js";
import { h } from "../core/dom.js";
import { D, S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { render } from "../shell/chrome.js";
import { btn, card, pill, segmented } from "../ui/components.js";

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
        segmented([["find", `To find (${n("find")})`], ["found", `Found (${n("found")})`], ["not", `Not retrieved (${n("not")})`], ["all", "All"]], f, v => { D.rfilter = v; render(); }, "Show papers"),
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
