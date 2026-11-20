'use client';
import { useState } from 'react';
import { aiRequest, useAi } from '@/lib/ai/client';
import type { AiMemo as Memo } from '@/lib/ai/schemas';
import type { MemoFacts } from '@/lib/memo';
import { AiError, AiNote, Spinner } from './common';

/** D. A plain-English memo written by the AI from the engine's figures only (checked server-side). */
export function AiMemo({ facts }: { facts: MemoFacts }) {
  const { active } = useAi();
  const [memo, setMemo] = useState<Memo | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!active) return null;

  const ask = async () => {
    setBusy(true);
    setErr(null);
    const r = await aiRequest<{ memo: Memo }>('memo', { facts });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setMemo(r.data.memo);
  };

  return (
    <section className="mt-7 border-t-2 border-ink pt-4" aria-labelledby="ai-memo-h" data-testid="ai-memo">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-memo-h" className="text-[19px]">
          Plain-English memo (AI draft)
        </h2>
        <div className="flex gap-2">
          <button type="button" className="btn" disabled={busy} onClick={ask}>
            {busy ? 'Writing…' : memo ? 'Redraft' : 'Draft with AI'}
          </button>
          {memo && (
            <button type="button" className="btn ghost" onClick={() => setMemo(null)}>
              Discard
            </button>
          )}
        </div>
      </div>
      {!memo && !busy && !err && (
        <p className="note no-print">
          The AI writes a readable summary using only the figures above. Any memo quoting a figure the app didn&apos;t calculate is
          rejected.
        </p>
      )}
      {busy && <Spinner label="Writing the memo from your results…" />}
      {err && <AiError message={err} onRetry={ask} />}
      {memo && (
        <div className="mt-2">
          <p className="mt-2 text-[18px] font-bold">{memo.headline}</p>
          {memo.sections.map((s, k) => (
            <div key={k} className="mt-4">
              <h3>{s.heading}</h3>
              <p className="mt-1 max-w-[66ch]">{s.body}</p>
            </div>
          ))}
          <AiNote> This draft was written by AI from the figures above; every number in it was checked against them.</AiNote>
        </div>
      )}
    </section>
  );
}
