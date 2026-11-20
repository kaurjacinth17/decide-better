/**
 * One-weight sensitivity. Moving criterion i's normalised weight to t and scaling the
 * others by (1−t)/(1−w_i) makes every option's total linear in t:
 *   f_j(t) = R_j + t·(d_ij − R_j),  R_j = (S_j − w_i·d_ij)/(1 − w_i)
 * so the exact weight at which a rival catches the leader is a line crossing.
 */
import type { Model } from './model';

/** Flips at or beyond this weight are ignored (a criterion would be ~everything). */
export const MAX_FLIP_T = 0.995;

/** [intercept R_j, slope d_ij − R_j] per option, or null if w_i ≈ 1 (no room to move). */
export function lines(m: Model, i: number): [number, number][] | null {
  const w = m.wn[i]!;
  if (w > 0.999) return null;
  return m.S.map((s, j) => {
    const d = m.D[i]![j]!;
    const R = (s - w * d) / (1 - w);
    return [R, d - R];
  });
}

export const lineAt = (L: [number, number][], j: number, t: number) => L[j]![0] + t * L[j]![1];

/** Normalised weights after setting criterion i to t and rescaling the rest proportionally. */
export function reweight(wn: readonly number[], i: number, t: number): number[] {
  const w = wn[i]!;
  if (wn.length === 1) return [1];
  return wn.map((x, k) => (k === i ? t : w >= 1 ? (1 - t) / (wn.length - 1) : (x * (1 - t)) / (1 - w)));
}

export interface CriterionSensitivity {
  i: number;
  now: number;
  /** Nearest weight above `now` at which another option takes the lead. */
  up: number | null;
  upTo: number | null;
  /** Nearest weight below `now` at which another option takes the lead. */
  down: number | null;
  downTo: number | null;
}

export function sensitivity(m: Model): CriterionSensitivity[] {
  const { wn, eo, leader } = m;
  return m.decision.criteria.map((_, i) => {
    const out: CriterionSensitivity = { i, now: wn[i]!, up: null, upTo: null, down: null, downTo: null };
    const L = lines(m, i);
    if (!L || eo.length < 2 || leader === undefined) return out;
    for (const j of eo) {
      if (j === leader) continue;
      const a = L[leader]![0] - L[j]![0];
      const b = L[leader]![1] - L[j]![1];
      if (Math.abs(b) < 1e-12) continue;
      const t = -a / b;
      if (t > wn[i]! + 1e-9 && t < MAX_FLIP_T) {
        if (out.up === null || t < out.up) {
          out.up = t;
          out.upTo = j;
        }
      } else if (t < wn[i]! - 1e-9 && t >= -1e-9) {
        if (out.down === null || t > out.down) {
          out.down = Math.max(0, t);
          out.downTo = j;
        }
      }
    }
    return out;
  });
}

export interface HeadlineFlip {
  i: number;
  t: number;
  dir: 1 | -1;
  to: number;
  /** |t − now| */
  d: number;
}

/** The smallest single-weight change (across all criteria, up or down) that changes the leader. */
export function headlineFlip(sens: readonly CriterionSensitivity[]): HeadlineFlip | null {
  let best: HeadlineFlip | null = null;
  for (const s of sens) {
    const cands: [number | null, 1 | -1, number | null][] = [
      [s.up, 1, s.upTo],
      [s.down, -1, s.downTo],
    ];
    for (const [t, dir, to] of cands) {
      if (t === null || to === null) continue;
      const d = Math.abs(t - s.now);
      if (!best || d < best.d) best = { i: s.i, t, dir, to, d };
    }
  }
  return best;
}

/** Distance from the current weight to the nearest flip (9 if none), used to sort the flip table. */
export const flipDistance = (s: CriterionSensitivity) => Math.min(s.up !== null ? s.up - s.now : 9, s.down !== null ? s.now - s.down : 9);

export interface ScoreFlip {
  criterion: number;
  who: 'runnerUp' | 'leader';
  option: number;
  from: number;
  /** The tie point: the score must rise above (runner-up) or fall below (leader) this. */
  threshold: number;
  need: number;
}

/**
 * Single-score changes that would hand the lead to the runner-up. Score-mode criteria only.
 * Changing one rating by Δ changes the total by w_i·Δ, so the change needed is gap / w_i.
 * Only changes that stay within 1–10 are kept; the four smallest are returned.
 */
export function scoreFlips(m: Model, limit = 4): ScoreFlip[] {
  const { leader, runnerUp, gap, wn, tie } = m;
  if (leader === undefined || runnerUp === undefined || tie) return [];
  const res: ScoreFlip[] = [];
  m.decision.criteria.forEach((c, i) => {
    if (wn[i]! <= 0 || c.mode === 'value') return;
    const need = gap / wn[i]!;
    const sr = m.D[i]![runnerUp]!;
    const sw = m.D[i]![leader]!;
    if (sr + need <= 10) res.push({ criterion: i, who: 'runnerUp', option: runnerUp, from: sr, threshold: sr + need, need });
    if (sw - need >= 1) res.push({ criterion: i, who: 'leader', option: leader, from: sw, threshold: sw - need, need });
  });
  return res.sort((a, b) => a.need - b.need).slice(0, limit);
}
