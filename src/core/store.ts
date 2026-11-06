import type { Job, JobDetail, Village } from './types';

export const STORAGE_KEY = 'village-timer:v1';
export interface AppState { villages: Record<string, Village>; activeTag: string | null }
export type UpsertOutcome = 'added' | 'updated' | 'kept-newer';

export function emptyState(): AppState {
  return { villages: {}, activeTag: null };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// Reads a stored detail: the structured form, or one of the four Vietnamese strings written before
// details became data. Anything else is not a detail.
function toDetail(value: unknown): JobDetail | null {
  if (typeof value === 'string') {
    if (value === 'Xây mới') return { kind: 'build' };
    if (value === 'Hồi chiêu') return { kind: 'cooldown' };
    const upgrade = /^Cấp (\d+) → \d+$/.exec(value);
    if (upgrade) return { kind: 'upgrade', level: Number(upgrade[1]) };
    const weapon = /^Cấp (\d+) · Vũ khí (\d+)$/.exec(value);
    if (weapon) return { kind: 'weapon', level: Number(weapon[1]), weapon: Number(weapon[2]) };
    return null;
  }
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'upgrade': return isNumber(value.level) ? { kind: 'upgrade', level: value.level } : null;
    case 'weapon':
      return isNumber(value.level) && isNumber(value.weapon)
        ? { kind: 'weapon', level: value.level, weapon: value.weapon }
        : null;
    case 'build': return { kind: 'build' };
    case 'cooldown': return { kind: 'cooldown' };
    default: return null;
  }
}

function toJob(value: unknown): Job | null {
  if (!isRecord(value)) return null;
  const detail = toDetail(value.detail);
  return detail ? { ...(value as unknown as Job), detail } : null;
}

// Returns the village with every job's detail in its current form, or null if the village or any
// of its jobs cannot be read.
function toVillage(value: unknown): Village | null {
  if (!isRecord(value)
    || typeof value.tag !== 'string'
    || typeof value.exportedAt !== 'number'
    || typeof value.hasBoosts !== 'boolean'
    || !Array.isArray(value.jobs)) return null;
  const jobs: Job[] = [];
  for (const raw of value.jobs) {
    const job = toJob(raw);
    if (!job) return null;
    jobs.push(job);
  }
  return { ...(value as unknown as Village), jobs };
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
export interface LoadResult { state: AppState; unreadable: boolean }

function parseState(raw: string): LoadResult {
  try {
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || !isRecord(data.villages)) return { state: emptyState(), unreadable: true };
    const villages: Record<string, Village> = {};
    let dropped = false;
    for (const [tag, village] of Object.entries(data.villages)) {
      const read = toVillage(village);
      if (read && read.tag === tag) villages[tag] = read;
      else dropped = true;
    }
    const tags = Object.keys(villages);
    const activeTag = typeof data.activeTag === 'string' && Object.hasOwn(villages, data.activeTag)
      ? data.activeTag
      : (tags[0] ?? null);
    return { state: { villages, activeTag }, unreadable: dropped };
  } catch {
    return { state: emptyState(), unreadable: true };
  }
}

// Data written by the localStorage version of the app. A fully readable copy is moved; the old copy is
// removed once the store holds it, and left alone if the write fails. A damaged copy is neither moved
// nor removed: its readable accounts are returned with unreadable set so the app asks for a new paste.
// Merely touching localStorage can throw in browsers that block storage, so every access is guarded.
async function migrateLegacy(store: KeyValueStore, getLegacy: () => Storage): Promise<LoadResult> {
  const none: LoadResult = { state: emptyState(), unreadable: false };
  let legacy: Storage;
  let raw: string | null;
  try {
    legacy = getLegacy();
    raw = legacy.getItem(STORAGE_KEY);
  } catch {
    return none;
  }
  if (raw === null) return none;
  const parsed = parseState(raw);
  if (parsed.unreadable) return parsed;
  try {
    await store.set(STORAGE_KEY, raw);
    legacy.removeItem(STORAGE_KEY);
  } catch {
    // Keep the old copy; the data read from it is still returned.
  }
  return parsed;
}

export async function loadState(store: KeyValueStore, getLegacy?: () => Storage): Promise<LoadResult> {
  let raw: string | null;
  try {
    raw = await store.get(STORAGE_KEY);
  } catch {
    return { state: emptyState(), unreadable: true };
  }
  if (raw !== null) return parseState(raw);
  return getLegacy ? migrateLegacy(store, getLegacy) : { state: emptyState(), unreadable: false };
}

export async function saveState(store: KeyValueStore, state: AppState): Promise<boolean> {
  try {
    await store.set(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function upsertVillage(state: AppState, village: Village): { state: AppState; outcome: UpsertOutcome } {
  const existing = state.villages[village.tag];
  if (existing && village.exportedAt < existing.exportedAt) {
    return { state: { ...state, activeTag: village.tag }, outcome: 'kept-newer' };
  }
  return {
    state: { villages: { ...state.villages, [village.tag]: village }, activeTag: village.tag },
    outcome: existing ? 'updated' : 'added',
  };
}

export function removeVillage(state: AppState, tag: string): AppState {
  const villages = { ...state.villages };
  delete villages[tag];
  const activeTag = state.activeTag === tag ? (Object.keys(villages)[0] ?? null) : state.activeTag;
  return { villages, activeTag };
}
