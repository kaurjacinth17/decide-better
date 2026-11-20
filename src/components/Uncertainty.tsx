'use client';
import { CERTAINTY, pc, type Certainty } from '@/engine';
import { setCertainty, setVaryWeights } from '@/store/ops';
import { Bar } from './VerdictPanel';
import { useWorkspace } from './Workspace';

export function Probabilities() {
  const { d, a, sim, change, readOnly, simPending } = useWorkspace();
  const m = a.model;
  const ok = a.comparable && m.leader !== undefined;
  return (
    <div className="panel" aria-busy={simPending}>
      <h2>
        {ok && sim
          ? `${d.options[m.leader!]!.name} comes out on top in ${pc(sim.p[m.leader!]!)} of simulated outcomes`
          : ok
            ? 'Running simulations…'
            : 'Nothing to simulate yet'}
      </h2>
      <p className="note">
        {ok
          ? `Each of ${(sim?.N ?? 2000).toLocaleString('en-IN')} runs nudges every score within the range you marked (Sure ±0.5, Fairly sure ±1.5, Guessing ±3)${d.varyWeights ? ' and shifts each weight by up to 25%' : ''}, then picks a winner.`
          : 'Simulations compare options against each other, so at least two need to pass your deal-breakers.'}
      </p>
      {ok && sim && (
        <div className="bars">
          {m.eo
            .slice()
            .sort((x, y) => sim.p[y]! - sim.p[x]!)
            .map((j) => (
              <Bar key={j} name={d.options[j]!.name} val={pc(sim.p[j]!)} w={sim.p[j]! * 100} j={j} />
            ))}
        </div>
      )}
      <label className="chk mt-4">
        <input
          type="checkbox"
          checked={d.varyWeights}
          disabled={readOnly}
          onChange={(e) => change((x) => setVaryWeights(x, e.target.checked))}
        />
        Also vary every weight by up to ±25%
      </label>
      <p className="small">
        How to read the label: <b>Robust</b> wins 85% or more of runs, <b>Likely</b> 65–85%, <b>Fragile</b> 50–65%, and <b>Coin flip</b>{' '}
        under 50% or a tie. A fragile result is a sign to firm up your scores on the criteria at right before deciding.
      </p>
    </div>
  );
}

export function CertaintyPanel() {
  const { d, a, sim, change, readOnly } = useWorkspace();
  const ok = a.comparable && !!sim && sim.attr.length === d.criteria.length;
  const at = ok ? sim!.attr : d.criteria.map(() => 0);
  const wf = ok ? sim!.weightFlip : null;
  const amx = Math.max(0.02, ...at, wf ?? 0);
  const top = at.indexOf(Math.max(...at));
  const heading = !ok
    ? 'How sure are you about each criterion?'
    : at[top]! < 0.02 && !((wf ?? 0) > 0.02)
      ? 'None of your doubts threatens the lead'
      : wf !== null && wf > at[top]!
        ? 'Most doubt comes from your weights'
        : `Most doubt comes from ${d.criteria[top]!.name}`;
  return (
    <div className="panel">
      <h2>{heading}</h2>
      <p className="note">
        Mark how sure you are about each criterion&apos;s scores. The figure is how often doubt about that criterion alone hands the lead to
        another option.
      </p>
      <div>
        {d.criteria.map((c, i) => (
          <div key={c.id} className="ur">
            <span className="un" id={`cert-${c.id}`}>
              {c.name}
            </span>
            <span className="seg" role="group" aria-labelledby={`cert-${c.id}`}>
              {CERTAINTY.map((x, k) => (
                <button
                  key={x.label}
                  type="button"
                  aria-pressed={c.certainty === k}
                  disabled={readOnly && c.certainty !== k}
                  onClick={() => change((dd) => setCertainty(dd, i, k as Certainty))}
                >
                  {x.label}
                </button>
              ))}
            </span>
            <span className="uv">{ok ? pc(at[i]!) : ''}</span>
            <span className="bt" aria-hidden="true">
              <i style={{ width: `${((at[i]! / amx) * 100).toFixed(1)}%` }} />
            </span>
          </div>
        ))}
        {ok && wf !== null && (
          <div className="ur">
            <span className="un">Your weights (±25%)</span>
            <span aria-hidden="true" />
            <span className="uv">{pc(wf)}</span>
            <span className="bt" aria-hidden="true">
              <i style={{ width: `${((wf / amx) * 100).toFixed(1)}%` }} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
