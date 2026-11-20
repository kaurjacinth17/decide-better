/**
 * The decision store: a library of decisions, the one being edited, and undo/redo.
 *
 * Editing follows the prototype: `edit` applies a change live (every keystroke) without
 * creating an undo step; `commit` records one undo step if anything changed since the
 * last commit (on blur / change / discrete actions). `change` does both. History is capped
 * at 80 steps and cleared when switching decisions.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Decision, TemplateKey } from '@/engine/types';
import { fromTemplate } from '@/templates';
import { newId } from '@/lib/id';
import { DecisionSchema, parseImport } from '@/lib/schema';
import { readLegacy, type PersistenceAdapter, type Snapshot } from './persistence';

export const HISTORY_CAP = 80;
const SAVE_DEBOUNCE_MS = 300;
const META_CURRENT = 'currentId';

export interface DecisionState {
  hydrated: boolean;
  decisions: Record<string, Decision>;
  currentId: string;
  undoStack: string[];
  redoStack: string[];
  /** JSON of the current decision at the last commit. */
  lastCommitted: string;
  saveError: string | null;
  snapshots: Snapshot[];

  hydrate(): Promise<void>;
  edit(recipe: (d: Decision) => void): void;
  commit(): void;
  change(recipe: (d: Decision) => void): void;
  undo(): void;
  redo(): void;
  select(id: string): void;
  create(key: TemplateKey): Decision;
  add(d: Decision, opts?: { freshId?: boolean }): Decision;
  duplicate(): Decision;
  remove(id?: string): void;
  resetTemplate(): void;
  importText(text: string): { imported: Decision[]; errors: string[] };
  saveSnapshot(label: string): Promise<Snapshot>;
  deleteSnapshot(id: string): Promise<void>;
  /** Wait for every pending write (tests, before unload). */
  flush(): Promise<void>;
}

export interface StoreDeps {
  adapter: PersistenceAdapter;
  legacyStorage?: Pick<Storage, 'getItem'>;
  now?: () => number;
}

export type DecisionStore = StoreApi<DecisionState>;

export const currentDecision = (s: Pick<DecisionState, 'decisions' | 'currentId'>) => s.decisions[s.currentId]!;

/** Library order: most recently updated first. */
export const libraryOrder = (s: Pick<DecisionState, 'decisions'>) => Object.values(s.decisions).sort((a, b) => b.updatedAt - a.updatedAt);

