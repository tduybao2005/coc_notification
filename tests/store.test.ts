import { STORAGE_KEY, emptyState, loadState, saveState, upsertVillage, removeVillage, type AppState } from '../src/core/store';
import type { JobDetail, Village } from '../src/core/types';
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

test('a damaged old copy is reported, kept readable accounts are returned, and nothing is moved', async () => {
  const raw = JSON.stringify({ villages: { '#A': v('#A', 1), '#B': { tag: 'wrong' } }, activeTag: '#A' });
  const legacy = legacyWith(raw);
  const s = memoryStore();
  const { state, unreadable } = await loadState(s, () => legacy);
  expect(Object.keys(state.villages)).toEqual(['#A']);
  expect(unreadable).toBe(true);
  expect(legacy.getItem(STORAGE_KEY)).toBe(raw);
  expect(await s.get(STORAGE_KEY)).toBeNull();
});

test('an old copy that is not JSON is reported and kept', async () => {
  const legacy = legacyWith('{broken');
  const result = await loadState(memoryStore(), () => legacy);
  expect(result).toEqual({ state: emptyState(), unreadable: true });
  expect(legacy.getItem(STORAGE_KEY)).toBe('{broken');
});

const oldVillage = (detail: unknown) => JSON.stringify({ villages: { '#A': {
  tag: '#A', exportedAt: 1, hasBoosts: false,
  jobs: [{ id: 1, group: 'home-build', detail, endsAt: 9 }],
} }, activeTag: '#A' });

test.each<[string, JobDetail]>([
  ['Cấp 6 → 7', { kind: 'upgrade', level: 6 }],
  ['Cấp 3 · Vũ khí 2', { kind: 'weapon', level: 3, weapon: 2 }],
  ['Xây mới', { kind: 'build' }],
  ['Hồi chiêu', { kind: 'cooldown' }],
])('old detail %s is converted', async (raw, detail) => {
  const { state, unreadable } = await loadState(memoryStore({ [STORAGE_KEY]: oldVillage(raw) }));
  expect(state.villages['#A'].jobs[0].detail).toEqual(detail);
  expect(unreadable).toBe(false);
});

test.each([['Cấp ba'], [''], [5], [null], [{ kind: 'nope' }], [{ kind: 'upgrade' }]])(
  'an unknown detail %j drops that account', async (raw) => {
    const { state, unreadable } = await loadState(memoryStore({ [STORAGE_KEY]: oldVillage(raw) }));
    expect(state.villages).toEqual({});
    expect(unreadable).toBe(true);
  });

test('a job that is not an object drops that account', async () => {
  const raw = JSON.stringify({ villages: { '#A': { tag: '#A', exportedAt: 1, hasBoosts: false, jobs: [5] } }, activeTag: '#A' });
  const { state, unreadable } = await loadState(memoryStore({ [STORAGE_KEY]: raw }));
  expect(state.villages).toEqual({});
  expect(unreadable).toBe(true);
});

test('new details read back unchanged', async () => {
  const detail: JobDetail = { kind: 'weapon', level: 3, weapon: 2 };
  const s = memoryStore({ [STORAGE_KEY]: oldVillage(detail) });
  expect((await loadState(s)).state.villages['#A'].jobs[0].detail).toEqual(detail);
});

test('old data saves in the new form alongside a new account', async () => {
  const s = memoryStore({ [STORAGE_KEY]: oldVillage('Cấp 6 → 7') });
  const { state } = await loadState(s);
  await saveState(s, upsertVillage(state, v('#B', 2)).state);
  const again = await loadState(s);
  expect(Object.keys(again.state.villages).sort()).toEqual(['#A', '#B']);
  expect(again.state.villages['#A'].jobs[0].detail).toEqual({ kind: 'upgrade', level: 6 });
  expect(await s.get(STORAGE_KEY)).not.toContain('Cấp');
  expect(again.unreadable).toBe(false);
});
