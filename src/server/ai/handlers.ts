/**
 * Pure request handlers for the four AI features. They take a `generate` dependency so
 * tests can run them with a fake model. Inputs are validated with Zod; outputs are
 * sanitised before they reach the UI.
 */
import type { z } from 'zod';
import {
  ChallengeOutput,
  ChallengeRequestSchema,
  GutOutput,
  GutRequestSchema,
  IntakeOutput,
  IntakeRequestSchema,
  MAX_GUT_QUESTIONS,
  MemoOutput,
  MemoRequestSchema,
  sanitiseChallenge,
  sanitiseGut,
  sanitiseIntake,
  type AiMemo,
  type Flag,
  type GutStep,
  type IntakeProposal,
} from '@/lib/ai/schemas';
import { inventedNumbers } from '@/lib/memo';
import { AiError } from './errors';
import type { Generate } from './generate';
import { CHALLENGE_SYSTEM, GUT_SYSTEM, INTAKE_SYSTEM, MEMO_SYSTEM } from './prompts';

function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new AiError('bad_request', r.error.issues[0]?.message ?? 'Invalid request.');
  return r.data;
}

/** Wrap user-provided text so the model treats it as data. */
const userInput = (s: string) => `<user_input>\n${s.replace(/<\/?user_input>/g, '')}\n</user_input>`;

export async function handleIntake(body: unknown, generate: Generate): Promise<{ proposal: IntakeProposal }> {
  const { description } = parseBody(IntakeRequestSchema, body);
  const out = await generate({
    schema: IntakeOutput,
    system: INTAKE_SYSTEM,
    user: `The user's dilemma:\n${userInput(description)}`,
    effort: 'medium',
  });
  const proposal = sanitiseIntake(out);
  if (!proposal)
    throw new AiError(
      'invalid_output',
      'The AI couldn’t find at least two options in that description. Name the options you are choosing between.',
    );
  return { proposal };
}

export async function handleChallenge(body: unknown, generate: Generate): Promise<{ flags: Flag[] }> {
  const { brief, context } = parseBody(ChallengeRequestSchema, body);
  const out = await generate({
    schema: ChallengeOutput,
    system: CHALLENGE_SYSTEM,
    user: `Worksheet (JSON):\n${JSON.stringify(brief)}\n\nWhat the user knows about the options:\n${userInput(context || '(nothing provided)')}`,
    effort: 'high',
  });
  return { flags: sanitiseChallenge(out, brief) };
}

export async function handleGut(body: unknown, generate: Generate): Promise<{ step: GutStep }> {
  const { brief, gutPick, transcript } = parseBody(GutRequestSchema, body);
  if (!brief.options.includes(gutPick)) throw new AiError('bad_request', 'The gut pick is not one of the options.');
  const mustFinish = transcript.length >= MAX_GUT_QUESTIONS;
  const convo = transcript.map((t, k) => `Q${k + 1}: ${t.question}\nA${k + 1}: ${userInput(t.answer)}`).join('\n\n');
  const out = await generate({
    schema: GutOutput,
    system: GUT_SYSTEM,
    user:
      `Worksheet (JSON):\n${JSON.stringify(brief)}\n\nThe criteria favour: ${brief.leader ?? 'none'}. The user's gut prefers: ${gutPick}.\n\n` +
      (convo ? `Interview so far:\n${convo}\n\n` : 'No questions asked yet.\n\n') +
      (mustFinish
        ? 'You have asked the maximum number of questions: set done to true now.'
        : `Questions asked: ${transcript.length} of ${MAX_GUT_QUESTIONS}.`),
    effort: 'medium',
    maxTokens: 4000,
  });
  return { step: sanitiseGut(mustFinish ? { ...out, done: true } : out, brief, transcript.length) };
}

export async function handleMemo(body: unknown, generate: Generate): Promise<{ memo: AiMemo }> {
  const { facts } = parseBody(MemoRequestSchema, body);
  const user = `Facts computed by the engine (the only figures you may use):\n${JSON.stringify(facts, null, 1)}`;
  let out = await generate({ schema: MemoOutput, system: MEMO_SYSTEM, user, effort: 'medium' });
  const textOf = (o: z.infer<typeof MemoOutput>) => [o.headline, ...o.sections.flatMap((s) => [s.heading, s.body])].join('\n');
  let bad = inventedNumbers(textOf(out), facts);
  if (bad.length) {
    // One corrective retry naming the offending figures.
    out = await generate({
      schema: MemoOutput,
      system: MEMO_SYSTEM,
      user: `${user}\n\nYour previous draft used figures that are not in the facts: ${bad.join(', ')}. Rewrite it using only figures from the facts.`,
      effort: 'medium',
    });
    bad = inventedNumbers(textOf(out), facts);
    if (bad.length)
      throw new AiError(
        'invalid_output',
        `The AI memo quoted figures that the engine didn’t produce (${bad.join(', ')}), so it was discarded. The standard memo below is unaffected.`,
      );
  }
  const sections = out.sections
    .filter((s) => s.heading.trim() && s.body.trim())
    .slice(0, 6)
    .map((s) => ({ heading: s.heading.trim().slice(0, 80), body: s.body.trim().slice(0, 1500) }));
  return { memo: { headline: out.headline.trim().slice(0, 300), sections } };
}
