/**
 * Page: Citation search.
 * @module web/studio/pages/snowballing
 */
import { api, busy } from "../core/api.js";
import { h } from "../core/dom.js";
import { S } from "../core/state.js";
import { PAGES } from "../shell/registry.js";
import { bar, btn, card, field } from "../ui/components.js";

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
