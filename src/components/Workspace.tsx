'use client';
/**
 * Everything a workspace section needs: the decision, its analysis, the simulation and
 * edit functions. The editable app wires this to the store; the shared read-only view
 * wires it to a decoded link with no-op edits.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Analysis, Decision, SimResult } from '@/engine';

export interface Workspace {
  d: Decision;
  a: Analysis;
  sim: SimResult | null;
  simPending: boolean;
  readOnly: boolean;
  edit(recipe: (d: Decision) => void): void;
  commit(): void;
  change(recipe: (d: Decision) => void): void;
  /** Criterion shown in the sensitivity chart. */
  selected: string | null;
  setSelected(id: string): void;
}

const Ctx = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const w = useContext(Ctx);
  if (!w) throw new Error('useWorkspace outside WorkspaceProvider');
  return w;
}

export function WorkspaceProvider({ value, children }: { value: Omit<Workspace, 'selected' | 'setSelected'>; children: ReactNode }) {
  const [picked, setSelected] = useState<string | null>(null);
  const { d, a } = value;
  // Default to the criterion behind the headline flip, like the prototype.
  const selected = useMemo(() => {
    if (picked && d.criteria.some((c) => c.id === picked)) return picked;
    return d.criteria[a.headline ? a.headline.i : 0]?.id ?? null;
  }, [picked, d.criteria, a.headline]);
  const ctx = useMemo(() => ({ ...value, selected, setSelected }), [value, selected]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export const optColor = (j: number) => `var(--o${j % 5})`;
