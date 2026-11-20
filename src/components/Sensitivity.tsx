'use client';
import { clamp, flipDistance, lineAt, lines, nm, pc, pc1 } from '@/engine';
import { useSize } from './hooks';
import { optColor, useWorkspace } from './Workspace';

function Chart() {
  const { d, a, selected } = useWorkspace();
  const [ref, { w: W, h: H }] = useSize<HTMLDivElement>();
  const m = a.model;
  const i = d.criteria.findIndex((c) => c.id === selected);
  const { eo, leader: w0, wn } = m;
  const crit = d.criteria[i];
  const label = crit
    ? `Line chart: each option's total as ${crit.name}'s weight moves from 0% to 100%. Today's weight is ${pc(wn[i]!)}.`
    : 'Sensitivity chart';

  let body: React.ReactNode = null;
  if (W && H) {
    if (i < 0 || eo.length < 2 || w0 === undefined) {
      body = (
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="15" fill="var(--mut)">
          Needs two options that pass your deal-breakers
        </text>
      );
    } else {
      const ss = a.sens[i]!;
      const L = lines(m, i) ?? d.options.map((_, j) => [m.D[i]![j]!, 0] as [number, number]);
      const f = (j: number, t: number) => lineAt(L, j, t);
      const narrow = W < 520;
      const ml = 34;
      const mr = narrow ? 92 : 140;
      const mt = 26;
      const mb = 34;
      let lo = 10;
      let hi = 0;
      eo.forEach((j) =>
        [0, 1].forEach((t) => {
          const v = f(j, t);
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }),
      );
      lo = Math.max(0, Math.floor(lo - 0.5));
      hi = Math.min(10, Math.ceil(hi + 0.5));
      if (hi - lo < 2) {
        hi = Math.min(10, lo + 2);
        lo = hi - 2;
      }
      const X = (t: number) => ml + t * (W - ml - mr);
      const Y = (v: number) => mt + ((hi - v) / (hi - lo)) * (H - mt - mb);
      const step = hi - lo > 6 ? 2 : 1;
      const tie = m.tie;
      const grid: number[] = [];
      for (let v = lo; v <= hi; v += step) grid.push(v);
      const xn = X(wn[i]!);
      const labs = eo.map((j) => ({ j, y: Y(f(j, 1)) })).sort((p, q) => p.y - q.y);
      for (let k = 1; k < labs.length; k++) if (labs[k]!.y - labs[k - 1]!.y < 18) labs[k]!.y = labs[k - 1]!.y + 18;
      const over = labs.length ? labs[labs.length - 1]!.y - (H - mb) : 0;
      if (over > 0) labs.forEach((l) => (l.y -= over));
      body = (
        <>
          {!tie && (
            <rect
              x={X(ss.down ?? 0)}
              y={mt}
              width={Math.max(0, X(ss.up ?? 1) - X(ss.down ?? 0))}
              height={H - mt - mb}
              fill={optColor(w0)}
              opacity={0.08}
            />
          )}
          {grid.map((v) => (
            <g key={v}>
              <line x1={ml} x2={X(1)} y1={Y(v)} y2={Y(v)} stroke="var(--rule)" />
              <text x={ml - 8} y={Y(v) + 5} textAnchor="end" fontSize="14" fill="var(--mut)">
                {v}
              </text>
            </g>
          ))}
          {(narrow ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((t) => (
            <text key={t} x={X(t)} y={H - mb + 22} textAnchor="middle" fontSize="14" fill="var(--mut)">
              {Math.round(t * 100)}%
            </text>
          ))}
          <line x1={xn} x2={xn} y1={mt} y2={H - mb} stroke="var(--ink)" strokeDasharray="4 4" />
          <text x={clamp(xn, ml + 30, X(1) - 30)} y={16} textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--ink)">
            now {pc(wn[i]!)}
          </text>
          {eo.map((j) => (
            <line
              key={j}
              x1={X(0)}
              y1={Y(f(j, 0))}
              x2={X(1)}
              y2={Y(f(j, 1))}
              stroke={optColor(j)}
              strokeWidth={j === w0 ? 3.5 : 2.2}
              strokeLinecap="round"
            />
          ))}
          {!tie &&
            [ss.up, ss.down].map((t, k) => {
              if (t === null) return null;
              const y = Y(f(w0, t));
              return (
                <g key={k}>
                  <circle cx={X(t)} cy={y} r={6} fill="var(--brick)" stroke="var(--panel)" strokeWidth={2} />
                  <text
                    x={clamp(X(t), ml + 20, X(1) - 20)}
                    y={y + (y - mt < 30 ? 24 : -12)}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="700"
                    fill="var(--brick)"
                  >
                    {pc1(t, wn[i]!)}
                  </text>
                </g>
              );
            })}
          {labs.map((l) => (
            <text key={l.j} x={X(1) + 8} y={l.y + 5} fontSize="14" fontWeight="600" fill={optColor(l.j)}>
              {nm(d.options[l.j]!.name, narrow ? 10 : 17)}
            </text>
          ))}
        </>
      );
    }
  }
  return (
    <div className="fig" ref={ref} role="img" aria-label={label} data-testid="sens-chart">
      {W > 0 && H > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {body}
        </svg>
      )}
    </div>
  );
}

