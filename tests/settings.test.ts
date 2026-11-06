import { DEFAULT_SETTINGS, SETTINGS_KEY, anyAlertOn, loadSettings, saveSettings, type Settings } from '../src/core/settings';
import { memoryStore } from './helpers';

test('defaults to everything off', async () => {
  expect(DEFAULT_SETTINGS).toEqual({ voice: false, ting: false, vibrate: false, banner: false, language: null });
  expect(await loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS);
});

test('round-trips', async () => {
  const s = memoryStore();
  const settings = { ...DEFAULT_SETTINGS, voice: true, banner: true };
  expect(await saveSettings(s, settings)).toBe(true);
  expect(await loadSettings(s)).toEqual(settings);
});

test.each(['{broken', 'null', '[]'])('corrupt settings %s give the defaults', async (raw) => {
  expect(await loadSettings(memoryStore({ [SETTINGS_KEY]: raw }))).toEqual(DEFAULT_SETTINGS);
});

test('a field of the wrong type takes its default', async () => {
  const s = memoryStore({ [SETTINGS_KEY]: '{"voice":true,"ting":"yes"}' });
  expect(await loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, voice: true });
});

test('a failed read gives the defaults and a failed write returns false', async () => {
  expect(await loadSettings(memoryStore({}, { failReads: true }))).toEqual(DEFAULT_SETTINGS);
  expect(await saveSettings(memoryStore({}, { failWrites: true }), DEFAULT_SETTINGS)).toBe(false);
});

test('the language reads back, and a wrong one means the device language', async () => {
  const s = memoryStore();
  await saveSettings(s, { ...DEFAULT_SETTINGS, language: 'en' });
  expect((await loadSettings(s)).language).toBe('en');
  for (const language of ['de', 5, null]) {
    const raw = JSON.stringify({ voice: true, language });
    expect(await loadSettings(memoryStore({ [SETTINGS_KEY]: raw }))).toEqual({ ...DEFAULT_SETTINGS, voice: true });
  }
});

test('anyAlertOn looks at the switches, not the language', () => {
  const english: Settings = { ...DEFAULT_SETTINGS, language: 'en' };
  expect(anyAlertOn(english)).toBe(false);
  expect(anyAlertOn({ ...DEFAULT_SETTINGS, banner: true })).toBe(true);
});
