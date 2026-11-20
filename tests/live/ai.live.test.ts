/**
 * Live smoke test of the four AI features against the real API.
 * Skipped unless ANTHROPIC_API_KEY is set (e.g. `set -a; . ./.env.local; pnpm test:live`).
 */
import { describe, expect, it } from 'vitest';
import { analyse, simulate, toSimInput } from '@/engine';
import { decisionBrief } from '@/lib/ai/brief';
import { inventedNumbers, memoFacts } from '@/lib/memo';
import { aiConfigured, aiModel, generate } from '@/server/ai/generate';
import { handleChallenge, handleGut, handleIntake, handleMemo } from '@/server/ai/handlers';
import { fromTemplate } from '@/templates';

const live = aiConfigured() ? describe : describe.skip;

live(`live AI (${aiModel()})`, () => {
  const job = fromTemplate('job');
  const a = analyse(job);
  const brief = decisionBrief(a);

  it('A. intake returns a usable proposal', async () => {
    const { proposal } = await handleIntake(
      {
        description:
          'I have an offer in Pune at 24 LPA. I earn 18 LPA in Mumbai where my parents live. I will not commute more than an hour each way.',
      },
      generate,
    );
    expect(proposal.options.length).toBeGreaterThanOrEqual(2);
    expect(proposal.criteria.length).toBeGreaterThanOrEqual(1);
  });

  it('B. challenger returns well-formed flags', async () => {
    const { flags } = await handleChallenge({ brief, context: 'The new company is a little-known startup.' }, generate);
    expect(Array.isArray(flags)).toBe(true);
  });

  it('C. gut interview asks a question', async () => {
    const { step } = await handleGut({ brief, gutPick: 'Stay in current job', transcript: [] }, generate);
    expect(step.done || step.question.length > 5).toBe(true);
  });

  it('D. memo quotes only engine figures', async () => {
    const facts = memoFacts(a, simulate(toSimInput(a.model)!));
    const { memo } = await handleMemo({ facts }, generate);
    const text = [memo.headline, ...memo.sections.map((s) => s.body)].join('\n');
    expect(inventedNumbers(text, facts)).toEqual([]);
  });
});
