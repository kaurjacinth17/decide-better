'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Decision } from '@/engine';
import { decodeDecision, readHash } from '@/lib/share';
import { getAppStore } from '@/store/appStore';
import { Brand } from './Header';
import { useAnalysis } from './hooks';
import { useSimulation } from './useSimulation';
import { WorkspaceProvider } from './Workspace';
import { WorkspaceSections } from './WorkspaceSections';
import { CopySummary } from './VerdictPanel';
import { ThemeSelect } from './ThemeSelect';

const noop = () => undefined;

function ReadOnly({ d }: { d: Decision }) {
  const router = useRouter();
  const a = useAnalysis(d)!;
  const { sim, pending } = useSimulation(a);
  const [copying, setCopying] = useState(false);
  const value = useMemo(
    () => ({ d, a, sim, simPending: pending, readOnly: true, edit: noop, commit: noop, change: noop }),
    [d, a, sim, pending],
  );

  const makeCopy = async () => {
    setCopying(true);
    const store = getAppStore().getState();
    if (!store.hydrated) await store.hydrate();
    getAppStore()
      .getState()
      .add({ ...d, title: d.title }, { freshId: true });
    await getAppStore().getState().flush();
    router.push('/');
  };

  return (
    <WorkspaceProvider value={value}>
      <header className="band pb-2">
        <div className="wrap">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
            <Brand />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn pri" onClick={makeCopy} disabled={copying}>
                {copying ? 'Copying…' : 'Make a copy'}
              </button>
              <Link className="btn ghost" href="/">
                Open my decisions
              </Link>
              <ThemeSelect />
            </div>
          </div>
          <p className="ai-note mt-4" role="note">
            You&apos;re viewing a shared decision. It&apos;s read-only: make a copy to change weights or scores. Nothing here was uploaded;
            the decision is stored in the link itself.
          </p>
          <h1 className="q" style={{ cursor: 'default' }}>
            {d.title}
          </h1>
        </div>
      </header>
      <WorkspaceSections />
      <footer className="band pt-0">
        <div className="wrap flex flex-wrap gap-2">
          <CopySummary />
        </div>
      </footer>
    </WorkspaceProvider>
  );
}

export function ShareView() {
  const [state, setState] = useState<{ d: Decision } | { error: string } | null>(null);
  useEffect(() => {
    const read = () => {
      const enc = readHash(window.location.hash);
      if (!enc) return setState({ error: 'This link has no decision in it. Ask for it to be shared again.' });
      const r = decodeDecision(enc);
      setState(r.ok ? { d: r.decision } : { error: r.error });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  if (!state)
    return (
      <div className="band" aria-busy="true">
        <p className="wrap text-mut">Opening shared decision…</p>
      </div>
    );
  if ('error' in state)
    return (
      <main className="band">
        <div className="wrap panel">
          <Brand />
          <h1 className="mt-4 text-3xl font-extrabold">Can&apos;t open this shared decision</h1>
          <p className="note">{state.error}</p>
          <Link className="btn mt-4" href="/">
            Go to Decide Better
          </Link>
        </div>
      </main>
    );
  return <ReadOnly d={state.d} />;
}
