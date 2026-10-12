/**
 * Meta-analysis of one outcome: effect sizes per study (two-group binary, two-group continuous, or an
 * effect with its 95% CI), inverse-variance pooling (fixed effect, or random effects with the
 * DerSimonian–Laird τ² and optionally the Hartung–Knapp adjustment), heterogeneity, a prediction interval
 * and Egger's regression test. Formulas follow metafor (escalc, rma), so results can be checked in R.
 * @module domain/meta-analysis
 */
import { chiSquareP, logGamma, normalP, normalQuantile, tP, tQuantile } from "./statistics.js";

/** Outcome data types, their effect measures and the numbers asked per study. */
export const OUTCOME_TYPES = Object.freeze({
  binary: { label: "Two groups, events / total", measures: ["RR", "OR", "RD"], columns: ["e1", "n1", "e2", "n2"] },
  continuous: { label: "Two groups, mean / SD / n", measures: ["MD", "SMD"], columns: ["m1", "sd1", "n1", "m2", "sd2", "n2"] },
  generic: { label: "Effect and 95% CI per study", measures: ["ratio", "difference"], columns: ["est", "lo", "hi"] },
});

/** Effect measures: label, and whether they are pooled on the log scale (ratios). */
export const MEASURES = Object.freeze({
  RR: { label: "Risk ratio", log: true }, OR: { label: "Odds ratio", log: true }, RD: { label: "Risk difference", log: false },
  MD: { label: "Mean difference", log: false }, SMD: { label: "Standardised mean difference (Hedges' g)", log: false },
  ratio: { label: "Ratio (e.g. HR, adjusted OR)", log: true }, difference: { label: "Difference", log: false },
});

const Z95 = normalQuantile(0.975);
const num = v => (v === "" || v === null || v === undefined ? NaN : Number(String(v).replace(",", ".")));

/**
 * One study's effect on the analysis scale (log for ratios), or why it cannot be used.
 * @param {"binary"|"continuous"|"generic"} type @param {string} measure @param {object} row
 * @returns {{yi: number, vi: number} | {skip: string}}
 */
export function effectSize(type, measure, row) {
  if (type === "binary") {
    let [a, n1, c, n2] = ["e1", "n1", "e2", "n2"].map(k => num(row[k]));
    if (![a, n1, c, n2].every(Number.isFinite)) return { skip: "numbers missing" };
    if (n1 <= 0 || n2 <= 0 || a < 0 || c < 0 || a > n1 || c > n2) return { skip: "events must be between 0 and the group size" };
    let b = n1 - a, d = n2 - c;
    if (measure !== "RD" && ((a === 0 && c === 0) || (b === 0 && d === 0))) return { skip: "no events (or all events) in both groups" };
    if (measure !== "RD" && Math.min(a, b, c, d) === 0) { a += 0.5; b += 0.5; c += 0.5; d += 0.5; n1 += 1; n2 += 1; }
    if (measure === "RR") return { yi: Math.log((a / n1) / (c / n2)), vi: 1 / a - 1 / n1 + 1 / c - 1 / n2 };
    if (measure === "OR") return { yi: Math.log((a * d) / (b * c)), vi: 1 / a + 1 / b + 1 / c + 1 / d };
    const p1 = a / n1, p2 = c / n2;
    return { yi: p1 - p2, vi: p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2 };
  }
  if (type === "continuous") {
    const [m1, sd1, n1, m2, sd2, n2] = ["m1", "sd1", "n1", "m2", "sd2", "n2"].map(k => num(row[k]));
    if (![m1, sd1, n1, m2, sd2, n2].every(Number.isFinite)) return { skip: "numbers missing" };
    if (n1 < 2 || n2 < 2 || sd1 <= 0 || sd2 <= 0) return { skip: "each group needs n ≥ 2 and SD > 0" };
    if (measure === "MD") return { yi: m1 - m2, vi: sd1 * sd1 / n1 + sd2 * sd2 / n2 };
    const m = n1 + n2 - 2;
    const sp = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / m);
    const j = Math.exp(logGamma(m / 2) - 0.5 * Math.log(m / 2) - logGamma((m - 1) / 2));
    const g = j * (m1 - m2) / sp;
    return { yi: g, vi: 1 / n1 + 1 / n2 + g * g / (2 * (n1 + n2)) };
  }
  const [est, lo, hi] = ["est", "lo", "hi"].map(k => num(row[k]));
  if (![est, lo, hi].every(Number.isFinite)) return { skip: "numbers missing" };
  if (!(lo < est && est < hi)) return { skip: "the estimate must lie inside its CI" };
  if (measure === "ratio") {
    if (lo <= 0) return { skip: "ratios and their CI must be above 0" };
    const se = (Math.log(hi) - Math.log(lo)) / (2 * Z95);
    return { yi: Math.log(est), vi: se * se };
  }
  const se = (hi - lo) / (2 * Z95);
  return { yi: est, vi: se * se };
}

