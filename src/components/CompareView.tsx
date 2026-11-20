'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { f2, pc, type Decision } from '@/engine';
import { compareDecisions } from '@/lib/compare';
import { actions, useApp, useCurrent } from '@/store/appStore';
import { libraryOrder } from '@/store/decisionStore';
import { Brand } from './Header';
import { StoreGate } from './StoreGate';

interface Source {
  key: string;
  label: string;
  decision: Decision;
}

const delta = (l: number | null, r: number | null, fmt: (x: number) => string) => {
  if (l === null || r === null) return '—';
  const dlt = r - l;
  if (Math.abs(dlt) < 0.0005) return 'same';
  return `${dlt > 0 ? '+' : '−'}${fmt(Math.abs(dlt))}`;
};

function Compare() {
  const current = useCurrent();
  const snapshots = useApp((s) => s.snapshots);
  const decisions = useApp((s) => s.decisions);
  const sources: Source[] = useMemo(
    () => [
      { key: 'current', label: `Current: ${current.title}`, decision: current },
      ...[...snapshots].reverse().map((s) => ({ key: `snap:${s.id}`, label: `Saved version: ${s.label}`, decision: s.data })),
      ...libraryOrder({ decisions })
        .filter((d) => d.id !== current.id)
        .map((d) => ({ key: `dec:${d.id}`, label: `Other decision: ${d.title}`, decision: d })),
    ],
    [current, snapshots, decisions],
  );
  // Until the user picks, compare the most recent saved version (snapshots load asynchronously).
  const [leftPick, setLeftKey] = useState<string | null>(null);
  const latest = snapshots.at(-1);
  const leftKey = leftPick ?? (latest ? `snap:${latest.id}` : 'current');
  const [rightKey, setRightKey] = useState<string>('current');
  const L = sources.find((s) => s.key === leftKey) ?? sources[0]!;
  const R = sources.find((s) => s.key === rightKey) ?? sources[0]!;
  const c = useMemo(() => compareDecisions(L.decision, R.decision), [L, R]);

  const picker = (id: string, label: string, value: string, set: (v: string) => void) => (
    <label htmlFor={id} className="grid gap-1">
      <span className="lab">{label}</span>
      <select id={id} className="sel max-w-none" value={value} onChange={(e) => set(e.target.value)}>
        {sources.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );

  const card = (side: 'left' | 'right', src: Source) => {
    const v = c[side];
    return (
      <div className="panel">
        <p className="lab">{side === 'left' ? 'Before' : 'After'}</p>
        <h2 className="win">{v.leaderName === null ? 'No option survives' : v.tie ? 'Tied' : v.leaderName}</h2>
        {v.leaderScore !== null && (
          <p className="big">
            <b>{f2(v.leaderScore)}</b>
            <span> / 10</span>
          </p>
        )}
        <p className="mt-2.5 text-mut">{src.label}</p>
        {v.analysis.comparable && !v.tie && <p className="mt-1">Ahead by {f2(v.margin)} points.</p>}
      </div>
    );
  };

  return (
    <main className="band" id="main">
      <div className="wrap grid gap-5">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Brand />
          <Link className="btn ghost" href="/">
            ← Back to the worksheet
          </Link>
        </div>
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold">Compare two versions</h1>
        <p className="note -mt-3">
          Save a version before you re-weight or re-score, then compare it with where you are now. Criteria and options are matched by
          identity, then by name.
        </p>
        {snapshots.length === 0 && (
          <div className="panel" role="note">
            <p>
              You haven&apos;t saved a version of “{current.title}” yet.{' '}
              <button type="button" className="lk" onClick={() => void actions().saveSnapshot('Saved from compare view')}>
                Save the current state as a version
              </button>{' '}
              then change some weights on the worksheet and come back.
            </p>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {picker('cmp-left', 'Before', leftKey, setLeftKey)}
          {picker('cmp-right', 'After', rightKey, setRightKey)}
        </div>
        <p className={`fh ${c.leaderChanged ? '' : 'text-ink'}`} role="status">
          {c.leaderChanged
            ? `The leader changes: ${c.left.leaderName ?? 'none'} → ${c.right.leaderName ?? 'none'}${c.right.tie ? ' (tied)' : ''}.`
            : `Same leader in both: ${c.right.leaderName ?? 'none'}.`}
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {card('left', L)}
          {card('right', R)}
        </div>
        <div className="panel">
          <h2>Weights and scores</h2>
          <div className="scroll" tabIndex={0} role="region" aria-label="Weight comparison, scrolls sideways">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  <th scope="col" className="n">
                    Before
                  </th>
                  <th scope="col" className="n">
                    After
                  </th>
                  <th scope="col" className="n">
                    Change
                  </th>
                  <th scope="col">Other changes</th>
                </tr>
              </thead>
              <tbody>
                {c.criteria.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="n">{r.left === null ? 'absent' : pc(r.left)}</td>
                    <td className="n">{r.right === null ? 'absent' : pc(r.right)}</td>
                    <td className="n">{delta(r.left, r.right, (x) => `${Math.round(x * 100)} pts`)}</td>
                    <td>
                      {[
                        r.scoreChanges ? `${r.scoreChanges} score${r.scoreChanges > 1 ? 's' : ''} changed` : '',
                        r.modeChanged ? 'scoring mode changed' : '',
                        r.dealBreakerChanged ? 'deal-breaker changed' : '',
                      ]
                        .filter(Boolean)
                        .join(' · ') || <span className="text-mut">none</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <h2>Totals</h2>
          <div className="scroll" tabIndex={0} role="region" aria-label="Totals comparison, scrolls sideways">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Option</th>
                  <th scope="col" className="n">
                    Before
                  </th>
                  <th scope="col" className="n">
                    After
                  </th>
                  <th scope="col" className="n">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.options.map((o) => (
                  <tr key={o.name}>
                    <td>{o.name}</td>
                    <td className="n">
                      {o.left === null ? 'absent' : f2(o.left)}
                      {o.leftEligible === false && <small>ruled out</small>}
                    </td>
                    <td className="n">
                      {o.right === null ? 'absent' : f2(o.right)}
                      {o.rightEligible === false && <small>ruled out</small>}
                    </td>
                    <td className="n">{delta(o.left, o.right, f2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export function ComparePage() {
  return (
    <StoreGate>
      <Compare />
    </StoreGate>
  );
}
