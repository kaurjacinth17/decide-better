'use client';
import { useEffect, useRef, useState } from 'react';
import { allPairs, pairwiseWeights, pc, toRawWeights, type PairAnswer } from '@/engine';
import { applyWeights } from '@/store/ops';
import { useWorkspace } from './Workspace';

export function WeightHelper({ open, onClose }: { open: boolean; onClose(): void }) {
  const { d, change } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const n = d.criteria.length;
  const pairs = allPairs(n);
  const [answers, setAnswers] = useState<(PairAnswer | null)[]>([]);
  const [k, setK] = useState(0);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setAnswers(pairs.map(() => null));
      setK(0);
      dlg.showModal();
    } else if (!open && dlg.open) dlg.close();
    // pairs depends only on n
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, n]);

  // Move focus to the selected (or neutral) answer on each step, as the prototype does.
  useEffect(() => {
    if (open) requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[data-focus]')?.focus());
  }, [open, k]);

  const P = pairs.length;
  const done = k >= P;
  const result = done ? pairwiseWeights(n, answers) : null;
  const pair = pairs[k];
  const A = pair ? d.criteria[pair[0]]!.name : '';
  const B = pair ? d.criteria[pair[1]]!.name : '';
  const opts: [PairAnswer, string][] = [
    [-2, `${A}, by a lot`],
    [-1, `${A}, a little`],
    [0, 'About the same'],
    [1, `${B}, a little`],
    [2, `${B}, by a lot`],
  ];
  const rows = result ? d.criteria.map((c, i) => ({ c, w: result.weights[i]! })).sort((x, y) => y.w - x.w) : [];

  return (
    <dialog
      ref={ref}
      className="dlg m-auto"
      aria-labelledby="pwh"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="pwh">{done ? 'Suggested weights' : 'Which matters more to you?'}</h2>
        <button type="button" className="x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {!done && pair ? (
        <>
          <p className="note">
            Question {k + 1} of {P}. Answer by instinct; the weights come from all your answers together.
          </p>
          <div className="pgb" role="progressbar" aria-valuemin={0} aria-valuemax={P} aria-valuenow={k} aria-label="Progress">
            <i style={{ width: `${((k / P) * 100).toFixed(1)}%` }} />
          </div>
          <p className="vs">
            <b>{A}</b>
            <span>or</span>
            <b>{B}</b>
          </p>
          <div className="grid gap-2">
            {opts.map(([v, t]) => {
              const sel = answers[k] === v;
              return (
                <button
                  key={v}
                  type="button"
                  className={`btn justify-start text-left ${sel ? 'pri' : ''}`}
                  data-focus={sel || (answers[k] == null && v === 0) ? '' : undefined}
                  onClick={() => {
                    setAnswers((a) => a.map((x, q) => (q === k ? v : x)));
                    setK(k + 1);
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn ghost" disabled={k === 0} onClick={() => setK(k - 1)}>
              Back
            </button>
          </div>
        </>
      ) : (
        result && (
          <>
            <p className="note">
              From your {P} answers.{' '}
              {result.consistent
                ? 'Your answers were consistent with each other.'
                : 'Some answers pull in different directions, so treat these as a rough guide and adjust the sliders if they feel off.'}
            </p>
            <div className="bars">
              {rows.map((r) => (
                <div key={r.c.id} className="br">
                  <span className="bn">{r.c.name}</span>
                  <span className="bv">{pc(r.w)}</span>
                  <span className="bt" aria-hidden="true">
                    <i style={{ width: `${((r.w / rows[0]!.w) * 100).toFixed(1)}%`, background: 'var(--ink)' }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn pri"
                data-focus=""
                onClick={() => {
                  change((x) => applyWeights(x, toRawWeights(result.weights)));
                  onClose();
                }}
              >
                Apply these weights
              </button>
              <button type="button" className="btn ghost" onClick={() => setK(k - 1)}>
                Back
              </button>
            </div>
          </>
        )
      )}
    </dialog>
  );
}
