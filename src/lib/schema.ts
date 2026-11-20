/**
 * Zod validation for everything that enters the app from outside: imports, share links,
 * IndexedDB rows and AI proposals. Accepts the current format and the prototype's
 * export / localStorage formats, which are migrated on the way in.
 */
import { z } from 'zod';
import { LIMITS, TEMPLATE_KEYS, type Criterion, type Decision, type TemplateKey } from '@/engine/types';
import { clamp } from '@/engine/model';
import { newId } from './id';

export const FORMAT = 'decide-better';
export const FORMAT_VERSION = 1;

const toNum = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? NaN : typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
const finiteOr = (fallback: number, lo = -Infinity, hi = Infinity) =>
  z.unknown().transform((v) => {
    const n = toNum(v);
    return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
  });
const nullableFinite = z.unknown().transform((v) => {
  if (v === null || v === undefined) return null;
  const n = toNum(v);
  return Number.isFinite(n) ? n : null;
});
const text = (fallback: string, max: number) =>
  z.unknown().transform((v) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, max) : fallback));
const idField = z.unknown().transform((v) => (typeof v === 'string' && v ? v.slice(0, 80) : newId()));
const certainty = z.unknown().transform((v) => (v === 0 || v === 1 || v === 2 ? v : 1));
const direction = z.unknown().transform((v) => (Number(v) === -1 ? -1 : 1) as 1 | -1);
const templateKey = z.unknown().transform((v) => (TEMPLATE_KEYS.includes(v as TemplateKey) ? (v as TemplateKey) : 'blank'));
const score = finiteOr(5, 1, 10);

const OptionSchema = z.object({ id: idField, name: text('Option', LIMITS.nameMax) });

/* ---------------------------- current format ---------------------------- */

const CriterionSchema = z.object({
  id: idField,
  name: text('Criterion', LIMITS.nameMax),
  weight: finiteOr(10, 0, 100),
  hint: text('', 40),
  mode: z.unknown().transform((v) => (v === 'value' ? 'value' : 'score') as Criterion['mode']),
  direction,
  unit: text('', 16),
  scores: z.array(score),
  values: z.array(nullableFinite).optional(),
  certainty,
  dealBreaker: nullableFinite,
});

const withLengthChecks = <T extends { options: unknown[]; criteria: { scores: unknown[] }[] }>(d: T, ctx: z.RefinementCtx) => {
  const n = d.options.length;
  if (n < LIMITS.minOptions || n > LIMITS.maxOptions)
    ctx.addIssue({ code: 'custom', message: `A decision needs 2–5 options (found ${n}).` });
  const k = d.criteria.length;
  if (k < LIMITS.minCriteria || k > LIMITS.maxCriteria)
    ctx.addIssue({ code: 'custom', message: `A decision needs 1–10 criteria (found ${k}).` });
  d.criteria.forEach((c, i) => {
    if (c.scores.length !== n)
      ctx.addIssue({ code: 'custom', message: `Criterion ${i + 1} has ${c.scores.length} scores for ${n} options.` });
  });
};

export const DecisionSchema = z
  .object({
    id: idField,
    title: text('Untitled decision', LIMITS.titleMax),
    templateKey,
    gutOptionId: z.unknown().transform((v) => (typeof v === 'string' && v ? v : null)),
    varyWeights: z.unknown().transform((v) => v !== false),
    options: z.array(OptionSchema),
    criteria: z.array(CriterionSchema),
    createdAt: finiteOr(Date.now()),
    updatedAt: finiteOr(Date.now()),
  })
  .superRefine(withLengthChecks)
  .transform((d): Decision => {
    const n = d.options.length;
    return {
      ...d,
      gutOptionId: d.options.some((o) => o.id === d.gutOptionId) ? d.gutOptionId : null,
      criteria: d.criteria.map((c) => ({ ...c, values: c.values && c.values.length === n ? c.values : c.scores.map(() => null) })),
    };
  });

