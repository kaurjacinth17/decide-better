'use client';
import { useEffect, useState } from 'react';
import { applySuggestion } from '@/lib/ai/apply';
import { decisionBrief } from '@/lib/ai/brief';
import { aiRequest } from '@/lib/ai/client';
import type { Flag, Suggestion } from '@/lib/ai/schemas';
import { useWorkspace } from '../Workspace';
import { AiError, AiNote, Spinner } from './common';

const KIND_LABEL: Record<Flag['kind'], string> = {
  inconsistent_score: 'Inconsistent score',
  double_counting: 'Double counting',
  missing_criterion: 'Missing criterion',
  scale_direction: 'Scale direction',
  weight: 'Weight',
  certainty: 'Certainty',
  other: 'Worth a look',
};

const CERT: Record<string, string> = { sure: 'Sure', fairly_sure: 'Fairly sure', guessing: 'Guessing' };

export function describeSuggestion(s: Suggestion): string | null {
  switch (s.action) {
    case 'set_score':
      return `Change ${s.option}'s ${s.criterion} score to ${s.score}`;
    case 'add_criterion':
      return `Add the criterion “${s.criterion}” at importance ${s.weight}${s.hint ? ` (${s.hint})` : ''}`;
    case 'remove_criterion':
      return `Remove the criterion “${s.criterion}”`;
    case 'set_weight':
      return `Set the importance of ${s.criterion} to ${s.weight}`;
    case 'set_certainty':
      return `Mark ${s.criterion} as “${CERT[s.certainty]}”`;
    default:
      return null;
  }
}

const ctxKey = (id: string) => `decide-better-context:${id}`;

/** B. AI reviews the matrix and flags likely issues; each flag can be accepted or dismissed. */
export function ChallengePanel() {
  const { d, a, change } = useWorkspace();
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [state, setState] = useState<Record<string, 'accepted' | 'dismissed' | 'stale'>>({});

  // Context notes are kept per decision on this device.
  useEffect(() => {
    let saved = '';
    try {
      saved = localStorage.getItem(ctxKey(d.id)) ?? '';
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load per-decision notes when switching decisions
    setContext(saved);
    setFlags(null);
    setState({});
    setErr(null);
  }, [d.id]);

  const saveContext = (v: string) => {
    setContext(v);
    try {
      localStorage.setItem(ctxKey(d.id), v);
    } catch {
      /* ignore */
    }
  };

  const ask = async () => {
    setBusy(true);
    setErr(null);
    const r = await aiRequest<{ flags: Flag[] }>('challenge', { brief: decisionBrief(a), context });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setFlags(r.data.flags);
    setState({});
  };

  const accept = (f: Flag) => {
    let ok = false;
    change((x) => {
      ok = applySuggestion(x, f.suggestion);
    });
    setState((s) => ({ ...s, [f.id]: ok ? 'accepted' : 'stale' }));
  };

  const open = flags?.filter((f) => !state[f.id]) ?? [];
  return (
    <section className="panel no-print" aria-labelledby="chal-h" data-testid="challenge">
      <h2 id="chal-h" className="text-[20px]">
        Challenge my scores
      </h2>
      <p className="note">The AI reviews your worksheet for inconsistent scores, double counting and missing criteria.</p>
      <label htmlFor="chal-ctx" className="lab mt-3 block">
        What do you know about the options? (optional, kept on this device)
      </label>
      <textarea
        id="chal-ctx"
        className="iobox min-h-[90px]"
        maxLength={4000}
        value={context}
        placeholder="e.g. The new company is a little-known startup; my current team is great."
        onChange={(e) => saveContext(e.target.value)}
      />
      <button type="button" className="btn pri mt-3" disabled={busy} onClick={ask}>
        {busy ? 'Reviewing…' : flags ? 'Review again' : 'Challenge my scores'}
      </button>
      {busy && <Spinner label="Reviewing your worksheet…" />}
      {err && <AiError message={err} onRetry={ask} />}
      {flags && (
        <>
          <AiNote />
          {flags.length === 0 && <p className="mt-3">Nothing stood out. Your scores look consistent with what you&apos;ve described.</p>}
          <ul className="mt-3 grid gap-3" aria-label="Flags">
            {flags.map((f) => {
              const st = state[f.id];
              const what = describeSuggestion(f.suggestion);
              return (
                <li key={f.id} className="gutb mt-0" data-testid="flag">
                  <p className="lab">{KIND_LABEL[f.kind]}</p>
                  <p className="font-bold">{f.title}</p>
                  <p>{f.explanation}</p>
                  {what && <p className="mt-1">Suggestion: {what}.</p>}
                  {st ? (
                    <p className="small" role="status">
                      {st === 'accepted'
                        ? 'Applied. Use Undo to reverse it.'
                        : st === 'dismissed'
                          ? 'Dismissed.'
                          : 'This no longer matches your worksheet, so nothing was changed.'}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {what && (
                        <button type="button" className="btn pri" onClick={() => accept(f)}>
                          Accept
                        </button>
                      )}
                      <button type="button" className="btn ghost" onClick={() => setState((s) => ({ ...s, [f.id]: 'dismissed' }))}>
                        {what ? 'Dismiss' : 'Noted'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {flags.length > 0 && open.length === 0 && <p className="small">All flags handled.</p>}
        </>
      )}
    </section>
  );
}