/**
 * Inverse-variance pooling.
 * @param {{yi: number, vi: number}[]} effects
 * @param {{model?: "random"|"fixed", hk?: boolean}} [options]
 */
export function pool(effects, { model = "random", hk = false } = {}) {
  const k = effects.length;
  if (!k) return null;
  const y = effects.map(e => e.yi), v = effects.map(e => e.vi);
  const w = v.map(x => 1 / x), sw = w.reduce((s, x) => s + x, 0);
  const fixed = w.reduce((s, x, i) => s + x * y[i], 0) / sw;
  const q = w.reduce((s, x, i) => s + x * (y[i] - fixed) ** 2, 0);
  const df = k - 1;
  const c = sw - w.reduce((s, x) => s + x * x, 0) / sw;
  const tau2 = model === "random" && k > 1 ? Math.max(0, (q - df) / c) : 0;
  const i2 = k > 1 && q > 0 ? Math.max(0, (q - df) / q) * 100 : 0;
  const ws = v.map(x => 1 / (x + tau2)), sws = ws.reduce((s, x) => s + x, 0);
  const est = ws.reduce((s, x, i) => s + x * y[i], 0) / sws;
  let se = Math.sqrt(1 / sws), crit = Z95, p, test = "z";
  if (model === "random" && hk && k > 1) {
    se = Math.sqrt(ws.reduce((s, x, i) => s + x * (y[i] - est) ** 2, 0) / (k - 1) / sws);
    crit = tQuantile(0.975, k - 1);
    p = tP(est / se, k - 1);
    test = "t";
  } else p = normalP(est / se);
  const result = {
    k, model, hk: test === "t", est, se, lo: est - crit * se, hi: est + crit * se, p, test,
    q, df, pQ: k > 1 ? chiSquareP(q, df) : NaN, i2, tau2, weights: ws.map(x => (x / sws) * 100),
  };
  if (model === "random" && k >= 3) {
    const half = tQuantile(0.975, k - 2) * Math.sqrt(tau2 + se * se);
    result.pi = [est - half, est + half];
  }
  return result;
}

/** Egger's regression test for small-study effects (standardised effect on precision; intercept tested). */
export function eggerTest(effects) {
  const k = effects.length;
  if (k < 3) return null;
  const xs = effects.map(e => 1 / Math.sqrt(e.vi)), ys = effects.map(e => e.yi / Math.sqrt(e.vi));
  const mx = xs.reduce((s, x) => s + x, 0) / k, my = ys.reduce((s, x) => s + x, 0) / k;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
  const intercept = my - slope * mx;
  const rss = xs.reduce((s, x, i) => s + (ys[i] - intercept - slope * x) ** 2, 0);
  const seIntercept = Math.sqrt(rss / (k - 2) * (1 / k + mx * mx / sxx));
  const t = intercept / seIntercept;
  return { intercept, se: seIntercept, t, df: k - 2, p: tP(t, k - 2) };
}

/** A value on the analysis scale as the reader sees it (ratios back-transformed). */
export const shown = (measure, x) => (MEASURES[measure]?.log ? Math.exp(x) : x);

/**
 * The whole analysis of one outcome.
 * @param {object} outcome {type, measure, model, hk, rows: [{record_id, ...numbers}]}
 * @returns {{studies: object[], used: object[], pooled: object|null, egger: object|null, totals: {participants: number, events: number}}}
 */
export function analyseOutcome(outcome) {
  const studies = (outcome.rows ?? []).map(row => ({ row, ...effectSize(outcome.type, outcome.measure, row) }));
  const used = studies.filter(s => !s.skip);
  const pooled = pool(used, { model: outcome.model ?? "random", hk: Boolean(outcome.hk) });
  if (pooled) used.forEach((s, i) => { s.weight = pooled.weights[i]; });
  const total = keys => used.reduce((s, x) => s + keys.reduce((t, k) => t + (num(x.row[k]) || 0), 0), 0);
  return {
    studies, used, pooled, egger: eggerTest(used),
    totals: { participants: total(["n1", "n2"]), events: outcome.type === "binary" ? total(["e1", "e2"]) : 0 },
  };
}
