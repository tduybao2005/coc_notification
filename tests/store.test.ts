import { STORAGE_KEY, emptyState, loadState, saveState, upsertVillage, removeVillage, type AppState } from '../src/core/store';
import type { Village } from '../src/core/types';
import { memoryStore } from './helpers';

const v = (tag: string, exportedAt: number): Village => ({ tag, exportedAt, jobs: [], hasBoosts: false });
const legacyWith = (raw: string | null) => {
  let value = raw;
  return { getItem: () => value, removeItem: () => { value = null; } } as unknown as Storage;
};
const saved = (state: AppState) => JSON.stringify(state);

test('round-trips through the store', async () => {
  const s = memoryStore();
  const { state } = upsertVillage(emptyState(), v('#A', 10));
  expect(await saveState(s, state)).toBe(true);
  expect(await loadState(s)).toEqual({ state, unreadable: false });
});

test('an empty store is not an error', async () => {
  expect(await loadState(memoryStore())).toEqual({ state: emptyState(), unreadable: false });
});

test.each(['{broken', '{"villages":5}', 'null'])('corrupt data %s is reported', async (raw) => {
  expect(await loadState(memoryStore({ [STORAGE_KEY]: raw }))).toEqual({ state: emptyState(), unreadable: true });
});

test('keeps readable accounts and reports the rest', async () => {
  const raw = JSON.stringify({ villages: { '#A': v('#A', 1), '#B': { tag: 'wrong' } }, activeTag: '#B' });
  const { state, unreadable } = await loadState(memoryStore({ [STORAGE_KEY]: raw }));
  expect(Object.keys(state.villages)).toEqual(['#A']);
  expect(state.activeTag).toBe('#A');
  expect(unreadable).toBe(true);
});

test('a failed read is reported', async () => {
  expect((await loadState(memoryStore({}, { failReads: true }))).unreadable).toBe(true);
});

test('a failed write returns false', async () => {
  expect(await saveState(memoryStore({}, { failWrites: true }), emptyState())).toBe(false);
});

test('unreadable data stays in the store until the next save', async () => {
  const s = memoryStore({ [STORAGE_KEY]: '{broken' });
  await loadState(s);
  expect(await s.get(STORAGE_KEY)).toBe('{broken');
});

test('moves old localStorage data across, then removes it', async () => {
  const raw = saved(upsertVillage(emptyState(), v('#A', 1)).state);
  const legacy = legacyWith(raw);
  const s = memoryStore();
  expect((await loadState(s, () => legacy)).state.activeTag).toBe('#A');
  expect(await s.get(STORAGE_KEY)).toBe(raw);
  expect(legacy.getItem(STORAGE_KEY)).toBeNull();
});

test('keeps old data when moving it fails', async () => {
  const raw = saved(upsertVillage(emptyState(), v('#A', 1)).state);
  const legacy = legacyWith(raw);
  const result = await loadState(memoryStore({}, { failWrites: true }), () => legacy);
  expect(result.state.activeTag).toBe('#A');
  expect(legacy.getItem(STORAGE_KEY)).toBe(raw);
});

test('store data wins over old localStorage data', async () => {
  const current = saved(upsertVillage(emptyState(), v('#NEW', 2)).state);
  const legacy = legacyWith(saved(upsertVillage(emptyState(), v('#OLD', 1)).state));
  expect((await loadState(memoryStore({ [STORAGE_KEY]: current }), () => legacy)).state.activeTag).toBe('#NEW');
});

test('blocked localStorage is ignored', async () => {
  const result = await loadState(memoryStore(), () => { throw new Error('SecurityError'); });
  expect(result).toEqual({ state: emptyState(), unreadable: false });
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
