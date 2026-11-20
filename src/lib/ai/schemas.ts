/**
 * Shapes for the AI layer, shared by route handlers and the UI.
 *
 * Two layers per feature:
 *  - `*Output` is what the model must produce (kept simple: structured outputs support
 *    a subset of JSON Schema, so ranges and counts are NOT enforced here);
 *  - `sanitise*` applies the real rules (clamping, counts, de-duplication, references
 *    to existing criteria/options) before anything reaches the UI.
 * The AI only ever proposes; nothing here mutates a decision.
 */
import { z } from 'zod';
import { LIMITS } from '@/engine/types';
import type { MemoFacts } from '@/lib/memo';

export const AI_FEATURES = ['intake', 'challenge', 'gut', 'memo'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const CERTAINTY_WORDS = ['sure', 'fairly_sure', 'guessing'] as const;
const certaintyWord = z.enum(CERTAINTY_WORDS);
export const certaintyIndex = (w: (typeof CERTAINTY_WORDS)[number]) => CERTAINTY_WORDS.indexOf(w) as 0 | 1 | 2;

/** Compact, model-facing description of a decision (names and numbers only). */
export const DecisionBriefSchema = z.object({
  title: z.string().max(200),
  options: z.array(z.string().max(80)).min(2).max(5),
  criteria: z
    .array(
      z.object({
        name: z.string().max(80),
        weightPercent: z.number(),
        scale: z.string().max(120),
        certainty: certaintyWord,
        /** Per option, in option order: the rating, or the raw value with unit in value mode. */
        ratings: z.array(z.string().max(60)),
        dealBreaker: z.string().max(80).nullable(),
      }),
    )
    .min(1)
    .max(10),
  leader: z.string().max(80).nullable(),
  totals: z.array(z.object({ option: z.string().max(80), total: z.string().max(10) })),
});
export type DecisionBrief = z.infer<typeof DecisionBriefSchema>;

/* ------------------------------ A. Intake ------------------------------ */

export const IntakeRequestSchema = z.object({
  description: z.string().trim().min(10, 'Describe the decision in a sentence or two.').max(4000),
});

export const IntakeOutput = z.object({
  title: z.string().describe('The decision as a short question, max 90 characters'),
  options: z.array(z.object({ name: z.string().describe('Short option name, max 40 characters') })).describe('2 to 5 options'),
  criteria: z
    .array(
      z.object({
        name: z.string().describe('Short criterion name, max 40 characters'),
        weight: z.number().describe('Importance 0-100; relative to the other criteria'),
        hint: z.string().describe('One-line note on what 10 means, e.g. "10 = lowest risk"; empty for value criteria'),
        useValues: z.boolean().describe('True only if this is naturally measured as a number (price, salary, hours, distance)'),
        unit: z.string().describe('Unit for value criteria, e.g. "₹", "₹ LPA", "hours"; empty otherwise'),
        higherIsBetter: z.boolean(),
        values: z
          .array(z.number().nullable())
          .describe('Raw values per option in option order, ONLY if the user stated them; otherwise all null'),
        dealBreaker: z
          .number()
          .nullable()
          .describe('A limit the user explicitly stated as non-negotiable (in the unit for value criteria, 1-10 otherwise); else null'),
        why: z.string().describe('One sentence: why this criterion matters for this user'),
      }),
    )
    .describe('4 to 8 criteria'),
  assumptions: z.array(z.string()).describe('Anything assumed that the user should check'),
});
export type IntakeOutput = z.infer<typeof IntakeOutput>;

export interface IntakeProposal {
  title: string;
  options: string[];
  criteria: {
    name: string;
    weight: number;
    hint: string;
    mode: 'score' | 'value';
    unit: string;
    direction: 1 | -1;
    values: (number | null)[];
    dealBreaker: number | null;
    why: string;
  }[];
  assumptions: string[];
}

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const uniqueBy = <T>(xs: T[], key: (x: T) => string) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = key(x).toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export function sanitiseIntake(o: IntakeOutput): IntakeProposal | null {
  const options = uniqueBy(
    o.options.map((x) => clip(x.name, LIMITS.nameMax)),
    (x) => x,
  ).slice(0, LIMITS.maxOptions);
  if (options.length < LIMITS.minOptions) return null;
  const criteria = uniqueBy(o.criteria, (c) => clip(c.name, LIMITS.nameMax))
    .slice(0, 8)
    .map((c) => {
      const mode: 'score' | 'value' = c.useValues ? 'value' : 'score';
      const values = options.map((_, j) => {
        const v = c.values?.[j];
        return mode === 'value' && typeof v === 'number' && Number.isFinite(v) ? v : null;
      });
      let dealBreaker = typeof c.dealBreaker === 'number' && Number.isFinite(c.dealBreaker) ? c.dealBreaker : null;
      if (mode === 'score' && dealBreaker !== null) dealBreaker = Math.min(10, Math.max(1, dealBreaker));
      return {
        name: clip(c.name, LIMITS.nameMax),
        weight: Math.round(Math.min(100, Math.max(0, Number.isFinite(c.weight) ? c.weight : 10))),
        hint: mode === 'score' ? clip(c.hint, 40) : '',
        mode,
        unit: mode === 'value' ? clip(c.unit, 16) : '',
        direction: (c.higherIsBetter ? 1 : -1) as 1 | -1,
        values,
        dealBreaker,
        why: clip(c.why, 200),
      };
    });
  if (!criteria.length) return null;
  if (criteria.every((c) => c.weight === 0)) criteria.forEach((c) => (c.weight = 10));
  return {
    title: clip(o.title, LIMITS.titleMax) || 'What am I deciding?',
    options,
    criteria,
    assumptions: o.assumptions.map((a) => clip(a, 240)).slice(0, 6),
  };
}

/* -------------------------- B. Score challenger -------------------------- */

export const ChallengeRequestSchema = z.object({
  brief: DecisionBriefSchema,
  /** What the user knows about the options, in their words (optional). */
  context: z.string().max(4000).default(''),
});

export const FLAG_KINDS = [
  'inconsistent_score',
  'double_counting',
  'missing_criterion',
  'scale_direction',
  'weight',
  'certainty',
  'other',
] as const;
export const SUGGESTION_ACTIONS = ['set_score', 'add_criterion', 'remove_criterion', 'set_weight', 'set_certainty', 'none'] as const;

export const ChallengeOutput = z.object({
  flags: z
    .array(
      z.object({
        kind: z.enum(FLAG_KINDS),
        title: z.string().describe('Short headline, max 80 characters'),
        explanation: z.string().describe('1-2 sentences citing the specific scores, names or context that raise the issue'),
        action: z.enum(SUGGESTION_ACTIONS).describe('The single concrete change you suggest, or none'),
        criterion: z
          .string()
          .nullable()
          .describe('Exact criterion name the action applies to (or the new criterion name for add_criterion)'),
        option: z.string().nullable().describe('Exact option name for set_score; else null'),
        score: z.number().nullable().describe('New 1-10 score for set_score; else null'),
        weight: z.number().nullable().describe('New 0-100 importance for set_weight / add_criterion; else null'),
        certainty: certaintyWord.nullable().describe('For set_certainty; else null'),
        hint: z.string().nullable().describe('Scale note for add_criterion, e.g. "10 = most familiar"; else null'),
      }),
    )
    .describe('At most 6 flags, most important first. Empty if nothing looks wrong.'),
});
export type ChallengeOutput = z.infer<typeof ChallengeOutput>;

export type Suggestion =
  | { action: 'set_score'; criterion: string; option: string; score: number }
  | { action: 'add_criterion'; criterion: string; weight: number; hint: string }
  | { action: 'remove_criterion'; criterion: string }
  | { action: 'set_weight'; criterion: string; weight: number }
  | { action: 'set_certainty'; criterion: string; certainty: (typeof CERTAINTY_WORDS)[number] }
  | { action: 'none' };

export interface Flag {
  id: string;
  kind: (typeof FLAG_KINDS)[number];
  title: string;
  explanation: string;
  suggestion: Suggestion;
}

/** Drop suggestions that reference criteria/options that don't exist, and clamp numbers. */
export function sanitiseChallenge(o: ChallengeOutput, brief: DecisionBrief): Flag[] {
  const crit = new Map(brief.criteria.map((c) => [c.name.toLowerCase(), c.name]));
  const opts = new Map(brief.options.map((x) => [x.toLowerCase(), x]));
  return o.flags.slice(0, 6).map((f, k): Flag => {
    const c = f.criterion ? crit.get(f.criterion.trim().toLowerCase()) : undefined;
    const op = f.option ? opts.get(f.option.trim().toLowerCase()) : undefined;
    let suggestion: Suggestion = { action: 'none' };
    if (f.action === 'set_score' && c && op && typeof f.score === 'number')
      suggestion = { action: 'set_score', criterion: c, option: op, score: Math.round(Math.min(10, Math.max(1, f.score)) * 2) / 2 };
    else if (f.action === 'add_criterion' && f.criterion && !c && brief.criteria.length < LIMITS.maxCriteria)
      suggestion = {
        action: 'add_criterion',
        criterion: clip(f.criterion, LIMITS.nameMax),
        weight: Math.round(Math.min(100, Math.max(1, f.weight ?? 15))),
        hint: clip(f.hint ?? '', 40),
      };
    else if (f.action === 'remove_criterion' && c && brief.criteria.length > 1) suggestion = { action: 'remove_criterion', criterion: c };
    else if (f.action === 'set_weight' && c && typeof f.weight === 'number')
      suggestion = { action: 'set_weight', criterion: c, weight: Math.round(Math.min(100, Math.max(0, f.weight))) };
    else if (f.action === 'set_certainty' && c && f.certainty)
      suggestion = { action: 'set_certainty', criterion: c, certainty: f.certainty };
    return { id: `f${k}`, kind: f.kind, title: clip(f.title, 100), explanation: clip(f.explanation, 400), suggestion };
  });
}

/* ---------------------------- C. Gut interview ---------------------------- */

export const MAX_GUT_QUESTIONS = 3;

export const GutRequestSchema = z.object({
  brief: DecisionBriefSchema,
  gutPick: z.string().max(80),
  transcript: z.array(z.object({ question: z.string().max(400), answer: z.string().max(1000) })).max(MAX_GUT_QUESTIONS),
});

export const GutOutput = z.object({
  done: z.boolean().describe('True when you are ready to propose a criterion (always true after 3 answers)'),
  question: z.string().nullable().describe('One short, open question (max 25 words) when done is false; else null'),
  proposal: z
    .object({
      name: z.string().describe('Short criterion name, max 40 characters'),
      why: z.string().describe('One sentence linking it to what the user said'),
      hint: z.string().describe('What 10 means on this criterion'),
      weight: z.number().describe('Suggested importance 0-100 relative to existing criteria'),
      scores: z.array(z.object({ option: z.string(), score: z.number() })).describe('1-10 score for EVERY option, from what the user said'),
    })
    .nullable()
    .describe('The missing criterion, when done is true; null if the answers revealed none'),
  summary: z.string().nullable().describe('When done: one sentence on what the conversation revealed'),
});
export type GutOutput = z.infer<typeof GutOutput>;

export interface GutProposal {
  name: string;
  why: string;
  hint: string;
  weight: number;
  /** In option order. */
  scores: number[];
}
export type GutStep = { done: false; question: string } | { done: true; proposal: GutProposal | null; summary: string };

export function sanitiseGut(o: GutOutput, brief: DecisionBrief, answered: number): GutStep {
  if (!o.done && o.question && answered < MAX_GUT_QUESTIONS) return { done: false, question: clip(o.question, 300) };
  const p = o.proposal;
  if (
    !p ||
    !p.name.trim() ||
    brief.criteria.some((c) => c.name.toLowerCase() === p.name.trim().toLowerCase()) ||
    brief.criteria.length >= LIMITS.maxCriteria
  )
    return { done: true, proposal: null, summary: clip(o.summary ?? 'No missing criterion stood out from your answers.', 300) };
  const byName = new Map(p.scores.map((s) => [s.option.trim().toLowerCase(), s.score]));
  return {
    done: true,
    summary: clip(o.summary ?? '', 300),
    proposal: {
      name: clip(p.name, LIMITS.nameMax),
      why: clip(p.why, 300),
      hint: clip(p.hint, 40),
      weight: Math.round(Math.min(100, Math.max(1, Number.isFinite(p.weight) ? p.weight : 15))),
      scores: brief.options.map((name) => {
        const v = byName.get(name.toLowerCase());
        return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(10, Math.max(1, v)) * 2) / 2 : 5;
      }),
    },
  };
}

/* ------------------------------ D. Memo ------------------------------ */

export const MemoRequestSchema = z.object({ facts: z.custom<MemoFacts>((v) => !!v && typeof v === 'object' && 'title' in (v as object)) });

export const MemoOutput = z.object({
  headline: z.string().describe('One-sentence bottom line'),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string().describe('Plain-English paragraph; quote figures exactly as given') }))
    .describe('3 to 6 short sections'),
});
export type MemoOutput = z.infer<typeof MemoOutput>;

export interface AiMemo {
  headline: string;
  sections: { heading: string; body: string }[];
}

/* ------------------------------ Envelope ------------------------------ */

export type AiErrorCode = 'unavailable' | 'rate_limited' | 'bad_request' | 'refused' | 'invalid_output' | 'upstream' | 'timeout';
export interface AiErrorBody {
  error: { code: AiErrorCode; message: string; retryAfter?: number };
}
