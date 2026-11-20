/**
 * Pairwise weight helper (AHP-lite). For every pair (a, b) the user picks one of five answers;
 * weights are the normalised geometric means of the comparison-matrix rows.
 */

/** Answer → how much more a matters than b. −2 = a by a lot … +2 = b by a lot. */
export const PAIR_RATIO: Record<-2 | -1 | 0 | 1 | 2, number> = { [-2]: 5, [-1]: 3, 0: 1, 1: 1 / 3, 2: 1 / 5 };
export type PairAnswer = keyof typeof PAIR_RATIO;

/** Saaty's random consistency index by matrix size. */
export const RANDOM_INDEX = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];
export const CR_WARN = 0.1;

export function allPairs(n: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
  return pairs;
}

export interface PairwiseResult {
  weights: number[];
  /** Consistency ratio; above 0.1 the answers contradict each other. */
  cr: number;
  consistent: boolean;
}

export function pairwiseWeights(n: number, answers: readonly (PairAnswer | null)[]): PairwiseResult {
  const A = Array.from({ length: n }, () => new Array<number>(n).fill(1));
  allPairs(n).forEach(([a, b], k) => {
    const r = PAIR_RATIO[answers[k] ?? 0];
    A[a]![b] = r;
    A[b]![a] = 1 / r;
  });
  const g = A.map((row) =>
    Math.pow(
      row.reduce((x, y) => x * y, 1),
      1 / n,
    ),
  );
  const total = g.reduce((x, y) => x + y, 0);
  const w = g.map((x) => x / total);
  const lambda = A.reduce((acc, row, i) => acc + row.reduce((s, v, j) => s + v * w[j]!, 0) / w[i]!, 0) / n;
  const cr = n > 2 ? (lambda - n) / (n - 1) / (RANDOM_INDEX[n] ?? 1.49) : 0;
  return { weights: w, cr, consistent: cr <= CR_WARN };
}

/** Convert helper weights to the 0–100 raw importances the sliders use (minimum 1, as in the prototype). */
export const toRawWeights = (w: readonly number[]) => w.map((x) => Math.max(1, Math.round(x * 100)));
