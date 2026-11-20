import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { analyse, simulate, toSimInput } from '@/engine';
import { decisionBrief } from '@/lib/ai/brief';
import { proposalToDecision, applySuggestion, addGutCriterion } from '@/lib/ai/apply';
import { memoFacts } from '@/lib/memo';
import { AiError } from '@/server/ai/errors';
import type { Generate } from '@/server/ai/generate';
import { handleChallenge, handleGut, handleIntake, handleMemo } from '@/server/ai/handlers';
import { createRateLimiter } from '@/server/ai/rateLimit';
import { aiRoute, SESSION_COOKIE } from '@/server/ai/route';
import { tpl } from './helpers';

/** A fake model that returns canned outputs in order and records what it was asked. */
function fake(...outputs: unknown[]) {
  const calls: { system: string; user: string; effort: string }[] = [];
  const gen = (async (spec) => {
    calls.push({ system: spec.system, user: spec.user, effort: spec.effort });
    const next = outputs.shift();
    if (next instanceof Error) throw next;
    return spec.schema.parse(next);
  }) as Generate;
  return { gen, calls };
}

const job = tpl('job');
const jobBrief = decisionBrief(analyse(job));

describe('A. intake', () => {
  const out = {
    title: 'Should I take the Pune offer or stay in Mumbai?',
    options: [{ name: 'Stay in Mumbai' }, { name: 'Pune offer' }, { name: 'pune offer' }],
    criteria: [
      {
        name: 'Salary',
        weight: 140,
        hint: '',
        useValues: true,
        unit: '₹ LPA',
        higherIsBetter: true,
        values: [18, 24, 99],
        dealBreaker: null,
        why: 'Money matters.',
      },
      {
        name: 'Commute',
        weight: 20,
        hint: '10 = shortest',
        useValues: false,
        unit: 'km',
        higherIsBetter: true,
        values: [5, 5],
        dealBreaker: 15,
        why: 'Hates commuting.',
      },
      {
        name: 'salary',
        weight: 10,
        hint: '',
        useValues: false,
        unit: '',
        higherIsBetter: true,
        values: [],
        dealBreaker: null,
        why: 'dupe',
      },
    ],
    assumptions: ['Assumed the Pune role is permanent.'],
  };

  it('sanitises: dedupes names, clamps weights, drops values in score mode, clamps score deal-breakers', async () => {
    const { gen, calls } = fake(out);
    const { proposal } = await handleIntake({ description: 'I have an offer in Pune for 24 LPA; I earn 18 in Mumbai.' }, gen);
    expect(proposal.options).toEqual(['Stay in Mumbai', 'Pune offer']);
    expect(proposal.criteria.map((c) => c.name)).toEqual(['Salary', 'Commute']);
    expect(proposal.criteria[0]).toMatchObject({ weight: 100, mode: 'value', values: [18, 24], direction: 1, unit: '₹ LPA' });
    expect(proposal.criteria[1]).toMatchObject({ mode: 'score', values: [null, null], dealBreaker: 10, unit: '' });
    expect(calls[0]!.user).toContain('<user_input>');
  });

  it('builds a valid decision from accepted items only', async () => {
    const { gen } = fake(out);
    const { proposal } = await handleIntake({ description: 'I have an offer in Pune for 24 LPA; I earn 18 in Mumbai.' }, gen);
    const d = proposalToDecision(proposal, { title: proposal.title, options: [true, true], criteria: [true, false] });
    expect(d.criteria).toHaveLength(1);
    expect(d.criteria[0]!.scores).toEqual([5, 5]);
    expect(analyse(d).model.S.map((s) => s.toFixed(2))).toEqual(['7.50', '10.00']);
  });

  it('rejects short descriptions and proposals without two options', async () => {
    await expect(handleIntake({ description: 'hi' }, fake().gen)).rejects.toMatchObject({ code: 'bad_request' });
    await expect(
      handleIntake({ description: 'A long enough description here.' }, fake({ ...out, options: [{ name: 'Only one' }] }).gen),
    ).rejects.toMatchObject({
      code: 'invalid_output',
    });
  });
});

