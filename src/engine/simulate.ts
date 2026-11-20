/**
 * Monte Carlo robustness check, ported exactly from the prototype (same seeds, same
 * draw order) so results are reproducible and don't jitter as the user types.
 */
import { clamp, type Model } from './model';

export const CERTAINTY = [
  { label: 'Sure', halfWidth: 0.5 },
  { label: 'Fairly sure', halfWidth: 1.5 },
  { label: 'Guessing', halfWidth: 3 },
] as const;

export const SIM_RUNS = 2000;
export const ATTR_RUNS = 400;
export const WEIGHT_NOISE = 0.25;
export const SEEDS = { main: 20261120, attr: (i: number) => 777 + i * 31, weights: 4242 } as const;

/** mulberry32: a tiny, fast, seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Triangular noise on [−1, 1], peaked at 0. */
const tri = (g: () => number) => g() + g() - 1;

/** The subset of the model the simulation needs. Plain data, so it can cross a worker boundary. */
export interface SimInput {
  D: number[][];
  wn: number[];
  S: number[];
  eo: number[];
  leader: number;
  n: number;
  certainty: number[];
  varyWeights: boolean;
}

export interface SimResult {
  /** Win probability per option (ruled-out options get 0). */
  p: number[];
  /** Per criterion: how often doubt about that criterion alone hands the lead to another option. */
  attr: number[];
  /** How often varying only the weights flips the leader (null if weight noise is off). */
  weightFlip: number | null;
  N: number;
}

export function toSimInput(m: Model): SimInput | null {
  if (m.leader === undefined || m.eo.length < 2) return null;
  return {
    D: m.D,
    wn: m.wn,
    S: m.S,
    eo: m.eo,
    leader: m.leader,
    n: m.n,
    certainty: m.decision.criteria.map((c) => c.certainty),
    varyWeights: m.decision.varyWeights,
  };
}

export function simulate(inp: SimInput): SimResult {
  const { D, wn, S, eo, leader } = inp;
  const nC = wn.length;
  const wv = inp.varyWeights ? WEIGHT_NOISE : 0;
  const h = inp.certainty.map((c) => CERTAINTY[c as 0 | 1 | 2]?.halfWidth ?? 1.5);
  const r = mulberry32(SEEDS.main);
  const wins = new Array<number>(inp.n).fill(0);

  for (let k = 0; k < SIM_RUNS; k++) {
    const ws = wn.map((w) => w * (1 + wv * tri(r)));
    const t = ws.reduce((a, b) => a + b, 0) || 1;
    let best = -1;
    let bs = -1e9;
    for (const j of eo) {
      let s = 0;
      for (let i = 0; i < nC; i++) s += (ws[i]! / t) * clamp(D[i]![j]! + h[i]! * tri(r), 1, 10);
      if (s > bs) {
        bs = s;
        best = j;
      }
    }
    wins[best]!++;
  }

  const attr = wn.map((_, i) => {
    const g = mulberry32(SEEDS.attr(i));
    let f = 0;
    for (let k = 0; k < ATTR_RUNS; k++) {
      let best = -1;
      let bs = -1e9;
      for (const j of eo) {
        const s = S[j]! + wn[i]! * (clamp(D[i]![j]! + h[i]! * tri(g), 1, 10) - D[i]![j]!);
        if (s > bs) {
          bs = s;
          best = j;
        }
      }
      if (best !== leader) f++;
    }
    return f / ATTR_RUNS;
  });

  let weightFlip: number | null = null;
  if (wv) {
    const g = mulberry32(SEEDS.weights);
    let f = 0;
    for (let k = 0; k < ATTR_RUNS; k++) {
      const ws = wn.map((w) => w * (1 + wv * tri(g)));
      const t = ws.reduce((a, b) => a + b, 0) || 1;
      let best = -1;
      let bs = -1e9;
      for (const j of eo) {
        let s = 0;
        for (let i = 0; i < nC; i++) s += (ws[i]! / t) * D[i]![j]!;
        if (s > bs) {
          bs = s;
          best = j;
        }
      }
      if (best !== leader) f++;
    }
    weightFlip = f / ATTR_RUNS;
  }

  return { p: wins.map((x) => x / SIM_RUNS), attr, weightFlip, N: SIM_RUNS };
}

export type ConfidenceKey = 'robust' | 'likely' | 'fragile' | 'coin';
export interface Confidence {
  key: ConfidenceKey;
  label: string;
}

/** Robust ≥ 85%, Likely ≥ 65%, Fragile ≥ 50%, Coin flip below 50% or an exact tie. */
export function confidenceLabel(p: number, tie = false): Confidence {
  if (tie) return { key: 'coin', label: 'Coin flip' };
  if (p >= 0.85) return { key: 'robust', label: 'Robust' };
  if (p >= 0.65) return { key: 'likely', label: 'Likely' };
  if (p >= 0.5) return { key: 'fragile', label: 'Fragile' };
  return { key: 'coin', label: 'Coin flip' };
}
