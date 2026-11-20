import { describe, expect, it } from 'vitest';
import { computeModel, deriveScores } from '@/engine';
import { createDecisionStore, currentDecision, HISTORY_CAP, libraryOrder } from '@/store/decisionStore';
import { MemoryAdapter, LEGACY_KEYS } from '@/store/persistence';
import * as ops from '@/store/ops';
import { tpl } from './helpers';

let clock = 1_000;
const now = () => ++clock;

async function setup(adapter = new MemoryAdapter(), legacy?: Record<string, string>) {
  const store = createDecisionStore({ adapter, now, legacyStorage: legacy ? { getItem: (k) => legacy[k] ?? null } : undefined });
  await store.getState().hydrate();
  return { store, adapter, s: () => store.getState(), cur: () => currentDecision(store.getState()) };
}

describe('hydration', () => {
  it('starts with the Job template on first run, like the prototype', async () => {
    const { cur, adapter, s } = await setup();
    expect(cur().templateKey).toBe('job');
    await s().flush();
    expect(adapter.decisions.size).toBe(1);
  });

  it('migrates the prototype localStorage library', async () => {
    const proto = {
      cur: 'p2',
      at: { p1: 5, p2: 9 },
      items: {
        p1: {
          id: 'p1',
          title: 'First',
          tpl: 'blank',
          options: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
          criteria: [{ id: 'c', name: 'C', w: 50, s: [3, 7] }],
        },
        p2: {
          id: 'p2',
          title: 'Second',
          tpl: 'blank',
          options: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
          criteria: [{ id: 'c', name: 'C', w: 50, s: [8, 2] }],
        },
      },
    };
    const { s, cur, adapter } = await setup(new MemoryAdapter(), { [LEGACY_KEYS.library]: JSON.stringify(proto) });
    expect(Object.keys(s().decisions).sort()).toEqual(['p1', 'p2']);
    expect(cur().id).toBe('p2');
    expect(libraryOrder(s()).map((d) => d.title)).toEqual(['Second', 'First']);
    await s().flush();
    expect(adapter.decisions.size).toBe(2);
  });

  it('reloads saved decisions and the last selected one', async () => {
    const a = await setup();
    const second = a.s().create('mba');
    a.s().change((d) => ops.setTitle(d, 'Saved MBA'));
    await a.s().flush();
    const b = await setup(a.adapter);
    expect(b.cur().id).toBe(second.id);
    expect(b.cur().title).toBe('Saved MBA');
    expect(Object.keys(b.s().decisions)).toHaveLength(2);
  });
});

describe('undo / redo', () => {
  it('live edits create one undo step per commit', async () => {
    const { s, cur } = await setup();
    s().edit((d) => ops.setTitle(d, 'S'));
    s().edit((d) => ops.setTitle(d, 'Sh'));
    s().edit((d) => ops.setTitle(d, 'Sho'));
    s().commit();
    expect(s().undoStack).toHaveLength(1);
    s().commit(); // no-op commit adds nothing
    expect(s().undoStack).toHaveLength(1);
    s().undo();
    expect(cur().title).toBe('Should I switch jobs?');
    s().redo();
    expect(cur().title).toBe('Sho');
  });

  it('a new change clears the redo stack', async () => {
    const { s } = await setup();
    s().change((d) => ops.setWeight(d, 0, 50));
    s().undo();
    expect(s().redoStack).toHaveLength(1);
    s().change((d) => ops.setWeight(d, 0, 60));
    expect(s().redoStack).toHaveLength(0);
  });

  it(`history is capped at ${HISTORY_CAP} steps`, async () => {
    const { s, cur } = await setup();
    for (let k = 0; k < 100; k++) s().change((d) => ops.setWeight(d, 0, k));
    expect(s().undoStack).toHaveLength(HISTORY_CAP);
    for (let k = 0; k < 200; k++) s().undo();
    expect(cur().criteria[0]!.weight).toBe(19); // the oldest 20 steps were dropped
  });

  it('switching decisions clears history', async () => {
    const { s } = await setup();
    s().change((d) => ops.setWeight(d, 0, 1));
    s().create('laptop');
    expect(s().undoStack).toHaveLength(0);
  });

  it('undo restores scores and persists the restored state', async () => {
    const { s, cur, adapter } = await setup();
    const before = computeModel(cur()).S;
    s().change((d) => ops.setScore(d, 0, 0, '10'));
    expect(computeModel(cur()).S).not.toEqual(before);
    s().undo();
    expect(computeModel(cur()).S).toEqual(before);
    await s().flush();
    expect(adapter.decisions.get(cur().id)!.criteria[0]!.scores[0]).toBe(5);
  });
});

