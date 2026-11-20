/** Storage-agnostic persistence. The app uses Dexie (IndexedDB); tests use the memory adapter. */
import type { Decision } from '@/engine/types';
import { parseImport } from '@/lib/schema';

export interface Snapshot {
  id: string;
  decisionId: string;
  label: string;
  createdAt: number;
  data: Decision;
}

export interface PersistenceAdapter {
  loadAll(): Promise<Decision[]>;
  put(d: Decision): Promise<void>;
  remove(id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  listSnapshots(decisionId: string): Promise<Snapshot[]>;
  putSnapshot(s: Snapshot): Promise<void>;
  removeSnapshot(id: string): Promise<void>;
}

export class MemoryAdapter implements PersistenceAdapter {
  decisions = new Map<string, Decision>();
  meta = new Map<string, unknown>();
  snapshots = new Map<string, Snapshot>();
  async loadAll() {
    return [...this.decisions.values()].map((d) => structuredClone(d));
  }
  async put(d: Decision) {
    this.decisions.set(d.id, structuredClone(d));
  }
  async remove(id: string) {
    this.decisions.delete(id);
    for (const [k, s] of this.snapshots) if (s.decisionId === id) this.snapshots.delete(k);
  }
  async getMeta<T>(key: string) {
    return this.meta.get(key) as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    this.meta.set(key, value);
  }
  async listSnapshots(decisionId: string) {
    return [...this.snapshots.values()].filter((s) => s.decisionId === decisionId).sort((a, b) => a.createdAt - b.createdAt);
  }
  async putSnapshot(s: Snapshot) {
    this.snapshots.set(s.id, structuredClone(s));
  }
  async removeSnapshot(id: string) {
    this.snapshots.delete(id);
  }
}

/** localStorage keys used by prototype/index.html. */
export const LEGACY_KEYS = { library: 'decide-better-lib', single: 'decide-better-v1' } as const;

/** Read decisions left behind by the prototype, if any. Never throws. */
export function readLegacy(storage: Pick<Storage, 'getItem'> | undefined): { decisions: Decision[]; current: string | null } {
  if (!storage) return { decisions: [], current: null };
  try {
    const lib = storage.getItem(LEGACY_KEYS.library);
    if (lib) {
      const raw = JSON.parse(lib) as { cur?: unknown; at?: Record<string, number> };
      const { decisions } = parseImport(raw);
      const at = raw.at ?? {};
      decisions.forEach((d) => {
        const t = at[d.id];
        if (typeof t === 'number' && t > 0) d.createdAt = d.updatedAt = t;
      });
      return { decisions, current: typeof raw.cur === 'string' ? raw.cur : null };
    }
    const single = storage.getItem(LEGACY_KEYS.single);
    if (single) return { decisions: parseImport(single).decisions, current: null };
  } catch {
    /* corrupt legacy data is ignored */
  }
  return { decisions: [], current: null };
}
