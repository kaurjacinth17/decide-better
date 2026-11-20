'use client';
import { useEffect, useMemo, useState } from 'react';
import { actions, getAppStore, useApp, useCurrent } from '@/store/appStore';
import { ExportImport } from './ExportImport';
import { Header } from './Header';
import { useAnalysis } from './hooks';
import { useSimulation } from './useSimulation';
import { WeightHelper } from './WeightHelper';
import { WorkspaceProvider } from './Workspace';
import { WorkspaceSections } from './WorkspaceSections';

const isTextField = (el: Element | null) =>
  !!el &&
  (el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && !['range', 'checkbox'].includes((el as HTMLInputElement).type)));

function UndoRedo() {
  const canUndo = useApp((s) => s.undoStack.length > 0);
  const canRedo = useApp((s) => s.redoStack.length > 0);
  return (
    <>
      <button type="button" className="btn" disabled={!canUndo} onClick={() => actions().undo()} aria-keyshortcuts="Control+Z Meta+Z">
        Undo
      </button>
      <button
        type="button"
        className="btn"
        disabled={!canRedo}
        onClick={() => actions().redo()}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
      >
        Redo
      </button>
    </>
  );
}

function SaveError() {
  const err = useApp((s) => s.saveError);
  return err ? (
    <p role="alert" className="small text-brick">
      Couldn&apos;t save to this device ({err}). Your changes are still on screen; export a copy to be safe.
    </p>
  ) : null;
}

function Editor() {
  const d = useCurrent();
  const a = useAnalysis(d)!;
  const { sim, pending } = useSimulation(a);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const store = getAppStore().getState();

  const value = useMemo(
    () => ({ d, a, sim, simPending: pending, readOnly: false, edit: store.edit, commit: store.commit, change: store.change }),
    [d, a, sim, pending, store],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isTextField(document.activeElement) && !weightsOpen) {
        e.preventDefault();
        if (e.shiftKey) actions().redo();
        else actions().undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [weightsOpen]);

  useEffect(() => {
    const flush = () => void actions().flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return (
    <WorkspaceProvider value={value}>
      <a href="#main" className="sr-only-x focus:not-sr-only">
        Skip to the scoring matrix
      </a>
      <Header />
      <WorkspaceSections
        onOpenWeights={() => setWeightsOpen(true)}
        matrixExtra={
          <button type="button" className="btn ghost" onClick={() => actions().resetTemplate()}>
            Reset template
          </button>
        }
        verdictActions={<UndoRedo />}
      />
      <footer className="band pt-0">
        <div className="wrap">
          <ExportImport />
          <SaveError />
          <p className="small">Everything is calculated in your browser. Your decisions are kept on this device only.</p>
        </div>
      </footer>
      <WeightHelper open={weightsOpen} onClose={() => setWeightsOpen(false)} />
    </WorkspaceProvider>
  );
}

export function App() {
  const hydrated = useApp((s) => s.hydrated);
  useEffect(() => {
    if (!getAppStore().getState().hydrated) void getAppStore().getState().hydrate();
  }, []);
  if (!hydrated)
    return (
      <div className="band" aria-busy="true">
        <p className="wrap text-mut">Loading your decisions…</p>
      </div>
    );
  return <Editor />;
}
