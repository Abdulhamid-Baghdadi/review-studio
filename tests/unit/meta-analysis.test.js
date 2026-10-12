import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseOutcome, effectSize, pool } from "../../src/domain/meta-analysis.js";
import { chiSquareP, normalCdf, normalQuantile, tQuantile } from "../../src/domain/statistics.js";

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected}`);

// metafor's dat.bcg: BCG vaccine trials (tpos, tneg, cpos, cneg).
const BCG = [[4, 119, 11, 128], [6, 300, 29, 274], [3, 228, 11, 209], [62, 13536, 248, 12619], [33, 5036, 47, 5761],
  [180, 1361, 372, 1079], [8, 2537, 10, 619], [505, 87886, 499, 87892], [29, 7470, 45, 7232], [17, 1699, 65, 1600],
  [186, 50448, 141, 27197], [5, 2493, 3, 2338], [27, 16886, 29, 17825]]
  .map(([a, b, c, d], i) => ({ record_id: `R${i}`, e1: a, n1: a + b, e2: c, n2: c + d }));

test("statistics: normal, t and chi-square", () => {
  near(normalQuantile(0.975), 1.959963984540054, 1e-9, "z 0.975");
  near(normalCdf(1.959963984540054), 0.975, 1e-9, "Φ");
  near(tQuantile(0.975, 12), 2.178812829667228, 1e-8, "t 12");
  near(tQuantile(0.975, 2), 4.302652729911275, 1e-8, "t 2");
  near(chiSquareP(3.841458820694124, 1), 0.05, 1e-9, "χ² 1");
});

test("meta-analysis: BCG trials match metafor (log risk ratio)", () => {
  const re = analyseOutcome({ type: "binary", measure: "RR", model: "random", rows: BCG });
  // rma(yi, vi, data = escalc("RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg), method = "DL")
  near(re.pooled.est, -0.7141, 5e-4, "DL estimate");
  near(re.pooled.se, 0.1787, 5e-4, "DL se");
  near(re.pooled.tau2, 0.3088, 5e-4, "τ²");
  near(re.pooled.i2, 92.12, 0.01, "I²");
  near(re.pooled.q, 152.2330, 1e-3, "Q");
  const fe = pool(re.used, { model: "fixed" });
  near(fe.est, -0.4303, 5e-4, "FE estimate");
  near(fe.se, 0.0405, 5e-4, "FE se");
  assert.equal(re.used.length, 13);
  near(re.used.reduce((s, x) => s + x.weight, 0), 100, 1e-9, "weights sum to 100");
});

test("meta-analysis: effect sizes and skipped studies", () => {
  const md = effectSize("continuous", "MD", { m1: 10, sd1: 2, n1: 20, m2: 8, sd2: 3, n2: 25 });
  near(md.yi, 2, 1e-12, "MD"); near(md.vi, 4 / 20 + 9 / 25, 1e-12, "MD var");
  const g = effectSize("continuous", "SMD", { m1: 10, sd1: 2, n1: 20, m2: 8, sd2: 2, n2: 20 });
  near(g.yi, 0.98 , 0.005, "Hedges' g");             // d = 1, J ≈ 0.980
  const hr = effectSize("generic", "ratio", { est: 0.8, lo: 0.64, hi: 1.0 });
  near(Math.exp(hr.yi), 0.8, 1e-12, "ratio");
  near(Math.sqrt(hr.vi), (Math.log(1) - Math.log(0.64)) / (2 * 1.959963984540054), 1e-12, "ratio se");
  assert.ok(effectSize("binary", "RR", { e1: 0, n1: 10, e2: 0, n2: 12 }).skip);
  assert.ok(Number.isFinite(effectSize("binary", "OR", { e1: 0, n1: 10, e2: 3, n2: 12 }).yi), "zero cell corrected");
  assert.ok(effectSize("generic", "ratio", { est: 2, lo: 3, hi: 4 }).skip);
  assert.ok(effectSize("binary", "RR", { e1: "", n1: 10, e2: 1, n2: 10 }).skip);
});

test("meta-analysis: Hartung–Knapp and prediction interval", () => {
  const r = analyseOutcome({ type: "binary", measure: "RR", model: "random", hk: true, rows: BCG });
  assert.equal(r.pooled.test, "t");
  assert.ok(r.pooled.hi - r.pooled.lo > 0);
  assert.ok(r.pooled.pi[0] < r.pooled.lo && r.pooled.pi[1] > r.pooled.hi);
  const one = analyseOutcome({ type: "binary", measure: "RR", rows: BCG.slice(0, 1) });
  assert.equal(one.pooled.k, 1); assert.equal(one.pooled.tau2, 0); assert.equal(one.pooled.pi, undefined);
});
