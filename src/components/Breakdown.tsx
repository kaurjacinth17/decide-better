'use client';
import { f2, nm, pc } from '@/engine';
import { cellText } from '@/engine/analyse';
import { optColor, useWorkspace } from './Workspace';

export function Breakdown() {
  const { d, a } = useWorkspace();
  const m = a.model;
  const cs = a.contributions;
  const mx = Math.max(0.01, ...cs.flat());
  const rows = d.criteria.map((_, i) => i).sort((x, y) => m.wn[y]! - m.wn[x]!);
  return (
    <div className="panel">
      <h2>Where the points come from</h2>
      <p className="note">Weighted points each criterion adds to an option&apos;s total. The bold figure is the best in its row.</p>
      <div className="scroll">
        <table className="tbl" aria-label="Points breakdown">
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col" className="n">
                Weight
              </th>
              {m.order.map((j) => (
                <th key={j} scope="col">
                  {nm(d.options[j]!.name, 18)}
                  {!m.eligible[j] && <small>ruled out</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const best = Math.max(...m.eo.map((j) => cs[i]![j]!), -1);
              const allEq = m.eo.every((j) => Math.abs(cs[i]![j]! - best) < 1e-9);
              return (
                <tr key={d.criteria[i]!.id}>
                  <th scope="row" className="!border-b !border-rule !text-[15px] !font-normal !text-ink">
                    {d.criteria[i]!.name}
                  </th>
                  <td className="n">{pc(m.wn[i]!)}</td>
                  {m.order.map((j) => {
                    const v = cs[i]![j]!;
                    const isBest = m.eligible[j] && !allEq && Math.abs(v - best) < 1e-9;
                    return (
                      <td key={j} className={!m.eligible[j] ? 'dim' : isBest ? 'best' : ''}>
                        <div className="cb">
                          <span className="cbt" aria-hidden="true">
                            <i style={{ width: `${((v / mx) * 100).toFixed(1)}%`, background: optColor(j) }} />
                          </span>
                          <span className="cv">{f2(v)}</span>
                          {isBest && <span className="sr-only-x">(best)</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="n">100%</td>
              {m.order.map((j) => (
                <td key={j} className="tot">
                  {f2(m.S[j]!)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function AdvantageCards() {
  const { d, a } = useWorkspace();
  const m = a.model;
  if (!a.comparable || m.leader === undefined || m.runnerUp === undefined)
    return (
      <div className="ad">
        <div className="panel">
          <h3>Advantages and drawbacks</h3>
          <p className="note">These compare the leader with the runner-up, so they need two options that pass your deal-breakers.</p>
        </div>
      </div>
    );
  const W = d.options[m.leader]!.name;
  const Rn = d.options[m.runnerUp]!.name;
  const card = (i: number, delta: number, good: boolean) => {
    const h = good ? `Biggest advantage of ${W}` : `Biggest drawback of ${W}`;
    if (i < 0)
      return (
        <div className="panel">
          <h3>{h}</h3>
          <p className="k">None</p>
          <p className="note">
            {good ? `${W} does not beat ${Rn} on any criterion.` : `${W} does at least as well as ${Rn} on every criterion.`}
          </p>
        </div>
      );
    const c = d.criteria[i]!;
    return (
      <div className="panel">
        <h3>{h}</h3>
        <p className={`k${good ? '' : ' bad'}`}>{c.name}</p>
        <p>
          {cellText(c, m.leader!)} against {cellText(c, m.runnerUp!)} for {Rn}. At {pc(m.wn[i]!)} weight, that {good ? 'adds' : 'costs'}{' '}
          <b>
            {good ? '+' : '−'}
            {f2(Math.abs(delta))}
          </b>{' '}
          points {good ? 'to' : 'from'} its lead.
        </p>
      </div>
    );
  };
  return (
    <div className="ad">
      {card(a.advantage.i, a.advantage.delta, true)}
      {card(a.drawback.i, a.drawback.delta, false)}
    </div>
  );
}
