/** The seven templates, ported verbatim from prototype/index.html (TPL). */
import type { Certainty, Criterion, Decision, Direction, TemplateKey } from '@/engine/types';
import { newId } from '@/lib/id';

interface Extra {
  hint?: string;
  /** Raw values: switches the criterion to value mode. */
  v?: number[];
  unit?: string;
  dir?: Direction;
  cert?: Certainty;
  min?: number;
}

type CriterionSeed = Omit<Criterion, 'id'>;

const mk = (name: string, weight: number, scores: number[], x: Extra = {}): CriterionSeed => ({
  name,
  weight,
  scores,
  hint: x.hint ?? '',
  mode: x.v ? 'value' : 'score',
  direction: x.dir ?? 1,
  unit: x.unit ?? '',
  values: x.v ? x.v.slice() : scores.map(() => null),
  certainty: x.cert ?? 1,
  dealBreaker: x.min ?? null,
});

export interface Template {
  label: string;
  title: string;
  options: string[];
  criteria: CriterionSeed[];
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  job: {
    label: 'Switch jobs',
    title: 'Should I switch jobs?',
    options: ['Stay in current job', 'Switch to new job'],
    criteria: [
      mk('Growth', 30, [5, 8]),
      mk('Salary', 25, [6, 8], { v: [18, 24], unit: '₹ LPA', cert: 0 }),
      mk('Work-life balance', 20, [8, 5], { cert: 2 }),
      mk('Brand', 15, [7, 7], { cert: 0 }),
      mk('Risk', 10, [8, 4], { hint: '10 = lowest risk' }),
    ],
  },
  rent: {
    label: 'Buy or rent',
    title: 'Should I buy a flat or keep renting?',
    options: ['Buy a flat', 'Keep renting'],
    criteria: [
      mk('Monthly cash flow', 25, [4, 7]),
      mk('Long-term wealth', 25, [8, 5], { cert: 2 }),
      mk('Flexibility to move', 20, [3, 9], { cert: 0 }),
      mk('Stability', 15, [9, 5]),
      mk('Maintenance effort', 15, [4, 8], { hint: '10 = least effort' }),
    ],
  },
  laptop: {
    label: 'Which laptop',
    title: 'Which laptop should I buy?',
    options: ['MacBook Air 13', 'ThinkPad X1 Carbon', 'Dell XPS 14'],
    criteria: [
      mk('Price', 25, [6, 5, 6], { v: [114900, 135000, 124990], unit: '₹', dir: -1, min: 130000, cert: 0 }),
      mk('Battery life', 20, [9, 7, 6], { v: [15, 12, 10], unit: 'hours' }),
      mk('Performance', 20, [8, 7, 8]),
      mk('Portability', 15, [9, 8, 7], { cert: 0 }),
      mk('Keyboard', 10, [7, 9, 7]),
      mk('Software fit', 10, [6, 9, 8]),
    ],
  },
  mba: {
    label: 'MBA specialisation',
    title: 'Which MBA specialisation should I pick?',
    options: ['Strategy', 'Finance', 'Marketing'],
    criteria: [
      mk('Interest', 30, [9, 6, 7], { cert: 0 }),
      mk('Placement roles', 25, [8, 8, 7]),
      mk('Fit with past experience', 20, [8, 5, 6]),
      mk('Long-term optionality', 15, [8, 7, 6], { cert: 2 }),
      mk('Course load', 10, [6, 4, 7], { hint: '10 = lightest' }),
    ],
  },
  move: {
    label: 'Move cities',
    title: 'Should I move to Bengaluru?',
    options: ['Stay in Delhi', 'Move to Bengaluru'],
    criteria: [
      mk('Career opportunities', 30, [6, 9]),
      mk('Rent', 20, [6, 5], { v: [22000, 30000], unit: '₹ a month', dir: -1, cert: 0 }),
      mk('Family nearby', 20, [9, 3], { cert: 0 }),
      mk('Lifestyle', 15, [6, 7], { cert: 2 }),
      mk('Commute', 15, [5, 4], { hint: '10 = easiest' }),
    ],
  },
  biz: {
    label: 'Business idea',
    title: 'Which business idea should I pursue?',
    options: ['Online tutoring', 'Meal-prep delivery', 'Handmade gifts shop'],
    criteria: [
      mk('Market demand', 25, [7, 8, 6], { cert: 2 }),
      mk('Startup cost', 20, [9, 4, 7], { hint: '10 = cheapest' }),
      mk('Time needed', 20, [6, 3, 5], { hint: '10 = least time' }),
      mk('Personal interest', 20, [6, 5, 9], { cert: 0, min: 6 }),
      mk('Scalability', 15, [5, 7, 4], { cert: 2 }),
    ],
  },
  blank: {
    label: 'Blank',
    title: 'What am I deciding?',
    options: ['Option A', 'Option B'],
    criteria: [mk('Cost', 34, [5, 5], { hint: '10 = cheapest' }), mk('Quality', 33, [5, 5]), mk('Fit', 33, [5, 5])],
  },
};

/** A fresh decision from a template, with new ids and deep-copied arrays. */
export function fromTemplate(key: TemplateKey, now = Date.now()): Decision {
  const t = TEMPLATES[key];
  return {
    id: newId(),
    title: t.title,
    templateKey: key,
    gutOptionId: null,
    varyWeights: true,
    options: t.options.map((name) => ({ id: newId(), name })),
    criteria: t.criteria.map((c) => ({ ...c, id: newId(), scores: c.scores.slice(), values: c.values.slice() })),
    createdAt: now,
    updatedAt: now,
  };
}
