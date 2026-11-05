import { STORAGE_KEY, emptyState, loadState, openStorage, saveState, upsertVillage, removeVillage } from '../src/core/store';
import type { Village } from '../src/core/types';

const v = (tag: string, exportedAt: number): Village => ({ tag, exportedAt, jobs: [], hasBoosts: false });
const memory = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => void m.set(k, x) } as Storage;
};

test('round-trips through storage', () => {
  const s = memory();
  const { state } = upsertVillage(emptyState(), v('#A', 10));
  expect(saveState(s, state)).toBe(true);
  expect(loadState(s)).toEqual(state);
});

test.each(['{broken', '{"villages":5}', 'null'])('corrupt storage %s gives empty state', (raw) => {
  const s = memory();
  s.setItem(STORAGE_KEY, raw);
  expect(loadState(s)).toEqual(emptyState());
});

test('reports a failed write instead of throwing', () => {
  const s = { setItem() { throw new Error('quota'); } } as unknown as Storage;
  expect(saveState(s, emptyState())).toBe(false);
});

test('a second account keeps the first and becomes active', () => {
  const first = upsertVillage(emptyState(), v('#A', 10));
  const second = upsertVillage(first.state, v('#B', 5));
  expect(second.outcome).toBe('added');
  expect(Object.keys(second.state.villages)).toEqual(['#A', '#B']);
  expect(second.state.activeTag).toBe('#B');
});

test('newer export replaces, older export is ignored but its account opens', () => {
  const start = upsertVillage(upsertVillage(emptyState(), v('#A', 10)).state, v('#B', 10)).state;
  const newer = upsertVillage(start, v('#A', 20));
  expect(newer.outcome).toBe('updated');
  expect(newer.state.villages['#A'].exportedAt).toBe(20);
  const older = upsertVillage(newer.state, v('#A', 15));
  expect(older.outcome).toBe('kept-newer');
  expect(older.state.villages['#A'].exportedAt).toBe(20);
  expect(older.state.activeTag).toBe('#A');
});

test('removing the active account selects another or none', () => {
  const start = upsertVillage(upsertVillage(emptyState(), v('#A', 1)).state, v('#B', 1)).state;
  const one = removeVillage(start, '#B');
  expect(one.activeTag).toBe('#A');
  expect(removeVillage(one, '#A')).toEqual(emptyState());
});

test('blocked storage gives an empty state and a failed save instead of throwing', () => {
  const s = openStorage(() => { throw new Error('SecurityError'); });
  expect(loadState(s)).toEqual(emptyState());
  expect(saveState(s, emptyState())).toBe(false);
});

test('working storage is returned unchanged', () => {
  const s = memory();
  expect(openStorage(() => s)).toBe(s);
});
