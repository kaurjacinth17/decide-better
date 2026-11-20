import { describe, expect, it } from 'vitest';
import { analyse, computeModel, simulate, toSimInput } from '@/engine';
import { compareDecisions } from '@/lib/compare';
import { deterministicMemo, inventedNumbers, memoFacts, numbersIn } from '@/lib/memo';
import { decodeDecision, encodeDecision, readHash, shareUrl } from '@/lib/share';
import * as ops from '@/store/ops';
import { tpl } from './helpers';

describe('share links', () => {
  it('round-trips a decision through the URL hash', () => {
    const d = tpl('laptop');
    const url = shareUrl('https://example.test', d);
    const hash = url.split('#')[1]!;
    const r = decodeDecision(readHash(`#${hash}`)!);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.decision.options).toEqual(d.options);
    expect(r.decision.criteria).toEqual(d.criteria);
    expect(computeModel(r.decision).S).toEqual(computeModel(d).S);
  });
  it('keeps links reasonably short', () => {
    expect(encodeDecision(tpl('laptop')).length).toBeLessThan(1500);
  });
  it('rejects damaged or hostile payloads', () => {
    expect(decodeDecision('garbage!!').ok).toBe(false);
    expect(decodeDecision('').ok).toBe(false);
    expect(readHash('#x=1')).toBeNull();
  });
});

describe('compare versions', () => {
  it('before/after re-weighting: weights, leader change and unchanged scores', () => {
    const before = tpl('job');
    const after = structuredClone(before);
    ops.setWeight(after, 4, 60); // Risk up to 60 raw
    const c = compareDecisions(before, after);
    expect(c.left.leaderName).toBe('Switch to new job');
    expect(c.right.leaderName).toBe('Stay in current job');
    expect(c.leaderChanged).toBe(true);
    const risk = c.criteria.find((r) => r.name === 'Risk')!;
    expect(risk.left).toBeCloseTo(0.1, 10);
    expect(risk.right).toBeCloseTo(60 / 150, 10);
    expect(c.criteria.every((r) => r.scoreChanges === 0)).toBe(true);
  });
  it('matches added/removed criteria and options by id, then name', () => {
    const a = tpl('job');
    const b = structuredClone(a);
    ops.removeCriterion(b, 3); // Brand
    ops.addOption(b);
    ops.setScore(b, 0, 0, 9);
    const c = compareDecisions(a, b);
    expect(c.criteria.find((r) => r.name === 'Brand')!.right).toBeNull();
    expect(c.criteria.find((r) => r.name === 'Growth')!.scoreChanges).toBe(1);
    expect(c.options.find((o) => o.name === 'Option C')!.left).toBeNull();
  });
});

describe('memo facts', () => {
  const d = tpl('job');
  const a = analyse(d);
  const sim = simulate(toSimInput(a.model)!);
  const f = memoFacts(a, sim);

  it('quotes engine figures exactly as the UI shows them', () => {
    expect(f.leader).toEqual({ name: 'Switch to new job', score: '7.35' });
    expect(f.margin).toBe('0.53');
    expect(f.confidence).toEqual({ label: 'Robust', winShare: '86%', runs: '2,000' });
    expect(f.headlineFlip).toEqual({
      criterion: 'Risk',
      direction: 'above',
      threshold: '20%',
      now: '10%',
      newLeader: 'Stay in current job',
    });
    expect(f.biggestAdvantage).toMatchObject({ criterion: 'Growth', points: '+0.90' });
    expect(f.criteria[1]!.ratings[0]).toEqual({ option: 'Stay in current job', shown: '₹18 LPA', score: '7.5' });
  });

  it('the deterministic memo contains no number that is not in the facts', () => {
    const text = deterministicMemo(f)
      .flatMap((s) => [s.heading, ...s.paragraphs])
      .join('\n');
    expect(text).toContain('7.35');
    expect(inventedNumbers(text, f)).toEqual([]);
  });

  it('flags invented numbers in AI-style text', () => {
    expect(numbersIn('₹1,35,000 and 7.35, 86% −0.60')).toEqual(['135000', '7.35', '86', '0.60']);
    expect(inventedNumbers('Switch leads by 0.53 points and wins 86% of runs.', f)).toEqual([]);
    expect(inventedNumbers('Switch leads by 0.7 points and pays 42 lakh.', f)).toEqual(['0.7', '42']);
  });

  it('handles the no-survivor and tie cases', () => {
    const t = memoFacts(analyse(tpl('blank')), null);
    expect(deterministicMemo(t)[0]!.paragraphs[0]).toContain('effectively tied');
    const none = tpl('job');
    none.criteria[1]!.dealBreaker = 100;
    expect(deterministicMemo(memoFacts(analyse(none), null))[0]!.paragraphs[0]).toContain('No option passes');
  });
});
