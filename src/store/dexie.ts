/** IndexedDB persistence via Dexie. Browser only. */
import Dexie, { type Table } from 'dexie';
import type { Decision } from '@/engine/types';
import { DecisionSchema } from '@/lib/schema';
import type { PersistenceAdapter, Snapshot } from './persistence';

class DecideBetterDB extends Dexie {
  decisions!: Table<Decision, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  snapshots!: Table<Snapshot, string>;
  constructor() {
    super('decide-better');
    this.version(1).stores({ decisions: 'id, updatedAt', meta: 'key', snapshots: 'id, decisionId, createdAt' });
  }
}

export class DexieAdapter implements PersistenceAdapter {
  private db = new DecideBetterDB();

  async loadAll() {
    const rows = await this.db.decisions.toArray();
    // Rows are re-validated so a corrupted or hand-edited database can't crash the app.
    return rows.flatMap((r) => {
      const p = DecisionSchema.safeParse(r);
      return p.success ? [p.data] : [];
    });
  }
  async put(d: Decision) {
    await this.db.decisions.put(d);
  }
  async remove(id: string) {
    await this.db.transaction('rw', this.db.decisions, this.db.snapshots, async () => {
      await this.db.decisions.delete(id);
      await this.db.snapshots.where('decisionId').equals(id).delete();
    });
  }
  async getMeta<T>(key: string) {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    await this.db.meta.put({ key, value });
  }
  async listSnapshots(decisionId: string) {
    return this.db.snapshots.where('decisionId').equals(decisionId).sortBy('createdAt');
  }
  async putSnapshot(s: Snapshot) {
    await this.db.snapshots.put(s);
  }
  async removeSnapshot(id: string) {
    await this.db.snapshots.delete(id);
  }
}