describe('B. score challenger', () => {
  it('keeps suggestions that reference real names and drops ones that do not', async () => {
    const base = { title: 't', explanation: 'e', option: null, score: null, weight: null, certainty: null, hint: null };
    const { gen } = fake({
      flags: [
        { ...base, kind: 'inconsistent_score', action: 'set_score', criterion: 'brand', option: 'switch to new job', score: 3.3 },
        { ...base, kind: 'missing_criterion', action: 'add_criterion', criterion: 'Commute', weight: 400, hint: '10 = shortest' },
        { ...base, kind: 'weight', action: 'set_weight', criterion: 'Nonexistent', weight: 50 },
        { ...base, kind: 'double_counting', action: 'add_criterion', criterion: 'Growth' },
      ],
    });
    const { flags } = await handleChallenge({ brief: jobBrief, context: 'The new company is an unknown startup.' }, gen);
    expect(flags[0]!.suggestion).toEqual({ action: 'set_score', criterion: 'Brand', option: 'Switch to new job', score: 3.5 });
    expect(flags[1]!.suggestion).toEqual({ action: 'add_criterion', criterion: 'Commute', weight: 100, hint: '10 = shortest' });
    expect(flags[2]!.suggestion).toEqual({ action: 'none' });
    expect(flags[3]!.suggestion).toEqual({ action: 'none' }); // "Growth" already exists
  });

  it('applying a suggestion is an explicit, undoable edit on a copy', () => {
    const d = structuredClone(job);
    expect(applySuggestion(d, { action: 'set_score', criterion: 'Brand', option: 'Switch to new job', score: 3.5 })).toBe(true);
    expect(d.criteria[3]!.scores[1]).toBe(3.5);
    expect(applySuggestion(d, { action: 'set_certainty', criterion: 'Brand', certainty: 'guessing' })).toBe(true);
    expect(d.criteria[3]!.certainty).toBe(2);
    expect(applySuggestion(d, { action: 'add_criterion', criterion: 'Commute', weight: 20, hint: 'x' })).toBe(true);
    expect(d.criteria.at(-1)).toMatchObject({ name: 'Commute', weight: 20, scores: [5, 5] });
    expect(applySuggestion(d, { action: 'set_score', criterion: 'Nope', option: 'Stay in current job', score: 1 })).toBe(false);
    expect(job.criteria[3]!.scores[1]).toBe(7); // original untouched
  });
});

