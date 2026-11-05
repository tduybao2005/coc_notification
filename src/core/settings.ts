import type { KeyValueStore } from './store';

export interface AlertSettings { voice: boolean; ting: boolean; vibrate: boolean; banner: boolean }
export const DEFAULT_SETTINGS: AlertSettings = { voice: false, ting: false, vibrate: false, banner: false };
export const SETTINGS_KEY = 'village-timer:settings:v1';

export async function loadSettings(store: KeyValueStore): Promise<AlertSettings> {
  try {
    const raw = await store.get(SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
    const fields = data as Record<string, unknown>;
    const pick = (key: keyof AlertSettings): boolean =>
      typeof fields[key] === 'boolean' ? fields[key] : DEFAULT_SETTINGS[key];
    return { voice: pick('voice'), ting: pick('ting'), vibrate: pick('vibrate'), banner: pick('banner') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(store: KeyValueStore, settings: AlertSettings): Promise<boolean> {
  try {
    await store.set(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
