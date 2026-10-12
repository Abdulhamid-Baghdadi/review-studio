/**
 * GRADE certainty of the evidence for one outcome: suggested downgrades per domain from the data (risk of
 * bias ratings weighted by the meta-analysis, I², the confidence interval and the optimal information size,
 * Egger's test), the reviewer's confirmed judgements, and the resulting certainty.
 * The suggestions are rules of thumb from the GRADE handbook; the reviewer decides every domain.
 * @module domain/grade
 */
export const GRADE_DOMAINS = Object.freeze([
  ["rob", "Risk of bias"], ["inconsistency", "Inconsistency"], ["indirectness", "Indirectness"],
  ["imprecision", "Imprecision"], ["publication", "Publication bias"],
]);

export const CERTAINTY = Object.freeze({ 4: "High", 3: "Moderate", 2: "Low", 1: "Very low" });
export const CERTAINTY_SYMBOL = Object.freeze({ 4: "⊕⊕⊕⊕", 3: "⊕⊕⊕◯", 2: "⊕⊕◯◯", 1: "⊕◯◯◯" });

const pct = x => `${Math.round(x)}%`;

/**
 * Suggested downgrade (0, -1 or -2) and the reason for each domain.
 * @param {object} outcome {type, measure, design}
 * @param {ReturnType<import("./meta-analysis.js").analyseOutcome>} analysis
 * @param {Map<string, string>} ratings overall risk-of-bias rating by record id ("low", "some concerns", "high", …)
 * @returns {Record<string, {level: number, reason: string}>}
 */
export function suggestGrade(outcome, analysis, ratings) {
  const { used, pooled, egger, totals } = analysis;
  const out = {};
  if (!pooled) {
    for (const [key] of GRADE_DOMAINS) out[key] = { level: 0, reason: "No studies with usable data yet." };
    return out;
  }
  // Risk of bias: share of the weight from studies at high risk or with concerns.
  const share = pick => used.filter(s => pick(String(ratings.get(s.row.record_id) ?? "").toLowerCase())).reduce((t, s) => t + s.weight, 0);
  const high = share(r => r === "high"), concerns = share(r => r !== "low" && r !== "high");
  out.rob = high >= 50
    ? { level: -2, reason: `${pct(high)} of the weight comes from studies at high risk of bias.` }
    : high + concerns >= 50
      ? { level: -1, reason: `${pct(high + concerns)} of the weight comes from studies at high risk, with some concerns, or not yet rated.` }
      : { level: 0, reason: `Most of the weight (${pct(100 - high - concerns)}) comes from studies at low risk of bias.` };

  out.inconsistency = pooled.k < 2 ? { level: 0, reason: "Single study: inconsistency cannot be judged." }
    : pooled.i2 >= 50 ? { level: -1, reason: `Substantial heterogeneity (I² = ${pooled.i2.toFixed(0)}%, τ² = ${pooled.tau2.toFixed(3)}); check whether the study estimates point in different directions and whether subgroups explain it.` }
      : { level: 0, reason: `Little heterogeneity (I² = ${pooled.i2.toFixed(0)}%).` };

  out.indirectness = { level: 0, reason: "Judge by hand: do the populations, interventions, comparators and outcome measures match the review question?" };

  const crosses = pooled.lo < 0 && pooled.hi > 0;     // no effect is 0 on the analysis scale (log 1 for ratios)
  const ois = outcome.type === "binary" ? [totals.events < 300, `${totals.events} events (fewer than ~300)`]
    : outcome.type === "continuous" ? [totals.participants < 400, `${totals.participants} participants (fewer than ~400)`] : [false, ""];
  const reasons = [crosses && "the 95% CI includes no effect", ois[0] && ois[1]].filter(Boolean);
  out.imprecision = { level: -reasons.length, reason: reasons.length ? `Imprecise: ${reasons.join("; ")}.` : "The 95% CI excludes no effect and the information size is adequate." };

  out.publication = pooled.k < 10 ? { level: 0, reason: `Only ${pooled.k} stud${pooled.k === 1 ? "y" : "ies"}: too few for a funnel plot or Egger's test (≥ 10); judge from how complete the search was.` }
    : egger && egger.p < 0.1 ? { level: -1, reason: `Egger's test suggests small-study effects (p = ${egger.p.toFixed(3)}); check the funnel plot.` }
      : { level: 0, reason: `No sign of small-study effects (Egger's p = ${egger ? egger.p.toFixed(3) : "—"}).` };
  return out;
}

/**
 * The certainty: start high for randomised trials and low for observational studies, minus the
 * downgrades (the reviewer's judgement where given, else the suggestion).
 * @param {object} outcome {design: "rct"|"obs", grade: {domain: {level, reason, confirmed}}}
 * @param {Record<string, {level: number}>} suggested
 * @returns {{score: 1|2|3|4, label: string, symbol: string, confirmed: boolean, domains: object}}
 */
export function certainty(outcome, suggested) {
  const start = outcome.design === "obs" ? 2 : 4;
  const domains = Object.fromEntries(GRADE_DOMAINS.map(([key]) => {
    const mine = outcome.grade?.[key];
    return [key, mine?.confirmed ? { ...mine, suggested: suggested[key] } : { level: suggested[key]?.level ?? 0, reason: suggested[key]?.reason ?? "", confirmed: false, suggested: suggested[key] }];
  }));
  const score = Math.max(1, Math.min(4, start + Object.values(domains).reduce((s, d) => s + Number(d.level || 0), 0)));
  return { score, label: CERTAINTY[score], symbol: CERTAINTY_SYMBOL[score], confirmed: Object.values(domains).every(d => d.confirmed), domains };
}