export function SensitivityPanel() {
  const { d, a, selected, setSelected } = useWorkspace();
  const m = a.model;
  const ok = a.comparable;
  const bf = a.headline;
  const si = Math.max(
    0,
    d.criteria.findIndex((c) => c.id === selected),
  );
  const sc = d.criteria[si]!;
  const W = m.leader !== undefined ? d.options[m.leader]!.name : '';
  const heading = !ok
    ? 'Sensitivity needs two options'
    : m.tie
      ? 'Tied, so every weight matters'
      : bf
        ? bf.dir > 0
          ? `Holds unless ${d.criteria[bf.i]!.name} passes ${pc1(bf.t, m.wn[bf.i]!)}`
          : bf.t < 0.005
            ? `Holds unless ${d.criteria[bf.i]!.name} is ignored`
            : `Holds unless ${d.criteria[bf.i]!.name} drops below ${pc1(bf.t, m.wn[bf.i]!)}`
        : `${W} wins at any single weight`;
  return (
    <div className="panel">
      <h2>{heading}</h2>
      <p className="note">Testing {sc.name}. Pick another criterion to see how its weight moves the result.</p>
      <div className="mt-3.5 flex flex-wrap gap-2" role="group" aria-label="Criterion to test">
        {d.criteria.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
            {nm(c.name, 24)}
          </button>
        ))}
      </div>
      <Chart />
      <p className="small">
        {ok &&
          `Each line is an option's total score as ${sc.name}'s weight moves from 0% to 100%, with the other weights keeping their proportions. Dashed line: today's ${pc(m.wn[si]!)}.${m.tie ? '' : ` Shaded: weights where ${W} stays ahead.`}`}
      </p>
    </div>
  );
}

export function FlipTable() {
  const { d, a, selected, setSelected } = useWorkspace();
  const m = a.model;
  const ok = a.comparable;
  const O = d.options;
  const cell = (t: number | null, to: number | null, now: number) =>
    t === null || to === null ? (
      <span className="text-mut">holds</span>
    ) : (
      <>
        {pc1(t, now)}
        <small>{nm(O[to]!.name, 16)} leads</small>
      </>
    );
  const W = m.leader !== undefined ? O[m.leader]!.name : '';
  const Rn = m.runnerUp !== undefined ? O[m.runnerUp]!.name : '';
  let moves: React.ReactNode[];
  if (!ok) moves = [<li key="x">Needs two options that pass your deal-breakers.</li>];
  else if (m.tie) moves = [<li key="x">Raising either option on any weighted criterion breaks the tie.</li>];
  else if (!a.scoreFlips.length) moves = [<li key="x">No single rating change within 1–10 can overturn {W}&apos;s lead.</li>];
  else
    moves = a.scoreFlips.map((f, k) => {
      const c = d.criteria[f.criterion]!;
      return (
        <li key={k}>
          The lead changes if {f.who === 'runnerUp' ? Rn : W}&apos;s <b>{c.name}</b> score{' '}
          {f.who === 'runnerUp' ? 'rose above' : 'fell below'} {f.threshold.toFixed(1)} (now {f.from}).
        </li>
      );
    });
  return (
    <div className="panel">
      <h2>The weight that flips the result</h2>
      <p className="note">
        Each row moves one weight while the others keep their proportions. “Holds” means no setting of that weight changes the leader.
      </p>
      {ok && (
        <div className="scroll">
          <table className="tbl" aria-label="Flip points by criterion">
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col" className="n">
                  Now
                </th>
                <th scope="col" className="n">
                  Flips below
                </th>
                <th scope="col" className="n">
                  Flips above
                </th>
              </tr>
            </thead>
            <tbody>
              {a.sens
                .slice()
                .sort((x, y) => flipDistance(x) - flipDistance(y))
                .map((s) => {
                  const c = d.criteria[s.i]!;
                  return (
                    <tr key={c.id} className={c.id === selected ? 'selrow' : ''}>
                      <td>
                        <button type="button" className="lk" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
                          {c.name}
                        </button>
                      </td>
                      <td className="n">{pc(s.now)}</td>
                      <td className="n">{m.tie ? '—' : cell(s.down, s.downTo, s.now)}</td>
                      <td className="n">{m.tie ? '—' : cell(s.up, s.upTo, s.now)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <h3 className="mt-5">Or change a single score</h3>
      <ul className="mv">{moves}</ul>
    </div>
  );
}
