import { describe, expect, it } from 'vitest';
import { computeModel } from '@/engine';
import { DecisionSchema, parseImport, toExport } from '@/lib/schema';
import { tpl } from './helpers';

/** Exactly what the prototype's "Copy this decision" produced for the Laptop template (ids shortened). */
const prototypeLaptop = {
  id: 'kabc1',
  tpl: 'laptop',
  title: 'Which laptop should I buy?',
  gut: 'kabc3',
  wNoise: true,
  options: [
    { id: 'kabc2', name: 'MacBook Air 13' },
    { id: 'kabc3', name: 'ThinkPad X1 Carbon' },
    { id: 'kabc4', name: 'Dell XPS 14' },
  ],
  criteria: [
    {
      name: 'Price',
      w: 25,
      s: [6, 5, 6],
      hint: '',
      mode: 'value',
      dir: -1,
      unit: '₹',
      v: [114900, 135000, 124990],
      cert: 0,
      min: 130000,
      id: 'kc1',
    },
    {
      name: 'Battery life',
      w: 20,
      s: [9, 7, 6],
      hint: '',
      mode: 'value',
      dir: 1,
      unit: 'hours',
      v: [15, 12, 10],
      cert: 1,
      min: null,
      id: 'kc2',
    },
    { name: 'Performance', w: 20, s: [8, 7, 8], hint: '', mode: 'score', dir: 1, unit: '', v: ['', '', ''], cert: 1, min: null, id: 'kc3' },
    { name: 'Portability', w: 15, s: [9, 8, 7], hint: '', mode: 'score', dir: 1, unit: '', v: ['', '', ''], cert: 0, min: null, id: 'kc4' },
    { name: 'Keyboard', w: 10, s: [7, 9, 7], hint: '', mode: 'score', dir: 1, unit: '', v: ['', '', ''], cert: 1, min: null, id: 'kc5' },
    {
      name: 'Software fit',
      w: 10,
      s: [6, 9, 8],
      hint: '',
      mode: 'score',
      dir: 1,
      unit: '',
      v: ['', '', ''],
      cert: 1,
      min: null,
      id: 'kc6',
    },
  ],
};

describe('prototype migration', () => {
  it('migrates a prototype export and computes the same results', () => {
    const { decisions, errors } = parseImport(JSON.stringify(prototypeLaptop));
    expect(errors).toEqual([]);
    const d = decisions[0]!;
    expect(d.templateKey).toBe('laptop');
    expect(d.gutOptionId).toBe('kabc3');
    expect(d.varyWeights).toBe(true);
    expect(d.criteria[0]).toMatchObject({ weight: 25, direction: -1, dealBreaker: 130000, certainty: 0, values: [114900, 135000, 124990] });
    expect(d.criteria[2]!.values).toEqual([null, null, null]);
    const a = computeModel(d);
    const b = computeModel(tpl('laptop'));
    expect(a.S).toEqual(b.S);
    expect(a.eligible).toEqual(b.eligible);
  });

  it('migrates the prototype localStorage library ({cur, items, at})', () => {
    const lib = { cur: 'kabc1', items: { kabc1: prototypeLaptop, broken: { options: [] } }, at: { kabc1: 1 } };
    const { decisions, errors } = parseImport(lib);
    expect(decisions).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('sanitises like the prototype norm(): clamps, defaults, drops a dangling gut pick', () => {
    const raw = structuredClone(prototypeLaptop) as Record<string, unknown> & typeof prototypeLaptop;
    (raw as { gut: string }).gut = 'nope';
    (raw.criteria[2] as Record<string, unknown>).s = [0, 99, 'x'];
    (raw.criteria[2] as Record<string, unknown>).w = 500;
    (raw.criteria[2] as Record<string, unknown>).cert = 7;
    (raw as Record<string, unknown>).tpl = 'unknown';
    const d = parseImport(raw).decisions[0]!;
    expect(d.gutOptionId).toBeNull();
    expect(d.criteria[2]).toMatchObject({ scores: [1, 10, 5], weight: 100, certainty: 1 });
    expect(d.templateKey).toBe('blank');
  });
});

describe('current format', () => {
  it('round-trips through the export envelope', () => {
    const d = tpl('mba');
    const { decisions, errors } = parseImport(JSON.stringify(toExport([d])));
    expect(errors).toEqual([]);
    expect(decisions[0]).toEqual(d);
  });

  it('rejects structural problems with readable messages', () => {
    const bad = (mut: (d: ReturnType<typeof tpl>) => void) => {
      const d = tpl('job');
      mut(d);
      return DecisionSchema.safeParse(d);
    };
    expect(bad((d) => (d.options = d.options.slice(0, 1))).success).toBe(false);
    expect(bad((d) => d.criteria[0]!.scores.pop()).success).toBe(false);
    expect(bad((d) => (d.criteria = [])).success).toBe(false);
    expect(parseImport('not json').errors[0]).toMatch(/valid JSON/);
    expect(parseImport('{"hello":1}').decisions).toHaveLength(0);
  });
});
