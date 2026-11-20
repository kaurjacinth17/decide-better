/** Gut check: why the criteria disagree with the user's lean, and what would change that. */
import { clamp, type Model } from './model';
import { lines, MAX_FLIP_T } from './sensitivity';

export interface GutFlip {
  i: number;
  t: number;
  dir: 1 | -1;
  d: number;
}

export interface GutAnalysis {
  /** Criterion contributing most to the leader's advantage over the gut pick (−1 if none). */
  biggest: number;
  /** wn[biggest]·(D[biggest][leader] − D[biggest][gut]) */
  biggestValue: number;
  /** Smallest single weight change that makes the gut pick the overall leader. */
  flip: GutFlip | null;
}

export function gutAnalysis(m: Model, g: number): GutAnalysis {
  const { D, wn, leader, eo } = m;
  let biggest = -1;
  let biggestValue = 0;
  let flip: GutFlip | null = null;
  if (leader === undefined) return { biggest, biggestValue, flip };
  m.decision.criteria.forEach((_, i) => {
    const v = wn[i]! * (D[i]![leader]! - D[i]![g]!);
    if (v > biggestValue) {
      biggestValue = v;
      biggest = i;
    }
  });
  m.decision.criteria.forEach((_, i) => {
    const L = lines(m, i);
    if (!L) return;
    const a = L[g]![0] - L[leader]![0];
    const b = L[g]![1] - L[leader]![1];
    if (Math.abs(b) < 1e-12) return;
    const t = -a / b;
    if (t < 0 || t >= MAX_FLIP_T) return;
    // Step just past the crossing and check the gut pick beats every eligible option there.
    const tt = clamp(t + (b > 0 ? 0.003 : -0.003), 0, 1);
    const val = (j: number) => L[j]![0] + tt * L[j]![1];
    if (eo.every((j) => j === g || val(g) >= val(j))) {
      const d = Math.abs(t - wn[i]!);
      if (!flip || d < flip.d) flip = { i, t, dir: b > 0 ? 1 : -1, d };
    }
  });
  return { biggest, biggestValue, flip };
}
