'use client';
import { useState, type ReactNode } from 'react';
import {
  clamp,
  confidenceLabel,
  f2,
  fmtValue,
  leadLabel,
  pc,
  pc1,
  simulate,
  summaryMarkdown,
  toSimInput,
  type Criterion,
  type Model,
} from '@/engine';
import { optColor, useWorkspace } from './Workspace';

export function Bar({ name, val, w, j, out }: { name: ReactNode; val: string; w: number; j: number; out?: boolean }) {
  return (
    <div className={`br${out ? ' out' : ''}`}>
      <span className="bn">{name}</span>
      <span className="bv">{val}</span>
      <span className="bt" aria-hidden="true">
        <i style={{ width: `${clamp(w, 0, 100).toFixed(1)}%`, background: optColor(j) }} />
      </span>
    </div>
  );
}

export const failText = (c: Criterion, j: number) =>
  c.mode === 'value'
    ? `${c.name} is ${fmtValue(c.values[j], c.unit)}, ${c.direction > 0 ? 'below' : 'above'} your limit of ${fmtValue(c.dealBreaker, c.unit)}`
    : `${c.name} scored ${c.scores[j]}, below your minimum of ${c.dealBreaker}`;

export const failList = (m: Model, j: number) => m.fails[j]!.map((i) => failText(m.decision.criteria[i]!, j)).join('; ');

/** Copy summary as Markdown, falling back to a selectable textarea if the clipboard is blocked. */
export function CopySummary() {
  const { a, sim } = useWorkspace();
  const [label, setLabel] = useState('Copy summary');
  const [fallback, setFallback] = useState<string | null>(null);
  const copy = async () => {
    // If the worker hasn't answered yet, compute the (deterministic) result here so the summary is complete.
    const inp = toSimInput(a.model);
    const txt = summaryMarkdown(a, sim ?? (inp ? simulate(inp) : null));
    try {
      await navigator.clipboard.writeText(txt);
      setLabel('Copied');
      setTimeout(() => setLabel('Copy summary'), 1600);
    } catch {
      setFallback(txt);
      setLabel('Select and copy below');
    }
  };
  return (
    <>
      <button type="button" className="btn pri" onClick={copy}>
        {label}
      </button>
      {fallback !== null && (
        <textarea
          className="sumbox basis-full"
          readOnly
          aria-label="Summary text"
          value={fallback}
          ref={(el) => {
            el?.focus();
            el?.select();
          }}
        />
      )}
    </>
  );
}

