import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from '../src/core/settings';
import { memoryStore } from './helpers';

test('defaults to everything off', async () => {
  expect(DEFAULT_SETTINGS).toEqual({ voice: false, ting: false, vibrate: false, banner: false });
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
