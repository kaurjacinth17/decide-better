'use client';
/**
 * Worker-backed simulation, debounced by 150 ms so typing stays smooth. The previous
 * result stays on screen while a new one is computed (simPending = true). Results are
 * deterministic (fixed seed), so identical inputs are served from a small cache.
 * Falls back to the main thread if workers are unavailable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { simulate, toSimInput, type Analysis, type SimInput, type SimResult } from '@/engine';
import type { SimRequest, SimResponse } from '@/workers/sim.worker';

export const SIM_DEBOUNCE_MS = 150;
const WORKER_TIMEOUT_MS = 4000;

let worker: Worker | null | undefined;
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('../workers/sim.worker.ts', import.meta.url), { type: 'module', name: 'simulation' });
  } catch {
    worker = null;
  }
  return worker;
}

const cache = new Map<string, SimResult>();
const remember = (k: string, r: SimResult) => {
  cache.set(k, r);
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
};

/** A result is shown only for the decision (and matrix shape) it was computed for. */
const shapeOf = (a: Analysis) => `${a.model.decision.id}|${a.model.n}x${a.model.decision.criteria.length}`;

export function useSimulation(a: Analysis | null): { sim: SimResult | null; pending: boolean } {
  const input = useMemo<SimInput | null>(() => (a ? toSimInput(a.model) : null), [a]);
  const key = useMemo(() => (input ? JSON.stringify(input) : ''), [input]);
  const scope = a ? shapeOf(a) : '';
  const [state, setState] = useState<{ key: string; scope: string; sim: SimResult } | null>(null);
  const seq = useRef(0);
  // Debounce only while editing the same decision; a fresh decision computes at once.
  const sameScope = state?.scope === scope;

  useEffect(() => {
    if (!input) return;
    const cached = cache.get(key);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- serve a deterministic cached result immediately
      setState({ key, scope, sim: cached });
      return;
    }
    const id = ++seq.current;
    const run = () => {
      const w = getWorker();
      if (!w) {
        const r = simulate(input);
        remember(key, r);
        if (id === seq.current) setState({ key, scope, sim: r });
        return;
      }
      let settled = false;
      const finish = (r: SimResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        w.removeEventListener('message', onMsg);
        w.removeEventListener('error', onErr);
        remember(key, r);
        if (id === seq.current) setState({ key, scope, sim: r });
      };
      const onMsg = (e: MessageEvent<SimResponse>) => {
        if (e.data.id === id) finish(e.data.result);
      };
      // If the worker fails to load or stalls, compute on the main thread instead of hanging.
      const onErr = () => {
        worker = null;
        finish(simulate(input));
      };
      const watchdog = setTimeout(onErr, WORKER_TIMEOUT_MS);
      w.addEventListener('message', onMsg);
      w.addEventListener('error', onErr);
      w.postMessage({ id, input } satisfies SimRequest);
    };
    // First result as soon as possible; later ones debounced while the user types.
    const t = setTimeout(run, sameScope ? SIM_DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [key, input, scope, sameScope]);

  if (!input) return { sim: null, pending: false };
  return { sim: sameScope ? state!.sim : null, pending: !sameScope || state!.key !== key };
}