export function VerdictPanel({ actions }: { actions?: ReactNode }) {
  const { d, a, sim, simPending } = useWorkspace();
  const m = a.model;
  const { S, eo, eligible, leader: w0, runnerUp: r0, tie, gap, wn } = m;
  const O = d.options;
  const C = d.criteria;
  const ok2 = a.comparable;
  const W = w0 !== undefined ? O[w0]!.name : '';
  const Rn = r0 !== undefined ? O[r0]!.name : '';
  const ruled = m.order.filter((j) => !eligible[j]);

  let head: ReactNode;
  if (!eo.length)
    head = (
      <>
        <p className="lab">No option survives</p>
        <h2 className="win">Every option breaks a deal-breaker</h2>
        <p className="mt-2.5">Loosen a deal-breaker or add an option.</p>
      </>
    );
  else if (!ok2)
    head = (
      <>
        <p className="lab">Winner by elimination</p>
        <h2 className="win">{W}</h2>
        <p className="big">
          <b>{f2(S[w0!]!)}</b>
          <span> / 10</span>
        </p>
        <p className="mt-2.5">It is the only option that passes every deal-breaker.</p>
      </>
    );
  else {
    const p = sim?.p[w0!];
    const cl = confidenceLabel(p ?? 0, tie);
    head = (
      <>
        <p className="lab">{tie ? 'Tied' : 'Current leader'}</p>
        <h2 className="win">{tie ? `${W} and ${Rn}` : W}</h2>
        <p className="big">
          <b>{f2(S[w0!]!)}</b>
          <span> / 10</span>
        </p>
        <p className="mt-2.5">
          <b>{leadLabel(gap, tie)}.</b> {tie ? 'Both options score the same.' : `Ahead of ${Rn} by ${f2(gap)} points.`}
        </p>
        <p className="mt-2 text-[15px]" aria-busy={simPending}>
          {p === undefined ? (
            <span className="text-mut">Running simulations…</span>
          ) : (
            <>
              <span className={`pill ${cl.key}`}>{cl.label}</span>
              Wins in {pc(p)} of {sim!.N.toLocaleString('en-IN')} simulations
            </>
          )}
        </p>
      </>
    );
  }

  let flip: ReactNode = null;
  if (ok2) {
    const bf = a.headline;
    let t: string;
    let sub = '';
    if (tie) t = 'It is a tie. Any change to a weight or a score decides it.';
    else if (bf) {
      const name = C[bf.i]!.name;
      t =
        bf.dir < 0 && bf.t < 0.005
          ? `Your decision changes only if ${name} is ignored completely (now ${pc(wn[bf.i]!)}).`
          : `Your decision changes if ${name} is weighted ${bf.dir > 0 ? 'above' : 'below'} ${pc1(bf.t, wn[bf.i]!)} (now ${pc(wn[bf.i]!)}).`;
      sub = `${O[bf.to]!.name} would take the lead.`;
    } else t = `No single weight change flips this. ${W} leads at every setting of every weight.`;
    flip = (
      <div className="flip">
        <p className="lab">What would change the decision</p>
        <p className="fh">{t}</p>
        {sub && <p className="small">{sub}</p>}
      </div>
    );
  }

  let gut: ReactNode = null;
  const g = a.gut;
  if (g.kind !== 'none') {
    const G = O[g.option]!.name;
    let body: ReactNode;
    if (g.kind === 'ruledOut')
      body = (
        <p>
          <b>Gut check.</b> You lean towards {G}, but it breaks a deal-breaker: {failList(m, g.option)}. If that limit is softer than you
          thought, loosen it and see what happens.
        </p>
      );
    else if (g.kind === 'agrees')
      body = (
        <p>
          <b>Gut check.</b> Your gut and your criteria agree: {G} leads.
        </p>
      );
    else if (g.kind === 'tiebreak')
      body = (
        <p>
          <b>Gut check.</b> The criteria can&apos;t separate the two, so your gut is a fair tiebreaker: {G}.
        </p>
      );
    else {
      const y = g.analysis;
      body = (
        <>
          <p>
            <b>Gut check.</b> You lean towards {G}, but your criteria prefer {W} by {f2(S[w0!]! - S[g.option]!)} points
            {y.biggest >= 0 && `, mostly because of ${C[y.biggest]!.name} (worth ${f2(y.biggestValue)} to ${W})`}.
          </p>
          <p>
            {y.flip
              ? `${G} would come out on top if ${C[y.flip.i]!.name} were weighted ${y.flip.dir > 0 ? 'above' : 'below'} ${pc1(y.flip.t, wn[y.flip.i]!)} (now ${pc(wn[y.flip.i]!)}).`
              : `No single weight change puts ${G} on top.`}{' '}
            If your gut still says {G}, ask what it knows that your criteria don&apos;t. A missing criterion is the usual reason.
          </p>
        </>
      );
    }
    gut = (
      <div className="gutb" data-testid="gut">
        {body}
      </div>
    );
  }

  return (
    <aside className="panel vd" id="verdict" aria-label="Verdict">
      <div aria-live="polite">
        {head}
        {ruled.length > 0 && (
          <div className="ro">
            <p className="lab">Ruled out by deal-breakers</p>
            {ruled.map((j) => (
              <p key={j}>
                <b>{O[j]!.name}</b>: {failList(m, j)}.
              </p>
            ))}
          </div>
        )}
        <div className="bars">
          {eo.map((j) => (
            <Bar key={j} name={O[j]!.name} val={f2(S[j]!)} w={S[j]! * 10} j={j} />
          ))}
          {ruled.map((j) => (
            <Bar key={j} name={`${O[j]!.name} · ruled out`} val={f2(S[j]!)} w={S[j]! * 10} j={j} out />
          ))}
        </div>
        {flip}
      </div>
      {gut}
      <div className="no-print mt-4 flex flex-wrap gap-2">
        <CopySummary />
        {actions}
      </div>
    </aside>
  );
}
