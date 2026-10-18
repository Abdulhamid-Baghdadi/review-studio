/**
 * Page: The Homepage.
 * @module web/studio/pages/home
 */
import { h, store } from "../core/dom.js";
import { S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { go, stepOf } from "../shell/navigation.js";
import { openFinishedExample } from "../shell/reviews.js";
import { startTour } from "../shell/tour.js";
import { svg } from "../ui/charts.js";
import { btn, card, hlQuery } from "../ui/components.js";

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
// Homepage: only explains, and offers three ways in. The work itself happens on the steps.
PAGES.home = () => {
  const last = store.get("last_stage", ""), lastStage = S.stages.find(x => x.key === last);
  const started = lastStage && (S.events.length || S.records.length);
  const choice = (icon, title, text, onclick, cls = "") => h("button", { class: "home-choice " + cls, onclick },
    h("span", { class: "hc-icon", "aria-hidden": "true" }, icon), h("span", { class: "hc-title" }, title), h("span", { class: "hc-text" }, text));
  return h("div", { class: "home" },
    h("div", { class: "home-choices" },
      started ? choice("▶", `Continue: ${stepOf(last).title}`, "Pick up where you left off.", () => go(last), "primary")
        : choice("▶", "Start your review", "Step 1: write down your research question.", () => go("questions"), "primary"),
      choice("📘", "See a finished example", "A real search of 61 records, screened down to 10 included studies.", openFinishedExample),
      choice("🎓", "Take the 1-minute tour", "What each part of the screen is for.", () => { go("questions"); setTimeout(() => startTour(), 250); })),
    card("How a review goes", "Five phases, one minute. Click a part of the circle to jump to it.", homeDemo()),
    h("p", { class: "home-foot small muted" }, "📝 Plain Markdown notes and CSV tables · 🟣 opens in Obsidian · 🔒 nothing is uploaded, no account · ",
      h("a", { href: "https://github.com/Abdulhamid-Baghdadi/systematic-review-workbench/releases/latest/download/systematic-review-workbench.zip" }, "💾 desktop version")));
};

/** Opens the finished example review (backend.exampleEntry), on its Report step: the result first, Back walks through it. */
