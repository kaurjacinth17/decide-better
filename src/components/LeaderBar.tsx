'use client';
import { useEffect, useState } from 'react';
import { f2, nm, pc } from '@/engine';
import { useWorkspace } from './Workspace';

/** Phone-only slim bar with the current leader; hides while the verdict panel is on screen. */
export function LeaderBar() {
  const { d, a, sim } = useWorkspace();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = document.getElementById('verdict');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => es.forEach((x) => setHidden(x.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const m = a.model;
  return (
    <div className={`leaderbar no-print${hidden ? ' hide' : ''}`} aria-hidden={hidden} data-testid="leaderbar">
      {m.leader === undefined ? (
        <span>No option passes your deal-breakers</span>
      ) : (
        <>
          <span>
            {m.tie ? 'Tied' : 'Leader'} <b>{nm(d.options[m.leader]!.name, 20)}</b>
          </span>
          <span className="tabular-nums">
            {f2(m.S[m.leader]!)}
            {a.comparable && sim ? ` · wins ${pc(sim.p[m.leader]!)}` : ''}
          </span>
        </>
      )}
    </div>
  );
}
