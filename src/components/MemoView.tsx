'use client';
import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import type { Analysis, SimResult } from '@/engine';
import { deterministicMemo, memoFacts, type MemoFacts } from '@/lib/memo';
import { useCurrent } from '@/store/appStore';
import { Brand } from './Header';
import { useAnalysis } from './hooks';
import { StoreGate } from './StoreGate';
import { useSimulation } from './useSimulation';
import { AiMemo } from './ai/AiMemo';

export function MemoDocument({ facts, children }: { facts: MemoFacts; children?: ReactNode }) {
  const sections = deterministicMemo(facts);
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <article className="memo panel mx-auto max-w-[760px]" aria-labelledby="memo-title">
      <div className="flex items-center justify-between gap-4 border-b-2 border-ink pb-3">
        <Brand />
        <p className="lab">Decision memo · {date}</p>
      </div>
      <h1 id="memo-title" className="mt-5 text-[clamp(28px,4vw,40px)] font-extrabold">
        {facts.title}
      </h1>
      {sections.map((s) => (
        <section key={s.heading} className="mt-6">
          <h2 className="text-[19px]">{s.heading}</h2>
          {s.paragraphs.map((p, k) => (
            <p key={k} className="mt-2 max-w-[66ch]">
              {p}
            </p>
          ))}
        </section>
      ))}
      <section className="mt-7">
        <h2 className="text-[19px]">Scores</h2>
        <div className="scroll" tabIndex={0} role="region" aria-label="Memo score table, scrolls sideways">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col" className="n">
                  Weight
                </th>
                {facts.criteria[0]?.ratings.map((r) => (
                  <th key={r.option} scope="col" className="n">
                    {r.option}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facts.criteria.map((c) => (
                <tr key={c.name}>
                  <td>
                    {c.name}
                    <small>
                      {c.scale} · {c.certainty.toLowerCase()}
                    </small>
                  </td>
                  <td className="n">{c.weight}</td>
                  {c.ratings.map((r) => (
                    <td key={r.option} className="n">
                      {r.shown}
                      {r.shown !== r.score && <small>score {r.score}</small>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="n">100%</td>
                {facts.criteria[0]?.ratings.map((r) => {
                  const t = facts.totals.find((x) => x.option === r.option);
                  return (
                    <td key={r.option} className="tot">
                      {t?.score}
                      {t?.ruledOut && <small>ruled out</small>}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      {children}
      <p className="small border-t border-rule pt-3">
        Calculated by Decide Better from the weights and scores entered. Totals are weighted averages on a 1–10 scale; win shares come from
        2,000 simulations that vary each score by how sure you said you were.
      </p>
    </article>
  );
}

export function useMemoFacts(): { facts: MemoFacts; a: Analysis; sim: SimResult | null; pending: boolean } {
  const d = useCurrent();
  const a = useAnalysis(d)!;
  const { sim, pending } = useSimulation(a);
  const facts = useMemo(() => memoFacts(a, sim), [a, sim]);
  return { facts, a, sim, pending };
}

function Memo() {
  const { facts, pending } = useMemoFacts();
  return (
    <main className="band" id="main">
      <div className="wrap">
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          <Link className="btn ghost" href="/">
            ← Back to the worksheet
          </Link>
          <button type="button" className="btn pri" onClick={() => window.print()}>
            Print or save as PDF
          </button>
          {pending && <span className="small mt-0">Updating simulation figures…</span>}
        </div>
        <MemoDocument facts={facts}>
          <AiMemo facts={facts} />
        </MemoDocument>
      </div>
    </main>
  );
}

export function MemoPage() {
  return (
    <StoreGate>
      <Memo />
    </StoreGate>
  );
}
