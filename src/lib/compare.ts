/**
 * Side-by-side comparison of two versions of a decision (e.g. before/after re-weighting).
 * Criteria and options are matched by id first, then by name, so snapshots of the same
 * decision line up exactly and two related decisions still line up sensibly.
 */
import { analyse, type Analysis } from '@/engine/analyse';
import type { Decision } from '@/engine/types';

export interface VersionSummary {
  analysis: Analysis;
  leaderName: string | null;
  leaderScore: number | null;
  margin: number;
  tie: boolean;
}

export interface CriterionRow {
  name: string;
  /** Normalised weights (0–1); null when the criterion is absent in that version. */
  left: number | null;
  right: number | null;
  /** Number of options whose rating/value on this criterion differs. */
  scoreChanges: number;
  modeChanged: boolean;
  dealBreakerChanged: boolean;
}

export interface OptionRow {
  name: string;
  left: number | null;
  right: number | null;
  leftEligible: boolean | null;
  rightEligible: boolean | null;
}

export interface Comparison {
  left: VersionSummary;
  right: VersionSummary;
  criteria: CriterionRow[];
  options: OptionRow[];
  leaderChanged: boolean;
  titleChanged: boolean;
}

const summary = (d: Decision): VersionSummary => {
  const analysis = analyse(d);
  const m = analysis.model;
  return {
    analysis,
    leaderName: m.leader !== undefined ? d.options[m.leader]!.name : null,
    leaderScore: m.leader !== undefined ? m.S[m.leader]! : null,
    margin: m.gap,
    tie: m.tie,
  };
};

function match<T extends { id: string; name: string }>(a: T[], b: T[]): [number, number][] {
  const pairs: [number, number][] = [];
  const usedB = new Set<number>();
  a.forEach((x, i) => {
    let j = b.findIndex((y, k) => !usedB.has(k) && y.id === x.id);
    if (j < 0) j = b.findIndex((y, k) => !usedB.has(k) && y.name.trim().toLowerCase() === x.name.trim().toLowerCase());
    if (j >= 0) usedB.add(j);
    pairs.push([i, j]);
  });
  b.forEach((_, j) => {
    if (!usedB.has(j)) pairs.push([-1, j]);
  });
  return pairs;
}

export function compareDecisions(L: Decision, R: Decision): Comparison {
  const left = summary(L);
  const right = summary(R);
  const optPairs = match(L.options, R.options);
  const criteria = match(L.criteria, R.criteria).map(([i, j]): CriterionRow => {
    const cl = i >= 0 ? L.criteria[i]! : null;
    const cr = j >= 0 ? R.criteria[j]! : null;
    let scoreChanges = 0;
    if (cl && cr) {
      for (const [oi, oj] of optPairs) {
        if (oi < 0 || oj < 0) continue;
        const a = cl.mode === 'value' ? cl.values[oi] : cl.scores[oi];
        const b = cr.mode === 'value' ? cr.values[oj] : cr.scores[oj];
        if (a !== b) scoreChanges++;
      }
    }
    return {
      name: (cr ?? cl)!.name,
      left: i >= 0 ? left.analysis.model.wn[i]! : null,
      right: j >= 0 ? right.analysis.model.wn[j]! : null,
      scoreChanges,
      modeChanged: !!cl && !!cr && cl.mode !== cr.mode,
      dealBreakerChanged: !!cl && !!cr && cl.dealBreaker !== cr.dealBreaker,
    };
  });
  const options = optPairs.map(([i, j]): OptionRow => ({
    name: (j >= 0 ? R.options[j]! : L.options[i]!).name,
    left: i >= 0 ? left.analysis.model.S[i]! : null,
    right: j >= 0 ? right.analysis.model.S[j]! : null,
    leftEligible: i >= 0 ? left.analysis.model.eligible[i]! : null,
    rightEligible: j >= 0 ? right.analysis.model.eligible[j]! : null,
  }));
  return {
    left,
    right,
    criteria,
    options,
    leaderChanged: left.leaderName !== right.leaderName || left.tie !== right.tie,
    titleChanged: L.title !== R.title,
  };
}