export function createDecisionStore({ adapter, legacyStorage, now = Date.now }: StoreDeps): DecisionStore {
  let writes: Promise<unknown> = Promise.resolve();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const enqueue = (fn: () => Promise<unknown>) => {
    writes = writes
      .then(fn)
      .then(() => store.getState().saveError && store.setState({ saveError: null }))
      .catch((e: unknown) => store.setState({ saveError: e instanceof Error ? e.message : 'Could not save' }));
    return writes;
  };
  const persistNow = (id: string) => {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    const d = store.getState().decisions[id];
    if (d) void enqueue(() => adapter.put(structuredClone(d)));
  };
  const persistSoon = (id: string) => {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.set(
      id,
      setTimeout(() => persistNow(id), SAVE_DEBOUNCE_MS),
    );
  };

  const setCurrent = (d: Decision, extra: Partial<DecisionState> = {}) =>
    store.setState((s) => ({ decisions: { ...s.decisions, [d.id]: d }, ...extra }));

  const switchTo = (id: string) => {
    const s = store.getState();
    const d = s.decisions[id];
    if (!d) return;
    store.setState({ currentId: id, undoStack: [], redoStack: [], lastCommitted: JSON.stringify(d), snapshots: [] });
    void enqueue(() => adapter.setMeta(META_CURRENT, id));
    void loadSnapshots(id);
  };

  const loadSnapshots = async (id: string) => {
    const snaps = await adapter.listSnapshots(id).catch(() => []);
    if (store.getState().currentId === id) store.setState({ snapshots: snaps });
  };

  /** Load a snapshot string into the current slot (undo/redo). */
  const restore = (json: string) => {
    const parsed = DecisionSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return;
    const d = { ...parsed.data, updatedAt: now() };
    setCurrent(d, { lastCommitted: json });
    persistNow(d.id);
  };

  const store = createStore<DecisionState>()((set, get) => ({
    hydrated: false,
    decisions: {},
    currentId: '',
    undoStack: [],
    redoStack: [],
    lastCommitted: '',
    saveError: null,
    snapshots: [],

    async hydrate() {
      let all = await adapter.loadAll().catch(() => [] as Decision[]);
      let preferred = await adapter.getMeta<string>(META_CURRENT).catch(() => undefined);
      if (!all.length) {
        const legacy = readLegacy(legacyStorage);
        all = legacy.decisions;
        preferred = legacy.current ?? undefined;
        if (!all.length) all = [fromTemplate('job', now())];
        await Promise.all(all.map((d) => adapter.put(d))).catch(() => undefined);
      }
      const decisions = Object.fromEntries(all.map((d) => [d.id, d]));
      const currentId = preferred && decisions[preferred] ? preferred : libraryOrder({ decisions })[0]!.id;
      set({ hydrated: true, decisions, currentId, undoStack: [], redoStack: [], lastCommitted: JSON.stringify(decisions[currentId]) });
      void loadSnapshots(currentId);
    },

    edit(recipe) {
      const d = structuredClone(currentDecision(get()));
      recipe(d);
      d.updatedAt = now();
      setCurrent(d);
      persistSoon(d.id);
    },

    commit() {
      const s = get();
      const d = currentDecision(s);
      // updatedAt changes on every edit; compare content only so a no-op blur adds no undo step.
      const json = JSON.stringify(d);
      if (stripTime(json) !== stripTime(s.lastCommitted)) {
        const undoStack = [...s.undoStack, s.lastCommitted].slice(-HISTORY_CAP);
        set({ undoStack, redoStack: [], lastCommitted: json });
      }
      persistNow(d.id);
    },

    change(recipe) {
      get().edit(recipe);
      get().commit();
    },

    undo() {
      const s = get();
      const prev = s.undoStack.at(-1);
      if (prev === undefined) return;
      set({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, JSON.stringify(currentDecision(s))] });
      restore(prev);
    },

    redo() {
      const s = get();
      const next = s.redoStack.at(-1);
      if (next === undefined) return;
      set({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, JSON.stringify(currentDecision(s))].slice(-HISTORY_CAP) });
      restore(next);
    },

    select(id) {
      if (id !== get().currentId && get().decisions[id]) {
        persistNow(get().currentId);
        switchTo(id);
      }
    },

    create(key) {
      return get().add(fromTemplate(key, now()));
    },

    add(d, opts) {
      const t = now();
      const copy: Decision = { ...structuredClone(d), createdAt: t, updatedAt: t };
      if (opts?.freshId || get().decisions[copy.id]) copy.id = newId();
      setCurrent(copy);
      persistNow(copy.id);
      switchTo(copy.id);
      return copy;
    },

    duplicate() {
      const src = currentDecision(get());
      return get().add({ ...structuredClone(src), title: `${src.title} (copy)`.slice(0, 90) }, { freshId: true });
    },

    remove(id = get().currentId) {
      const s = get();
      if (!s.decisions[id]) return;
      const rest = { ...s.decisions };
      delete rest[id];
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.delete(id);
      set({ decisions: rest });
      void enqueue(() => adapter.remove(id));
      if (id !== s.currentId) return;
      const next = libraryOrder({ decisions: rest })[0];
      if (next) switchTo(next.id);
      else get().create('blank');
    },

    resetTemplate() {
      const cur = currentDecision(get());
      const fresh = fromTemplate(cur.templateKey, now());
      get().change((d) => Object.assign(d, { ...fresh, id: cur.id, createdAt: cur.createdAt }));
    },

    importText(text) {
      const { decisions, errors } = parseImport(text);
      const imported = decisions.map((d) => get().add(d, { freshId: true }));
      return { imported, errors };
    },

    async saveSnapshot(label) {
      const d = currentDecision(get());
      const snap: Snapshot = {
        id: newId(),
        decisionId: d.id,
        label: label.trim() || 'Saved version',
        createdAt: now(),
        data: structuredClone(d),
      };
      await enqueue(() => adapter.putSnapshot(snap));
      set((s) => ({ snapshots: [...s.snapshots, snap] }));
      return snap;
    },

    async deleteSnapshot(id) {
      await enqueue(() => adapter.removeSnapshot(id));
      set((s) => ({ snapshots: s.snapshots.filter((x) => x.id !== id) }));
    },

    async flush() {
      for (const id of [...timers.keys()]) persistNow(id);
      await writes;
    },
  }));

  return store;
}

const stripTime = (json: string) => json.replace(/"updatedAt":\d+/, '');
