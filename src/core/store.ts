import type { Village } from './types';

export const STORAGE_KEY = 'village-timer:v1';
export interface AppState { villages: Record<string, Village>; activeTag: string | null }
export type UpsertOutcome = 'added' | 'updated' | 'kept-newer';

export function emptyState(): AppState {
  return { villages: {}, activeTag: null };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isVillage = (value: unknown): value is Village =>
  isRecord(value)
  && typeof value.tag === 'string'
  && typeof value.exportedAt === 'number'
  && typeof value.hasBoosts === 'boolean'
  && Array.isArray(value.jobs);

export function loadState(storage: Storage): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return emptyState();
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || !isRecord(data.villages)) return emptyState();
    const villages: Record<string, Village> = {};
    for (const [tag, village] of Object.entries(data.villages)) {
      if (isVillage(village) && village.tag === tag) villages[tag] = village;
    }
    const tags = Object.keys(villages);
    const activeTag = typeof data.activeTag === 'string' && Object.hasOwn(villages, data.activeTag)
      ? data.activeTag
      : (tags[0] ?? null);
    return { villages, activeTag };
  } catch {
    return emptyState();
  }
}

export function saveState(storage: Storage, state: AppState): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
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