/* --------------------------- prototype format --------------------------- */

const ProtoCriterionSchema = z.object({
  id: idField,
  name: text('Criterion', LIMITS.nameMax),
  w: finiteOr(10, 0, 100),
  s: z.array(score),
  hint: text('', 40),
  mode: z.unknown().transform((v) => (v === 'value' ? 'value' : 'score') as Criterion['mode']),
  dir: direction,
  unit: text('', 16),
  v: z.array(nullableFinite).optional(),
  cert: certainty,
  min: nullableFinite,
});

export const PrototypeDecisionSchema = z
  .object({
    id: idField,
    title: text('Untitled decision', LIMITS.titleMax),
    tpl: templateKey,
    gut: z.unknown().transform((v) => (typeof v === 'string' && v ? v : null)),
    wNoise: z.unknown().transform((v) => v !== false),
    options: z.array(OptionSchema),
    criteria: z.array(ProtoCriterionSchema),
  })
  .transform((p) => ({ ...p, criteria: p.criteria.map((c) => ({ ...c, scores: c.s })) }))
  .superRefine(withLengthChecks)
  .transform((p): Decision => {
    const n = p.options.length;
    const now = Date.now();
    return {
      id: p.id,
      title: p.title,
      templateKey: p.tpl,
      gutOptionId: p.options.some((o) => o.id === p.gut) ? p.gut : null,
      varyWeights: p.wNoise,
      options: p.options,
      criteria: p.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        weight: c.w,
        hint: c.hint,
        mode: c.mode,
        direction: c.dir,
        unit: c.unit,
        scores: c.s,
        values: c.v && c.v.length === n ? c.v : c.s.map(() => null),
        certainty: c.cert,
        dealBreaker: c.min,
      })),
      createdAt: now,
      updatedAt: now,
    };
  });

/* ------------------------------- envelopes ------------------------------ */

export interface ExportEnvelope {
  format: typeof FORMAT;
  version: number;
  exportedAt: number;
  decisions: Decision[];
}

export const toExport = (decisions: Decision[]): ExportEnvelope => ({
  format: FORMAT,
  version: FORMAT_VERSION,
  exportedAt: Date.now(),
  decisions,
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const looksPrototype = (v: Record<string, unknown>) =>
  Array.isArray(v.criteria) && (v.criteria as unknown[]).some((c) => isObj(c) && Array.isArray(c.s));

/** Parse one decision in either format. Returns the Zod error message on failure. */
export function parseOne(raw: unknown): { ok: true; decision: Decision } | { ok: false; error: string } {
  if (!isObj(raw)) return { ok: false, error: 'Not a decision object.' };
  const res = looksPrototype(raw) ? PrototypeDecisionSchema.safeParse(raw) : DecisionSchema.safeParse(raw);
  if (res.success) return { ok: true, decision: res.data };
  return { ok: false, error: res.error.issues[0]?.message ?? 'Invalid decision.' };
}

export interface ImportResult {
  decisions: Decision[];
  errors: string[];
}

/**
 * Accepts: our export envelope, a bare decision (either format), an array of decisions,
 * or the prototype's localStorage library ({ cur, items: { id: decision } }).
 */
export function parseImport(input: string | unknown): ImportResult {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return { decisions: [], errors: ["That isn't valid JSON. Paste the full text you copied."] };
    }
  }
  let list: unknown[];
  if (Array.isArray(data)) list = data;
  else if (isObj(data) && Array.isArray(data.decisions)) list = data.decisions;
  else if (isObj(data) && isObj(data.items) && !Array.isArray(data.options)) list = Object.values(data.items);
  else list = [data];

  const decisions: Decision[] = [];
  const errors: string[] = [];
  list.forEach((item, k) => {
    const r = parseOne(item);
    if (r.ok) decisions.push(r.decision);
    else errors.push(list.length > 1 ? `Item ${k + 1}: ${r.error}` : r.error);
  });
  return { decisions, errors };
}
