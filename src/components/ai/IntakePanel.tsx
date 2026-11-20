'use client';
import { useState } from 'react';
import { fmtValue } from '@/engine';
import { proposalToDecision } from '@/lib/ai/apply';
import { aiRequest } from '@/lib/ai/client';
import type { IntakeProposal } from '@/lib/ai/schemas';
import { actions } from '@/store/appStore';
import { AiError, AiNote, Spinner } from './common';

/** A. Describe the dilemma in plain text; review the proposed worksheet item by item. */
export function IntakePanel() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [p, setP] = useState<IntakeProposal | null>(null);
  const [title, setTitle] = useState('');
  const [keepO, setKeepO] = useState<boolean[]>([]);
  const [keepC, setKeepC] = useState<boolean[]>([]);
  const [done, setDone] = useState('');

  const ask = async () => {
    setBusy(true);
    setErr(null);
    setDone('');
    const r = await aiRequest<{ proposal: IntakeProposal }>('intake', { description: text });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    const prop = r.data.proposal;
    setP(prop);
    setTitle(prop.title);
    setKeepO(prop.options.map(() => true));
    setKeepC(prop.criteria.map(() => true));
  };

  const edit = (fn: (x: IntakeProposal) => void) =>
    setP((x) => {
      if (!x) return x;
      const c = structuredClone(x);
      fn(c);
      return c;
    });

  const keptOptions = keepO.filter(Boolean).length;
  const keptCriteria = keepC.filter(Boolean).length;
  const create = () => {
    if (!p) return;
    try {
      const d = proposalToDecision(p, { title, options: keepO, criteria: keepC });
      actions().add(d, { freshId: true });
      setDone(
        `Created “${d.title}” with ${d.options.length} options and ${d.criteria.length} criteria. Every option starts at a neutral 5 — score them yourself below.`,
      );
      setP(null);
      setText('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the decision.');
    }
  };

  return (
    <details className="panel no-print mt-4" data-testid="intake">
      <summary className="flex min-h-11 cursor-pointer items-center font-bold">Start from a description (AI)</summary>
      <p className="note">
        Describe the decision in your own words — the options, what matters, any hard limits. The AI proposes a worksheet; you choose what
        to keep.
      </p>
      <label htmlFor="intake-text" className="sr-only-x">
        Describe your dilemma
      </label>
      <textarea
        id="intake-text"
        className="iobox"
        maxLength={4000}
        value={text}
        placeholder="e.g. I've been offered a product role in Pune at 24 LPA. I earn 18 LPA in Mumbai and my family is here. I can't take a job with more than an hour's commute."
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn pri" disabled={busy || text.trim().length < 10} onClick={ask}>
          {busy ? 'Thinking…' : p ? 'Suggest again' : 'Suggest a worksheet'}
        </button>
      </div>
      {busy && <Spinner label="Drafting a worksheet from your description…" />}
      {err && <AiError message={err} onRetry={ask} />}
      {done && (
        <p className="small" role="status">
          {done}
        </p>
      )}
      {p && (
        <div className="mt-4 grid gap-4" aria-label="Proposed worksheet">
          <AiNote />
          <label className="grid gap-1">
            <span className="lab">Proposed title</span>
            <input className="fld w-full" value={title} maxLength={90} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <fieldset>
            <legend className="lab mb-1">Options ({keptOptions} kept, need at least 2)</legend>
            <ul className="grid gap-1">
              {p.options.map((o, j) => (
                <li key={j} className="flex items-center gap-2">
                  <span aria-hidden="true" className="w-4 font-bold text-brick">
                    {keepO[j] ? '+' : '–'}
                  </span>
                  <label className="chk min-w-11 justify-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      aria-label={`Keep option ${o}`}
                      checked={!!keepO[j]}
                      onChange={(e) => setKeepO((k) => k.map((x, q) => (q === j ? e.target.checked : x)))}
                    />
                  </label>
                  <input
                    className="fld flex-1"
                    aria-label={`Option ${j + 1} name`}
                    value={o}
                    maxLength={40}
                    onChange={(e) => edit((x) => void (x.options[j] = e.target.value))}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
          <fieldset>
            <legend className="lab mb-1">Criteria ({keptCriteria} kept)</legend>
            <ul className="grid gap-3">
              {p.criteria.map((c, i) => (
                <li key={i} className="grid gap-1 border-b border-rule pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span aria-hidden="true" className="w-4 font-bold text-brick">
                      {keepC[i] ? '+' : '–'}
                    </span>
                    <label className="chk min-w-11 justify-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        aria-label={`Keep criterion ${c.name}`}
                        checked={!!keepC[i]}
                        onChange={(e) => setKeepC((k) => k.map((x, q) => (q === i ? e.target.checked : x)))}
                      />
                    </label>
                    <input
                      className="fld flex-1"
                      aria-label={`Criterion ${i + 1} name`}
                      value={c.name}
                      maxLength={40}
                      onChange={(e) => edit((x) => void (x.criteria[i]!.name = e.target.value))}
                    />
                    <label className="flex items-center gap-1">
                      <span className="rl">Importance</span>
                      <input
                        className="fld sm"
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`Importance of ${c.name}`}
                        value={c.weight}
                        onChange={(e) =>
                          edit((x) => void (x.criteria[i]!.weight = Math.max(0, Math.min(100, Number(e.target.value) || 0))))
                        }
                      />
                    </label>
                  </div>
                  <p className="pl-6 text-[14px] text-mut">
                    {c.mode === 'value'
                      ? `Actual values${c.unit ? ` in ${c.unit}` : ''}, ${c.direction > 0 ? 'higher' : 'lower'} is better${
                          c.values.some((v) => v !== null)
                            ? ` · from your description: ${c.values
                                .map((v, j) => (v === null ? null : `${p.options[j]} ${fmtValue(v, c.unit)}`))
                                .filter(Boolean)
                                .join(', ')}`
                            : ''
                        }`
                      : c.hint || '1–10 rating'}
                    {c.dealBreaker !== null &&
                      ` · deal-breaker: ${c.mode === 'value' ? `${c.direction > 0 ? 'at least' : 'at most'} ${fmtValue(c.dealBreaker, c.unit)}` : `at least ${c.dealBreaker}`}`}
                    {c.why && <> · {c.why}</>}
                  </p>
                </li>
              ))}
            </ul>
          </fieldset>
          {p.assumptions.length > 0 && (
            <div>
              <p className="lab">Assumptions to check</p>
              <ul className="mv">
                {p.assumptions.map((a, k) => (
                  <li key={k}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn pri" disabled={keptOptions < 2 || keptCriteria < 1} onClick={create}>
              Create decision from kept items
            </button>
            <button type="button" className="btn ghost" onClick={() => setP(null)}>
              Discard proposal
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
