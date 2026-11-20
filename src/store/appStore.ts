'use client';
/** The browser's single store instance, backed by IndexedDB, plus React bindings. */
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createDecisionStore, currentDecision, type DecisionState, type DecisionStore } from './decisionStore';
import { DexieAdapter } from './dexie';

let store: DecisionStore | null = null;

const safeLocalStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export function getAppStore(): DecisionStore {
  if (!store) store = createDecisionStore({ adapter: new DexieAdapter(), legacyStorage: safeLocalStorage() });
  return store;
}

export function useApp<T>(selector: (s: DecisionState) => T): T {
  return useStore(getAppStore(), selector);
}

/** For selectors returning new arrays/objects each time. */
export function useAppShallow<T>(selector: (s: DecisionState) => T): T {
  return useStore(getAppStore(), useShallow(selector));
}

export const useCurrent = () => useApp(currentDecision);
export const actions = () => getAppStore().getState();
