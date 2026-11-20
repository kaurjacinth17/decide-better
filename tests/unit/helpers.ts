import type { Criterion, Decision } from '@/engine/types';
import { mulberry32 } from '@/engine/simulate';
import { fromTemplate } from '@/templates';
import type { TemplateKey } from '@/engine/types';

export const tpl = (k: TemplateKey) => fromTemplate(k, 0);

export const idx = (d: Decision, name: string) => {
  const j = d.options.findIndex((o) => o.name === name);
  if (j < 0) throw new Error(`No option ${name}`);
  return j;
};
export const cidx = (d: Decision, name: string) => {
  const i = d.criteria.findIndex((c) => c.name === name);
  if (i < 0) throw new Error(`No criterion ${name}`);
  return i;
};

/** Deterministic random decisions for property tests. */
export function randomDecision(seed: number): Decision {
  const r = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const n = int(2, 5);
  const k = int(1, 10);
  const criteria: Criterion[] = Array.from({ length: k }, (_, i) => {
    const value = r() < 0.3;
    const positive = r() < 0.7;
    return {
      id: `c${i}`,
      name: `C${i}`,
      weight: r() < 0.1 ? 0 : int(0, 100),
      hint: '',
      mode: value ? 'value' : 'score',
      direction: r() < 0.5 ? 1 : -1,
      unit: '',
      scores: Array.from({ length: n }, () => int(2, 20) / 2),
      values: Array.from({ length: n }, () => (r() < 0.1 ? null : positive ? int(1, 500) : int(-50, 50))),
      certainty: int(0, 2) as 0 | 1 | 2,
      dealBreaker: null,
    };
  });
  return {
    id: `d${seed}`,
    title: 'Random',
    templateKey: 'blank',
    gutOptionId: null,
    varyWeights: r() < 0.5,
    options: Array.from({ length: n }, (_, j) => ({ id: `o${j}`, name: `O${j}` })),
    criteria,
    createdAt: 0,
    updatedAt: 0,
  };
}
