import type { Language } from './language';
import type { KeyValueStore } from './store';

export interface AlertSettings { voice: boolean; ting: boolean; vibrate: boolean; banner: boolean }
// language null means follow the device.
export interface Settings extends AlertSettings { language: Language | null }
export const DEFAULT_SETTINGS: Settings = { voice: false, ting: false, vibrate: false, banner: false, language: null };
export const SETTINGS_KEY = 'village-timer:settings:v1';

export function anyAlertOn(settings: AlertSettings): boolean {
  return settings.voice || settings.ting || settings.vibrate || settings.banner;
}

export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  try {
    const raw = await store.get(SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
    const fields = data as Record<string, unknown>;
    const pick = (key: keyof AlertSettings): boolean =>
      typeof fields[key] === 'boolean' ? fields[key] : DEFAULT_SETTINGS[key];
    const language = fields.language === 'vi' || fields.language === 'en' ? fields.language : null;
    return { voice: pick('voice'), ting: pick('ting'), vibrate: pick('vibrate'), banner: pick('banner'), language };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(store: KeyValueStore, settings: Settings): Promise<boolean> {
  try {
    await store.set(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