describe('C. gut interview', () => {
  const req = (n: number) => ({
    brief: jobBrief,
    gutPick: 'Stay in current job',
    transcript: Array.from({ length: n }, (_, k) => ({ question: `Q${k}`, answer: `A${k}` })),
  });

  it('asks a question first', async () => {
    const { gen } = fake({ done: false, question: 'What would you miss most?', proposal: null, summary: null });
    expect((await handleGut(req(0), gen)).step).toEqual({ done: false, question: 'What would you miss most?' });
  });

  it('forces a proposal after 3 answers and scores every option', async () => {
    const { gen, calls } = fake({
      done: false,
      question: 'One more?',
      proposal: {
        name: 'Team loyalty',
        why: 'You mentioned your team twice.',
        hint: '10 = closest team',
        weight: 25,
        scores: [{ option: 'stay in current job', score: 9 }],
      },
      summary: 'Your team matters.',
    });
    const { step } = await handleGut(req(3), gen);
    expect(calls[0]!.user).toContain('set done to true now');
    expect(step).toMatchObject({ done: true, proposal: { name: 'Team loyalty', weight: 25, scores: [9, 5] } });
  });

  it('never proposes an existing criterion; adding a proposal can change the leader', async () => {
    const dup = fake({
      done: true,
      question: null,
      proposal: { name: 'growth', why: '', hint: '', weight: 10, scores: [] },
      summary: null,
    });
    expect((await handleGut(req(1), dup.gen)).step).toMatchObject({ done: true, proposal: null });
    const d = structuredClone(job);
    addGutCriterion(d, { name: 'Team loyalty', why: '', hint: '10 = closest', weight: 60, scores: [10, 2] });
    expect(analyse(d).model.leader).toBe(0); // Stay now leads
  });

  it('rejects a gut pick that is not an option', async () => {
    await expect(handleGut({ ...req(0), gutPick: 'Elsewhere' }, fake().gen)).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe('D. memo', () => {
  const a = analyse(job);
  const facts = memoFacts(a, simulate(toSimInput(a.model)!));
  const good = {
    headline: 'Switch to new job leads with 7.35 out of 10.',
    sections: [{ heading: 'Why', body: 'It wins 86% of 2,000 runs; Growth is worth +0.90.' }],
  };
  const bad = { headline: 'Switch leads by 0.7 points.', sections: [{ heading: 'Money', body: 'You would earn 6 LPA more.' }] };

  it('passes the engine facts and accepts a memo quoting only those figures', async () => {
    const { gen, calls } = fake(good);
    const { memo } = await handleMemo({ facts }, gen);
    expect(memo.headline).toContain('7.35');
    expect(calls[0]!.user).toContain('"winShare": "86%"');
  });

  it('retries once when figures are invented, then succeeds', async () => {
    const { gen, calls } = fake(bad, good);
    const { memo } = await handleMemo({ facts }, gen);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.user).toContain('not in the facts: 0.7');
    expect(memo.sections[0]!.body).toContain('86%');
  });

  it('discards a memo that keeps inventing figures', async () => {
    await expect(handleMemo({ facts }, fake(bad, bad).gen)).rejects.toMatchObject({ code: 'invalid_output' });
  });
});

describe('route plumbing', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new NextRequest('http://localhost/api/ai/intake', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
    });
  const deps = (over: Partial<Parameters<typeof aiRoute>[1] & object> = {}) => ({
    generate: fake().gen,
    configured: () => true,
    limiter: createRateLimiter(2, 60_000),
    ipLimiter: createRateLimiter(100, 60_000),
    ...over,
  });

  it('returns 503 "unavailable" when no key is configured, without calling the model', async () => {
    const handler = vi.fn();
    const res = await aiRoute(handler, deps({ configured: () => false }))(post({}));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('unavailable');
    expect(handler).not.toHaveBeenCalled();
  });

  it('sets a session cookie and rate-limits per session', async () => {
    const route = aiRoute(async () => ({ ok: true }), deps());
    const first = await route(post({}));
    expect(first.status).toBe(200);
    const sid = first.cookies.get(SESSION_COOKIE)!.value;
    expect(sid).toMatch(/^[0-9a-f]{32}$/);
    const withCookie = { cookie: `${SESSION_COOKIE}=${sid}` };
    expect((await route(post({}, withCookie))).status).toBe(200);
    const third = await route(post({}, withCookie));
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBeTruthy();
    expect((await third.json()).error.code).toBe('rate_limited');
  });

  it('rejects cross-site requests and malformed JSON', async () => {
    const route = aiRoute(async () => ({ ok: true }), deps());
    expect((await route(post({}, { origin: 'https://evil.example' }))).status).toBe(400);
    const raw = new NextRequest('http://localhost/api/ai/intake', { method: 'POST', body: '{nope' });
    expect((await (await route(raw)).json()).error.message).toMatch(/valid JSON/);
  });

  it('maps SDK errors to friendly codes and never leaks details', async () => {
    const headers = new Headers();
    const cases: [unknown, string, number][] = [
      [
        new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'x' } }, 'secret detail', headers),
        'rate_limited',
        429,
      ],
      [new Anthropic.AuthenticationError(401, undefined, 'sk-ant-leaked', headers), 'unavailable', 503],
      [new Anthropic.InternalServerError(529, undefined, 'overloaded', headers), 'upstream', 502],
      [new Anthropic.APIConnectionTimeoutError(), 'timeout', 504],
      [new AiError('refused', 'The AI declined to help with this request.'), 'refused', 422],
    ];
    for (const [err, code, status] of cases) {
      const route = aiRoute(async () => {
        throw err;
      }, deps());
      const res = await route(post({}));
      const body = await res.json();
      expect(res.status).toBe(status);
      expect(body.error.code).toBe(code);
      expect(JSON.stringify(body)).not.toMatch(/sk-ant|secret detail/);
    }
  });
});
