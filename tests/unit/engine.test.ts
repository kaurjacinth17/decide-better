import { describe, expect, it } from 'vitest';
import {
  allPairs,
  analyse,
  computeModel,
  confidenceLabel,
  deriveScores,
  gutAnalysis,
  lineAt,
  lines,
  mulberry32,
  normaliseWeights,
  pairwiseWeights,
  reweight,
  scoreFlips,
  sensitivity,
  simulate,
  summaryMarkdown,
  toRawWeights,
  toSimInput,
  weightedTotalsFor,
  type Criterion,
  type Decision,
} from '@/engine';
import { cidx, idx, randomDecision, tpl } from './helpers';

const crit = (over: Partial<Criterion>): Criterion => ({
  id: 'c',
  name: 'C',
  weight: 10,
  hint: '',
  mode: 'value',
  direction: 1,
  unit: '',
  scores: [5, 5, 5],
  values: [null, null, null],
  certainty: 1,
  dealBreaker: null,
  ...over,
});

describe('normaliseWeights', () => {
  it('normalises and treats negatives / NaN as zero', () => {
    expect(normaliseWeights([30, 20, 50])).toEqual([0.3, 0.2, 0.5]);
    expect(normaliseWeights([-5, NaN, 10])).toEqual([0, 0, 1]);
  });
  it('falls back to equal weights when all are zero', () => {
    expect(normaliseWeights([0, 0, 0, 0])).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});

describe('deriveScores', () => {
  it('score mode clamps to 1–10 and maps junk to 5', () => {
    expect(deriveScores(crit({ mode: 'score', scores: [0, 11, NaN] }))).toEqual([1, 10, 5]);
  });
  it('ratio scaling, higher is better', () => {
    const d = deriveScores(crit({ values: [15, 12, 10] }));
    expect(d[0]).toBe(10);
    expect(d[1]).toBeCloseTo(8, 12);
    expect(d[2]).toBeCloseTo(20 / 3, 12);
  });
  it('ratio scaling, lower is better, clamped to ≥ 1', () => {
    const d = deriveScores(crit({ direction: -1, values: [100, 200, 2000] }));
    expect(d).toEqual([10, 5, 1]);
  });
  it('min–max scaling when any value is ≤ 0', () => {
    expect(deriveScores(crit({ values: [-10, 0, 10] }))).toEqual([1, 5.5, 10]);
    expect(deriveScores(crit({ direction: -1, values: [-10, 0, 10] }))).toEqual([10, 5.5, 1]);
  });
  it('all-equal non-positive values all get 10; missing counts as 5', () => {
    expect(deriveScores(crit({ values: [0, 0, null] }))).toEqual([10, 10, 5]);
    expect(deriveScores(crit({ values: [null, null, null] }))).toEqual([5, 5, 5]);
  });
});

describe('deal-breakers', () => {
  it('score mode rules out scores below the threshold', () => {
    const d = tpl('biz'); // Personal interest min 6: Meal-prep scores 5
    const m = computeModel(d);
    expect(m.eligible[idx(d, 'Meal-prep delivery')]).toBe(false);
    expect(m.eligible[idx(d, 'Online tutoring')]).toBe(true);
  });
  it('value mode: higher-better rules out values below the limit', () => {
    const d = tpl('job');
    const s = d.criteria[cidx(d, 'Salary')]!;
    s.dealBreaker = 20;
    const m = computeModel(d);
    expect(m.eligible).toEqual([false, true]);
    expect(m.leader).toBe(1);
    expect(m.eo.length).toBe(1);
    expect(analyse(d).comparable).toBe(false);
  });
  it('a missing value never fails a deal-breaker', () => {
    const d = tpl('laptop');
    d.criteria[0]!.values[1] = null;
    expect(computeModel(d).eligible[1]).toBe(true);
  });
  it('no eligible options: no leader', () => {
    const d = tpl('job');
    d.criteria[cidx(d, 'Salary')]!.dealBreaker = 100;
    const m = computeModel(d);
    expect(m.leader).toBeUndefined();
    expect(summaryMarkdown(analyse(d), null)).toContain('No option passes every deal-breaker.');
  });
});

describe('property tests (300 seeded random decisions)', () => {
  const seeds = Array.from({ length: 300 }, (_, k) => 1000 + k);

  it('normalised weights are non-negative and sum to 1', () => {
    for (const s of seeds) {
      const m = computeModel(randomDecision(s));
      expect(m.wn.every((w) => w >= 0)).toBe(true);
      expect(m.wn.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
  });

  it('derived scores always stay within 1–10', () => {
    for (const s of seeds) for (const row of computeModel(randomDecision(s)).D) for (const v of row) expect(v >= 1 && v <= 10).toBe(true);
  });

  it('f_j(w_i) equals S_j, and f_j(t) equals a full recompute with reweighted weights', () => {
    for (const s of seeds) {
      const m = computeModel(randomDecision(s));
      m.wn.forEach((w, i) => {
        const L = lines(m, i);
        if (!L) return;
        for (let j = 0; j < m.n; j++) expect(lineAt(L, j, w)).toBeCloseTo(m.S[j]!, 9);
        const t = 0.37;
        const S2 = weightedTotalsFor(m, reweight(m.wn, i, t));
        for (let j = 0; j < m.n; j++) expect(lineAt(L, j, t)).toBeCloseTo(S2[j]!, 9);
      });
    }
  });

  it('applying a flip threshold really changes the leader to the predicted option', () => {
    let checked = 0;
    for (const s of seeds) {
      const m = computeModel(randomDecision(s));
      if (m.tie || m.eo.length < 2) continue;
      for (const sv of sensitivity(m)) {
        for (const [t, to, dir] of [
          [sv.up, sv.upTo, 1],
          [sv.down, sv.downTo, -1],
        ] as const) {
          if (t === null || to === null) continue;
          const past = Math.min(1, Math.max(0, t + dir * 1e-6));
          const before = Math.min(1, Math.max(0, t - dir * 1e-6));
          const S = weightedTotalsFor(m, reweight(m.wn, sv.i, past));
          if (t > 1e-6) {
            // Interior threshold: just past it, the predicted option strictly leads every eligible option.
            expect(m.eo.reduce((a, b) => (S[b]! > S[a]! ? b : a))).toBe(to);
          } else {
            // Boundary case ("only if ignored completely"): at 0% the rival at least ties the leader.
            expect(S[to]!).toBeGreaterThanOrEqual(S[m.leader!]! - 1e-9);
          }
          const S0 = weightedTotalsFor(m, reweight(m.wn, sv.i, before));
          expect(m.eo.reduce((a, b) => (S0[b]! > S0[a]! ? b : a))).toBe(m.leader);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('score flips land exactly on a tie with the runner-up', () => {
    for (const s of seeds) {
      const d = randomDecision(s);
      const m = computeModel(d);
      for (const f of scoreFlips(m)) {
        const c = d.criteria[f.criterion]!;
        const copy: Decision = structuredClone(d);
        copy.criteria[f.criterion]!.scores[f.option] = f.threshold;
        const m2 = computeModel(copy);
        expect(m2.S[m.leader!]).toBeCloseTo(m2.S[m.runnerUp!]!, 9);
        expect(f.threshold >= 1 && f.threshold <= 10).toBe(true);
        expect(c.mode).toBe('score');
      }
    }
  });
});

describe('score flips', () => {
  it('job template: smallest changes first, at most 4', () => {
    const d = tpl('job');
    const f = scoreFlips(computeModel(d));
    expect(f.length).toBeLessThanOrEqual(4);
    expect(f.map((x) => x.need)).toEqual([...f.map((x) => x.need)].sort((a, b) => a - b));
    expect(f.every((x) => d.criteria[x.criterion]!.mode === 'score')).toBe(true);
  });
  it('none for a tie', () => expect(scoreFlips(computeModel(tpl('blank')))).toEqual([]));
});

describe('simulation', () => {
  it('mulberry32 is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let k = 0; k < 10; k++) expect(a()).toBe(b());
  });
  it('same input, same output', () => {
    const inp = toSimInput(computeModel(tpl('job')))!;
    expect(simulate(inp)).toEqual(simulate(inp));
  });
  it('probabilities sum to 1 and attribution is a share', () => {
    const r = simulate(toSimInput(computeModel(tpl('mba')))!);
    expect(r.p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(r.attr.every((x) => x >= 0 && x <= 1)).toBe(true);
    expect(r.weightFlip).not.toBeNull();
  });
  it('weight noise off: no weight attribution', () => {
    const d = tpl('mba');
    d.varyWeights = false;
    expect(simulate(toSimInput(computeModel(d))!).weightFlip).toBeNull();
  });
  it('labels', () => {
    expect(confidenceLabel(0.85).label).toBe('Robust');
    expect(confidenceLabel(0.849).label).toBe('Likely');
    expect(confidenceLabel(0.65).label).toBe('Likely');
    expect(confidenceLabel(0.5).label).toBe('Fragile');
    expect(confidenceLabel(0.49).label).toBe('Coin flip');
    expect(confidenceLabel(1, true).label).toBe('Coin flip');
  });
});

describe('gut check', () => {
  it('finds the main reason and a weight change that makes the gut pick the overall leader', () => {
    const d = tpl('job');
    const g = idx(d, 'Stay in current job');
    const m = computeModel(d);
    const a = gutAnalysis(m, g);
    expect(d.criteria[a.biggest]!.name).toBe('Growth'); // 0.30·(8−5) = 0.9 beats Salary 0.25·(10−7.5) = 0.625
    expect(a.biggestValue).toBeCloseTo(0.9, 10);
    const f = a.flip!;
    const S = weightedTotalsFor(m, reweight(m.wn, f.i, f.t + f.dir * 0.003));
    expect(m.eo.every((j) => S[g]! >= S[j]!)).toBe(true);
  });
  it('analyse() reports agreement, ruled-out and tiebreak states', () => {
    const d = tpl('job');
    d.gutOptionId = d.options[idx(d, 'Switch to new job')]!.id;
    expect(analyse(d).gut.kind).toBe('agrees');
    const b = tpl('blank');
    b.gutOptionId = b.options[1]!.id;
    expect(analyse(b).gut.kind).toBe('tiebreak');
    const l = tpl('laptop');
    l.gutOptionId = l.options[idx(l, 'ThinkPad X1 Carbon')]!.id;
    expect(analyse(l).gut.kind).toBe('ruledOut');
  });
});

describe('pairwise helper (AHP-lite)', () => {
  it('all "about the same" gives equal weights and CR 0', () => {
    const r = pairwiseWeights(
      4,
      allPairs(4).map(() => 0),
    );
    r.weights.forEach((w) => expect(w).toBeCloseTo(0.25, 12));
    expect(r.cr).toBeCloseTo(0, 12);
    expect(r.consistent).toBe(true);
  });
  it('a perfectly consistent matrix: A≫B (5), B=C, A≫C (5)', () => {
    // pairs: (0,1), (0,2), (1,2)
    const r = pairwiseWeights(3, [-2, -2, 0]);
    expect(r.weights[0]! / r.weights[1]!).toBeCloseTo(5, 10);
    expect(r.weights[1]).toBeCloseTo(r.weights[2]!, 12);
    expect(r.cr).toBeCloseTo(0, 10);
  });
  it('contradictory answers trigger the CR > 0.1 warning', () => {
    // A ≫ B, B ≫ C, but C ≫ A
    const r = pairwiseWeights(3, [-2, 2, -2]);
    expect(r.cr).toBeGreaterThan(0.1);
    expect(r.consistent).toBe(false);
  });
  it('weights sum to 1 and convert to raw importances ≥ 1', () => {
    const r = pairwiseWeights(
      5,
      allPairs(5).map((_, k) => ([-2, -1, 0, 1, 2] as const)[k % 5]!),
    );
    expect(r.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(toRawWeights([0.001, 0.999])).toEqual([1, 100]);
  });
});

describe('summary markdown', () => {
  it('matches the prototype layout', () => {
    const d = tpl('job');
    const md = summaryMarkdown(analyse(d), null);
    expect(md.split('\n').slice(0, 4)).toEqual([
      '# Should I switch jobs?',
      '',
      'Leader: **Switch to new job** (7.35/10), ahead of Stay in current job by 0.53 points.',
      'Changes if Risk is weighted above 20% (now 10%); Stay in current job would lead.',
    ]);
    expect(md).toContain('| Salary | 25% | ₹18 LPA (7.5) | ₹24 LPA (10) |');
    // 6.825 is stored as 6.8249999… in floating point, so toFixed(2) gives 6.82, exactly as the prototype shows.
    expect(md).toContain('| **Total** | 100% | **6.82** | **7.35** |');
  });
});
