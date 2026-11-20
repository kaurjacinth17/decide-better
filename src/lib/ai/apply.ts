/**
 * Turning ACCEPTED AI proposals into decision edits. These run only when the user clicks
 * accept; each is applied through the store's `change`, so it is a normal undoable step.
 */
import { LIMITS, type Criterion, type Decision } from '@/engine/types';
import { newId } from '@/lib/id';
import { fromTemplate } from '@/templates';
import * as ops from '@/store/ops';
import { certaintyIndex, type GutProposal, type IntakeProposal, type Suggestion } from './schemas';

export interface IntakeSelection {
  title: string;
  options: boolean[];
  criteria: boolean[];
}

/** A new decision containing only the items the user accepted (scores start at a neutral 5). */
export function proposalToDecision(p: IntakeProposal, sel: IntakeSelection, now = Date.now()): Decision {
  const d = fromTemplate('blank', now);
  const options = p.options.map((name, j) => ({ name, j })).filter((o) => sel.options[o.j]);
  if (options.length < LIMITS.minOptions) throw new Error('Keep at least two options.');
  const criteria = p.criteria.filter((_, i) => sel.criteria[i]);
  if (!criteria.length) throw new Error('Keep at least one criterion.');
  d.title = (sel.title.trim() || p.title).slice(0, LIMITS.titleMax);
  d.options = options.map((o) => ({ id: newId(), name: o.name }));
  d.criteria = criteria.map((c): Criterion => ({
    id: newId(),
    name: c.name,
    weight: c.weight,
    hint: c.hint,
    mode: c.mode,
    direction: c.direction,
    unit: c.unit,
    scores: options.map(() => 5),
    values: options.map((o) => c.values[o.j] ?? null),
    certainty: 1,
    dealBreaker: c.dealBreaker,
  }));
  return d;
}

const findC = (d: Decision, name: string) => d.criteria.findIndex((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
const findO = (d: Decision, name: string) => d.options.findIndex((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase());

/** Apply one accepted challenger suggestion in place. Returns false if it no longer fits the decision. */
export function applySuggestion(d: Decision, s: Suggestion): boolean {
  switch (s.action) {
    case 'set_score': {
      const i = findC(d, s.criterion);
      const j = findO(d, s.option);
      if (i < 0 || j < 0) return false;
      if (d.criteria[i]!.mode === 'value') return false;
      ops.setScore(d, i, j, s.score);
      return true;
    }
    case 'add_criterion': {
      if (findC(d, s.criterion) >= 0) return false;
      const id = ops.addCriterion(d, s.criterion);
      if (!id) return false;
      const c = d.criteria.at(-1)!;
      c.weight = s.weight;
      c.hint = s.hint;
      return true;
    }
    case 'remove_criterion': {
      const i = findC(d, s.criterion);
      return i >= 0 && ops.removeCriterion(d, i);
    }
    case 'set_weight': {
      const i = findC(d, s.criterion);
      if (i < 0) return false;
      ops.setWeight(d, i, s.weight);
      return true;
    }
    case 'set_certainty': {
      const i = findC(d, s.criterion);
      if (i < 0) return false;
      ops.setCertainty(d, i, certaintyIndex(s.certainty));
      return true;
    }
    default:
      return false;
  }
}

/** Add the criterion proposed by the gut interview, with its proposed scores. */
export function addGutCriterion(d: Decision, p: GutProposal): boolean {
  if (findC(d, p.name) >= 0) return false;
  const id = ops.addCriterion(d, p.name);
  if (!id) return false;
  const c = d.criteria.at(-1)!;
  c.weight = p.weight;
  c.hint = p.hint;
  c.scores = d.options.map((_, j) => p.scores[j] ?? 5);
  c.certainty = 2; // it came from a conversation, so mark it as a guess until the user firms it up
  return true;
}
