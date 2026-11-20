/** Required fixtures from the brief. Expected values were checked by hand against prototype/index.html. */
import { describe, expect, it } from 'vitest';
import { analyse, computeModel, confidenceLabel, deriveScores, simulate, toSimInput, pc1, pc } from '@/engine';
import { cidx, idx, tpl } from './helpers';

describe('Job template', () => {
  const d = tpl('job');
  const m = computeModel(d);
  const a = analyse(d);

  it('totals: Switch 7.35, Stay 6.825', () => {
    expect(m.S[idx(d, 'Switch to new job')]).toBeCloseTo(7.35, 10);
    expect(m.S[idx(d, 'Stay in current job')]).toBeCloseTo(6.825, 10);
    expect(m.leader).toBe(idx(d, 'Switch to new job'));
  });

  it('Salary in value mode 18 vs 24 ₹ LPA derives 7.5 and 10', () => {
    const salary = d.criteria[cidx(d, 'Salary')]!;
    expect(salary.mode).toBe('value');
    expect(salary.values).toEqual([18, 24]);
    expect(deriveScores(salary)).toEqual([7.5, 10]);
  });

  it('headline flip: Risk above ≈20.4% (now 10%)', () => {
    const h = a.headline!;
    expect(d.criteria[h.i]!.name).toBe('Risk');
    expect(h.dir).toBe(1);
    expect(h.t).toBeCloseTo(0.2044, 3);
    expect(pc(m.wn[h.i]!)).toBe('10%');
    expect(h.to).toBe(idx(d, 'Stay in current job'));
  });
});

describe('MBA template', () => {
  const d = tpl('mba');
  const m = computeModel(d);

  it('totals: Strategy 8.10, Marketing 6.65, Finance 6.25', () => {
    expect(m.S[idx(d, 'Strategy')]).toBeCloseTo(8.1, 10);
    expect(m.S[idx(d, 'Marketing')]).toBeCloseTo(6.65, 10);
    expect(m.S[idx(d, 'Finance')]).toBeCloseTo(6.25, 10);
    expect(m.order.map((j) => d.options[j]!.name)).toEqual(['Strategy', 'Marketing', 'Finance']);
  });

  it('headline flip: Course load above ≈63%', () => {
    const h = analyse(d).headline!;
    expect(d.criteria[h.i]!.name).toBe('Course load');
    expect(h.dir).toBe(1);
    expect(h.t).toBeCloseTo(0.6327, 3);
    expect(pc1(h.t, m.wn[h.i]!)).toBe('63%');
  });
});

describe('Laptop template', () => {
  const d = tpl('laptop');
  const m = computeModel(d);

  it('ThinkPad X1 Carbon is ruled out (₹1,35,000 > ₹1,30,000 limit)', () => {
    const tp = idx(d, 'ThinkPad X1 Carbon');
    expect(m.eligible[tp]).toBe(false);
    expect(m.fails[tp]).toEqual([cidx(d, 'Price')]);
    expect(m.eo).not.toContain(tp);
  });

  it('MacBook Air 8.75 leads Dell XPS 14 at 7.78', () => {
    expect(m.S[idx(d, 'MacBook Air 13')]).toBeCloseTo(8.75, 10);
    expect(m.S[idx(d, 'Dell XPS 14')]!.toFixed(2)).toBe('7.78');
    expect(m.leader).toBe(idx(d, 'MacBook Air 13'));
    expect(m.runnerUp).toBe(idx(d, 'Dell XPS 14'));
  });

  it('ruled-out options are excluded from the simulation', () => {
    const sim = simulate(toSimInput(m)!);
    expect(sim.p[idx(d, 'ThinkPad X1 Carbon')]).toBe(0);
    expect(sim.p.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
  });
});

describe('Blank template', () => {
  const d = tpl('blank');
  const m = computeModel(d);
  it('is an exact tie', () => {
    expect(m.S[0]).toBe(m.S[1]);
    expect(m.tie).toBe(true);
    expect(m.gap).toBe(0);
  });
  it('the simulation labels it Coin flip', () => {
    const sim = simulate(toSimInput(m)!);
    expect(confidenceLabel(sim.p[m.leader!]!, m.tie).label).toBe('Coin flip');
  });
});
