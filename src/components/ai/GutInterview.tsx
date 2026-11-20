'use client';
import { useEffect, useMemo, useState } from 'react';
import { analyse, f2 } from '@/engine';
import { addGutCriterion } from '@/lib/ai/apply';
import { decisionBrief } from '@/lib/ai/brief';
import { aiRequest } from '@/lib/ai/client';
import { MAX_GUT_QUESTIONS, type GutProposal, type GutStep } from '@/lib/ai/schemas';
import { useWorkspace } from '../Workspace';
import { AiError, AiNote, Spinner } from './common';

/** C. When the gut pick disagrees with the leader, a short interview to surface the missing criterion. */
export function GutInterview() {
  const { d, a, change } = useWorkspace();
  const gutIdx = a.gut.kind === 'disagrees' ? a.gut.option : -1;
  const gutName = gutIdx >= 0 ? d.options[gutIdx]!.name : '';
  const [transcript, setTranscript] = useState<{ question: string; answer: string }[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<Extract<GutStep, { done: true }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  // A different decision or gut pick starts a fresh interview.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the subject of the interview changes
    setTranscript([]);
    setQuestion(null);
    setResult(null);
    setErr(null);
    setStatus('');
  }, [d.id, gutName]);

  const step = async (t: { question: string; answer: string }[]) => {
    setBusy(true);
    setErr(null);
    const r = await aiRequest<{ step: GutStep }>('gut', { brief: decisionBrief(a), gutPick: gutName, transcript: t });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    const s = r.data.step;
    if (s.done) {
      setQuestion(null);
      setResult(s);
    } else setQuestion(s.question);
  };

  const preview = useMemo(() => {
    const p = result?.proposal;
    if (!p) return null;
    const copy = structuredClone(d);
    if (!addGutCriterion(copy, p)) return null;
    const m = analyse(copy).model;
    return m.leader !== undefined
      ? { leader: copy.options[m.leader]!.name, score: f2(m.S[m.leader]!), gutWins: m.leader === gutIdx }
      : null;
  }, [result, d, gutIdx]);

  if (gutIdx < 0 && !status) return null;

  const accept = (p: GutProposal) => {
    let ok = false;
    change((x) => {
      ok = addGutCriterion(x, p);
    });
    setStatus(
      ok
        ? `Added “${p.name}”. Its scores are marked as a guess; adjust them in the matrix. Use Undo to reverse.`
        : 'That criterion already exists, so nothing was added.',
    );
    setResult(null);
  };

  return (
    <section className="panel no-print" aria-labelledby="gut-h" data-testid="gut-interview">
      <h2 id="gut-h" className="text-[20px]">
        What does your gut know?
      </h2>
      {status ? (
        <p className="mt-2" role="status">
          {status}
        </p>
      ) : (
        <>
          <p className="note">
            Your gut prefers {gutName}, but your criteria don&apos;t. Answer up to {MAX_GUT_QUESTIONS} short questions and the AI will
            suggest the criterion that may be missing.
          </p>
          {transcript.map((t, k) => (
            <div key={k} className="mt-3">
              <p className="lab">Question {k + 1}</p>
              <p className="font-semibold">{t.question}</p>
              <p className="text-mut">{t.answer}</p>
            </div>
          ))}
          {!question && !result && !busy && (
            <button type="button" className="btn pri mt-3" onClick={() => step(transcript)}>
              {transcript.length ? 'Continue' : 'Start the questions'}
            </button>
          )}
          {question && (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!answer.trim()) return;
                const t = [...transcript, { question, answer: answer.trim() }];
                setTranscript(t);
                setAnswer('');
                setQuestion(null);
                void step(t);
              }}
            >
              <label htmlFor="gut-answer" className="font-semibold">
                {question}
              </label>
              <textarea
                id="gut-answer"
                className="iobox min-h-[80px]"
                maxLength={1000}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="submit" className="btn pri" disabled={!answer.trim()}>
                  Answer
                </button>
                <button type="button" className="btn ghost" onClick={() => setQuestion(null)}>
                  Stop here
                </button>
              </div>
            </form>
          )}
          {busy && <Spinner label="Thinking about your answers…" />}
          {err && <AiError message={err} onRetry={() => step(transcript)} />}
          {result && (
            <div className="mt-3">
              <AiNote />
              {result.summary && <p className="mt-3">{result.summary}</p>}
              {result.proposal ? (
                <div className="gutb">
                  <p className="lab">Proposed criterion</p>
                  <p className="k mt-1">{result.proposal.name}</p>
                  <p>{result.proposal.why}</p>
                  <p className="mt-1 text-mut">
                    Importance {result.proposal.weight}
                    {result.proposal.hint && ` · ${result.proposal.hint}`} · scores:{' '}
                    {d.options.map((o, j) => `${o.name} ${result.proposal!.scores[j]}`).join(', ')}
                  </p>
                  {preview && (
                    <p className="mt-2 font-semibold">
                      If added as proposed: {preview.leader} would lead with {preview.score}
                      {preview.gutWins ? ' — your gut pick.' : '.'}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn pri" onClick={() => accept(result.proposal!)}>
                      Add this criterion
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setResult(null)}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-mut">No missing criterion was proposed.</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
