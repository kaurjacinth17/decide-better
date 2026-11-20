/**
 * Pure, in-place edit operations on a (cloned) Decision. Each mirrors a prototype action
 * exactly, including its side effects (e.g. switching mode resets the deal-breaker).
 */
import { deriveScores, clamp, toScore } from '@/engine/model';
import { LIMITS, type Certainty, type Decision, type Direction, type Mode } from '@/engine/types';
import { newId } from '@/lib/id';

export function addCriterion(d: Decision, name = 'New criterion'): string | null {
  if (d.criteria.length >= LIMITS.maxCriteria) return null;
  const id = newId();
  d.criteria.push({
    id,
    name,
    weight: 10,
    hint: '',
    mode: 'score',
    direction: 1,
    unit: '',
    scores: d.options.map(() => 5),
    values: d.options.map(() => null),
    certainty: 1,
    dealBreaker: null,
  });
  return id;
}

export function removeCriterion(d: Decision, i: number): boolean {
  if (d.criteria.length <= LIMITS.minCriteria || !d.criteria[i]) return false;
  d.criteria.splice(i, 1);
  return true;
}

export function addOption(d: Decision): string | null {
  if (d.options.length >= LIMITS.maxOptions) return null;
  const id = newId();
  d.options.push({ id, name: `Option ${String.fromCharCode(65 + d.options.length)}` });
  d.criteria.forEach((c) => {
    c.scores.push(5);
    c.values.push(null);
  });
  return id;
}

export function removeOption(d: Decision, j: number): boolean {
  if (d.options.length <= LIMITS.minOptions || !d.options[j]) return false;
  const [o] = d.options.splice(j, 1);
  if (o && d.gutOptionId === o.id) d.gutOptionId = null;
  d.criteria.forEach((c) => {
    c.scores.splice(j, 1);
    c.values.splice(j, 1);
  });
  return true;
}

export const setTitle = (d: Decision, title: string) => void (d.title = title.slice(0, LIMITS.titleMax));
export const renameOption = (d: Decision, j: number, name: string) =>
  void (d.options[j] && (d.options[j].name = name.replace(/\s*\n\s*/g, ' ').slice(0, LIMITS.nameMax)));
export const renameCriterion = (d: Decision, i: number, name: string) =>
  void (d.criteria[i] && (d.criteria[i].name = name.slice(0, LIMITS.nameMax)));
export const setWeight = (d: Decision, i: number, w: number) =>
  void (d.criteria[i] && (d.criteria[i].weight = clamp(Math.round(w), 0, 100)));
export const setHint = (d: Decision, i: number, hint: string) => void (d.criteria[i] && (d.criteria[i].hint = hint.slice(0, 40)));
export const setUnit = (d: Decision, i: number, unit: string) => void (d.criteria[i] && (d.criteria[i].unit = unit.slice(0, 16)));
export const setCertainty = (d: Decision, i: number, k: Certainty) => void (d.criteria[i] && (d.criteria[i].certainty = k));
export const setGut = (d: Decision, optionId: string | null) =>
  void (d.gutOptionId = optionId && d.options.some((o) => o.id === optionId) ? optionId : null);
export const setVaryWeights = (d: Decision, on: boolean) => void (d.varyWeights = on);

/** Score input: ignored unless it is a finite number; clamped to 1–10. */
export function setScore(d: Decision, i: number, j: number, raw: string | number) {
  const c = d.criteria[i];
  if (!c || j < 0 || j >= d.options.length) return;
  const v = typeof raw === 'number' ? raw : raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(v)) return;
  c.scores[j] = clamp(v, 1, 10);
}

/** Value input: blank or non-numeric clears the value. */
export function setValue(d: Decision, i: number, j: number, raw: string | number | null) {
  const c = d.criteria[i];
  if (!c || j < 0 || j >= d.options.length) return;
  const v = raw === null ? NaN : typeof raw === 'number' ? raw : raw.trim() === '' ? NaN : Number(raw);
  c.values[j] = Number.isFinite(v) ? v : null;
}

/** Switching to score mode seeds the ratings from the derived scores (rounded to 0.5). Always clears the deal-breaker. */
export function setMode(d: Decision, i: number, mode: Mode) {
  const c = d.criteria[i];
  if (!c || c.mode === mode) return;
  if (mode === 'score') c.scores = deriveScores(c).map((x) => Math.round(x * 2) / 2);
  c.mode = mode;
  c.dealBreaker = null;
}

const defaultLimit = (values: (number | null)[], dir: Direction): number | null => {
  const ok = values.filter((x): x is number => x !== null);
  return ok.length ? (dir > 0 ? Math.min(...ok) : Math.max(...ok)) : null;
};

/** Changing direction re-centres an active value deal-breaker on the weakest current value. */
export function setDirection(d: Decision, i: number, dir: Direction) {
  const c = d.criteria[i];
  if (!c) return;
  c.direction = dir;
  if (c.dealBreaker !== null) c.dealBreaker = defaultLimit(c.values, dir) ?? c.dealBreaker;
}

/** Turning a deal-breaker on starts at the weakest current value (value mode) or 4 (score mode), so nothing is ruled out yet. */
export function toggleDealBreaker(d: Decision, i: number, on: boolean) {
  const c = d.criteria[i];
  if (!c) return;
  c.dealBreaker = on ? (c.mode === 'value' ? (defaultLimit(c.values, c.direction) ?? 0) : 4) : null;
}

export function setDealBreaker(d: Decision, i: number, raw: string | number) {
  const c = d.criteria[i];
  const v = typeof raw === 'number' ? raw : raw.trim() === '' ? NaN : Number(raw);
  if (c && Number.isFinite(v)) c.dealBreaker = v;
}

/** Apply raw 0–100 importances (from the pairwise helper or an accepted AI proposal). */
export function applyWeights(d: Decision, weights: readonly number[]) {
  d.criteria.forEach((c, i) => {
    const w = weights[i];
    if (w !== undefined && Number.isFinite(w)) c.weight = clamp(Math.round(w), 0, 100);
  });
}

/** Normalise scores defensively, e.g. after an import. */
export const sanitiseScores = (d: Decision) => d.criteria.forEach((c) => (c.scores = c.scores.map(toScore)));
