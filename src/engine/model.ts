/**
 * The deterministic core: normalised weights, derived 1–10 scores, totals,
 * deal-breakers and the ranking. Ported exactly from prototype/index.html.
 */
import type { Criterion, Decision } from './types';

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Sanitise a 1–10 rating: non-finite becomes 5, everything else is clamped. */
export const toScore = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? clamp(v, 1, 10) : 5;
};

/** w_i = max(0, weight_i) / Σ. If every weight is zero (or there are none), use equal weights. */
export function normaliseWeights(weights: readonly number[]): number[] {
  const pos = weights.map((w) => (Number.isFinite(w) ? Math.max(0, w) : 0));
  const total = pos.reduce((a, b) => a + b, 0);
  return pos.map((w) => (total > 0 ? w / total : 1 / pos.length));
}

/**
 * Derived 1–10 score for each option on one criterion.
 * Score mode: the clamped rating.
 * Value mode: ratio scaling when every value is positive (best = 10, half as good = 5),
 * otherwise min–max scaling 1 + 9·r. All-equal values all get 10. A missing value counts as 5.
 */
export function deriveScores(c: Pick<Criterion, 'mode' | 'scores' | 'values' | 'direction'>): number[] {
  if (c.mode !== 'value') return c.scores.map(toScore);
  const v = c.values.map((x) => (x === null || !Number.isFinite(x) ? NaN : x));
  const ok = v.filter(Number.isFinite);
  if (!ok.length) return v.map(() => 5);
  const mn = Math.min(...ok);
  const mx = Math.max(...ok);
  return v.map((x) => {
    if (!Number.isFinite(x)) return 5;
    if (mn > 0) return clamp(c.direction > 0 ? (10 * x) / mx : (10 * mn) / x, 1, 10);
    if (mx === mn) return 10;
    const r = (x - mn) / (mx - mn);
    return 1 + 9 * (c.direction > 0 ? r : 1 - r);
  });
}

/** Does option j pass criterion c's deal-breaker? A missing raw value never fails. */
export function passesDealBreaker(c: Criterion, j: number, derived: readonly number[]): boolean {
  if (c.dealBreaker === null) return true;
  if (c.mode === 'value') {
    const v = c.values[j];
    if (v === null || v === undefined) return true;
    return c.direction > 0 ? v >= c.dealBreaker : v <= c.dealBreaker;
  }
  return (derived[j] ?? 5) >= c.dealBreaker;
}

export interface Model {
  decision: Decision;
  /** Number of options. */
  n: number;
  /** D[i][j]: derived 1–10 score of option j on criterion i. */
  D: number[][];
  /** Normalised weights, summing to 1. */
  wn: number[];
  /** S[j] = Σ_i wn[i]·D[i][j] */
  S: number[];
  /** For each option, the indices of criteria whose deal-breaker it fails. */
  fails: number[][];
  eligible: boolean[];
  /** All options, best first (ties keep original order). */
  order: number[];
  /** Eligible options only, best first. */
  eo: number[];
  /** Leader index among eligible options (undefined if none pass). */
  leader: number | undefined;
  /** Runner-up index among eligible options. */
  runnerUp: number | undefined;
  /** S[leader] − S[runnerUp], 0 if fewer than two eligible options. */
  gap: number;
  /** Two eligible options within 0.005 points of each other. */
  tie: boolean;
  /** Every raw weight is zero, so equal weights are in use. */
  zeroWeights: boolean;
}

export const TIE_EPS = 0.005;

export function computeModel(decision: Decision): Model {
  const C = decision.criteria;
  const n = decision.options.length;
  const D = C.map(deriveScores);
  const raw = C.map((c) => c.weight);
  const wn = normaliseWeights(raw);
  const S = decision.options.map((_, j) => C.reduce((a, _c, i) => a + wn[i]! * D[i]![j]!, 0));
  const fails = decision.options.map((_, j) => C.map((c, i) => (passesDealBreaker(c, j, D[i]!) ? -1 : i)).filter((i) => i >= 0));
  const eligible = fails.map((f) => f.length === 0);
  const order = decision.options.map((_, j) => j).sort((a, b) => S[b]! - S[a]! || a - b);
  const eo = order.filter((j) => eligible[j]);
  const leader = eo[0];
  const runnerUp = eo[1];
  const gap = leader !== undefined && runnerUp !== undefined ? S[leader]! - S[runnerUp]! : 0;
  return {
    decision,
    n,
    D,
    wn,
    S,
    fails,
    eligible,
    order,
    eo,
    leader,
    runnerUp,
    gap,
    tie: runnerUp !== undefined && gap < TIE_EPS,
    zeroWeights: raw.reduce((a, w) => a + Math.max(0, Number.isFinite(w) ? w : 0), 0) <= 0,
  };
}

/** Totals for every option under an arbitrary set of normalised weights (same derived scores). */
export const weightedTotalsFor = (m: Pick<Model, 'D' | 'n'>, w: readonly number[]) =>
  Array.from({ length: m.n }, (_, j) => m.D.reduce((a, row, i) => a + (w[i] ?? 0) * row[j]!, 0));

/** Weighted points each criterion adds to each option: contribution[i][j] = wn[i]·D[i][j]. */
export const contributions = (m: Model) => m.D.map((row, i) => row.map((d) => m.wn[i]! * d));