describe('library', () => {
  it('duplicate makes an independent copy with fresh ids', async () => {
    const { s, cur } = await setup();
    const orig = cur();
    const copy = s().duplicate();
    expect(copy.id).not.toBe(orig.id);
    expect(copy.title).toBe('Should I switch jobs? (copy)');
    s().change((d) => ops.setWeight(d, 0, 0));
    expect(s().decisions[orig.id]!.criteria[0]!.weight).toBe(30);
  });

  it('delete switches to the most recent decision, or a new blank one', async () => {
    const { s, cur, adapter } = await setup();
    const first = cur().id;
    s().create('mba');
    s().remove();
    expect(cur().id).toBe(first);
    s().remove();
    expect(cur().templateKey).toBe('blank');
    await s().flush();
    expect([...adapter.decisions.keys()]).toEqual([cur().id]);
  });

  it('reset template restores the template but keeps the id', async () => {
    const { s, cur } = await setup();
    const id = cur().id;
    s().change((d) => {
      ops.setTitle(d, 'Changed');
      ops.removeCriterion(d, 0);
    });
    s().resetTemplate();
    expect(cur().id).toBe(id);
    expect(cur().title).toBe('Should I switch jobs?');
    expect(cur().criteria).toHaveLength(5);
  });

  it('imports text as new decisions and reports errors', async () => {
    const { s } = await setup();
    const r = s().importText(JSON.stringify([tpl('mba'), { nope: 1 }]));
    expect(r.imported).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(Object.keys(s().decisions)).toHaveLength(2);
    expect(s().importText('garbage').errors[0]).toMatch(/valid JSON/);
  });

  it('snapshots are saved per decision and survive reload', async () => {
    const a = await setup();
    await a.s().saveSnapshot('Before re-weighting');
    a.s().change((d) => ops.setWeight(d, 0, 0));
    await a.s().flush();
    const b = await setup(a.adapter);
    await new Promise((r) => setTimeout(r, 0));
    expect(b.s().snapshots.map((x) => x.label)).toEqual(['Before re-weighting']);
    expect(b.s().snapshots[0]!.data.criteria[0]!.weight).toBe(30);
  });

  it('reports save errors instead of throwing', async () => {
    const adapter = new MemoryAdapter();
    const { s } = await setup(adapter);
    adapter.put = async () => {
      throw new Error('Quota exceeded');
    };
    s().change((d) => ops.setTitle(d, 'x'));
    await s().flush();
    expect(s().saveError).toBe('Quota exceeded');
  });
});

describe('ops (prototype parity)', () => {
  it('add/remove option keeps every criterion aligned and clears a removed gut pick', () => {
    const d = tpl('job');
    ops.addOption(d);
    expect(d.options.at(-1)!.name).toBe('Option C');
    expect(d.criteria.every((c) => c.scores.length === 3 && c.values.length === 3)).toBe(true);
    d.gutOptionId = d.options[2]!.id;
    ops.removeOption(d, 2);
    expect(d.gutOptionId).toBeNull();
    expect(ops.removeOption(d, 0)).toBe(false); // minimum two options
  });

  it('limits: max 5 options, max 10 criteria, min 1 criterion', () => {
    const d = tpl('blank');
    for (let k = 0; k < 10; k++) ops.addOption(d);
    expect(d.options).toHaveLength(5);
    for (let k = 0; k < 20; k++) ops.addCriterion(d);
    expect(d.criteria).toHaveLength(10);
    while (ops.removeCriterion(d, 0));
    expect(d.criteria).toHaveLength(1);
  });

  it('switching value → score seeds ratings from derived scores (rounded to 0.5) and clears the deal-breaker', () => {
    const d = tpl('laptop');
    const derived = deriveScores(d.criteria[0]!);
    ops.setMode(d, 0, 'score');
    expect(d.criteria[0]!.scores).toEqual(derived.map((x) => Math.round(x * 2) / 2));
    expect(d.criteria[0]!.dealBreaker).toBeNull();
  });

  it('turning on a deal-breaker starts at the weakest value, so nothing is ruled out', () => {
    const d = tpl('laptop');
    ops.toggleDealBreaker(d, 1, true); // battery, higher is better
    expect(d.criteria[1]!.dealBreaker).toBe(10);
    ops.toggleDealBreaker(d, 2, true); // score mode
    expect(d.criteria[2]!.dealBreaker).toBe(4);
    ops.setDirection(d, 1, -1);
    expect(d.criteria[1]!.dealBreaker).toBe(15);
  });

  it('score input ignores blanks, clamps to 1–10; value input clears on blank', () => {
    const d = tpl('job');
    ops.setScore(d, 0, 0, '');
    expect(d.criteria[0]!.scores[0]).toBe(5);
    ops.setScore(d, 0, 0, '42');
    expect(d.criteria[0]!.scores[0]).toBe(10);
    ops.setValue(d, 1, 0, '');
    expect(d.criteria[1]!.values[0]).toBeNull();
  });
});
