// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { STORAGE_KEY, loadState, type KeyValueStore } from '../src/core/store';
import type { Language } from '../src/core/language';
import { formatCountdown } from '../src/core/time';
import { DEFAULT_SETTINGS, loadSettings, type AlertSettings, type Settings } from '../src/core/settings';
import type { AlertOutput } from '../src/platform/alert-output';
import { mountApp, type AppDeps } from '../src/ui/app';
import { fakeOutput, memoryStore } from './helpers';

const sample = readFileSync('tests/fixtures/export.sample.json', 'utf8');
const T = 1793895122;
const flush = () => vi.advanceTimersByTimeAsync(0);
let unmount: (() => void) | undefined;
let store: KeyValueStore;

async function setup(clockMs: number, opts: {
  clip?: AppDeps['readClipboard']; store?: KeyValueStore; settings?: Settings; output?: AlertOutput;
  deviceLanguage?: Language;
} = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  const useStore = opts.store ?? store;
  const deps: AppDeps = {
    store: useStore,
    loaded: await loadState(useStore),
    settings: opts.settings ?? await loadSettings(useStore),
    deviceLanguage: opts.deviceLanguage ?? 'vi',
    output: opts.output ?? fakeOutput(),
    now: () => Date.now(),
    readClipboard: opts.clip ?? (async () => sample),
  };
  vi.setSystemTime(clockMs);
  unmount = mountApp(document.getElementById('app')!, deps);
  return document.getElementById('app')!;
}
const click = (root: HTMLElement, selector: string) => (root.querySelector(selector) as HTMLElement).click();
const rows = (root: HTMLElement) => [...root.querySelectorAll('li[data-ends-at]')];
const row = (root: HTMLElement, name: string) => rows(root).find((r) => r.textContent!.includes(name))!;
const remaining = (r: Element) => r.querySelector('.job-remaining')!.textContent;

// jsdom runs history.back on a real timer outside fake timers, so its popstate could land in the next test.
let historyBack: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  store = memoryStore();
  historyBack = vi.spyOn(history, 'back').mockImplementation(() => {});
});
afterEach(() => { unmount?.(); historyBack.mockRestore(); vi.useRealTimers(); });

test('first visit shows how to export and the legal footer', async () => {
  const root = await setup(T * 1000);
  expect(root.querySelector('[data-role="help"]')!.textContent).toContain('Data Export');
  expect(root.querySelector('footer')!.textContent).toContain('not endorsed by Supercell');
  expect(root.querySelector('footer')!.textContent).toContain('Dữ liệu chỉ lưu trên máy này');
  expect(root.querySelector('footer a')!.getAttribute('href')).toBe('licenses/clash-of-clans-data.txt');
});

test('pasting shows every job with remaining time and end time', async () => {
  const root = await setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('h2')!.textContent).toBe('Làng chính · Công trình');
  const barracks = row(root, 'Dark Barracks');
  expect(barracks.querySelector('.job-detail')!.textContent).toBe('Cấp 12 → 13');
  expect(remaining(barracks)).toBe('4 ngày 15 giờ');
  expect(root.textContent).toContain('13 phút trước');
});

test('remaining time ticks every second', async () => {
  const root = await setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(remaining(row(root, 'Workshop'))).toBe('14 giờ 59 phút');
  await vi.advanceTimersByTimeAsync(1000);
  expect(remaining(row(root, 'Workshop'))).toBe('14 giờ 59 phút');
});

test('remaining time under a minute shows seconds and ticks', async () => {
  const root = await setup((T + 54700) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(remaining(row(root, 'Workshop'))).toBe('59 giây');
  await vi.advanceTimersByTimeAsync(1000);
  expect(remaining(row(root, 'Workshop'))).toBe('58 giây');
});

test('reopening restores data, and finished jobs stay visible', async () => {
  let root = await setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  unmount!();
  root = await setup((T + 30 * 86400) * 1000);
  expect(rows(root)).toHaveLength(13);
  expect(rows(root).every((r) => remaining(r) === 'Đã xong')).toBe(true);
});

test('job moves to the end of its group when it finishes', async () => {
  const root = await setup((T + 54750) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  const first = () => root.querySelector('li[data-ends-at] .job-name')!.textContent;
  expect(first()).toContain('Workshop');
  await vi.advanceTimersByTimeAsync(10000);
  expect(first()).not.toContain('Workshop');
});

test('clipboard denied explains and manual paste still works', async () => {
  const root = await setup((T + 807) * 1000, { clip: async () => { throw new Error('denied'); } });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-notice="error"]')!.textContent).toContain('nhấn giữ');
  const box = root.querySelector('textarea[name="export"]') as HTMLTextAreaElement;
  box.value = sample;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
  expect(rows(root)).toHaveLength(13);
});

test('bad paste keeps existing data and shows the reason', async () => {
  let clip = sample;
  const root = await setup((T + 807) * 1000, { clip: async () => clip });
  click(root, 'button[data-action="paste"]');
  await flush();
  clip = sample.slice(0, 500);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('[data-notice="error"]')!.textContent).toContain('dữ liệu bị thiếu');
});

test('older export is not applied and says so', async () => {
  let clip = sample;
  const root = await setup((T + 900) * 1000, { clip: async () => clip });
  click(root, 'button[data-action="paste"]');
  await flush();
  clip = JSON.stringify({ ...JSON.parse(sample), timestamp: T - 500, buildings: [] });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('[data-notice="kept-newer"]')).not.toBeNull();
});

test('second account gets a tab, switching and deleting work', async () => {
  let clip = sample;
  const root = await setup((T + 807) * 1000, { clip: async () => clip });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelectorAll('button[data-tag]')).toHaveLength(0);
  clip = JSON.stringify({ tag: '#OTHER1', timestamp: T, buildings: [{ data: 1000026, lvl: 1, timer: 5000 }] });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(1);
  click(root, 'button[data-tag="#TEST123"]');
  expect(rows(root)).toHaveLength(13);
  click(root, 'button[data-action="delete"]');
  expect(rows(root)).toHaveLength(1);
  expect(root.querySelectorAll('button[data-tag]')).toHaveLength(0);
});

test('shows boost, clock and no-job notices', async () => {
  const clip = JSON.stringify({ tag: '#TEST123', timestamp: T, boosts: { any: 1 } });
  const root = await setup((T - 600) * 1000, { clip: async () => clip });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-notice="boost"]')).not.toBeNull();
  expect(root.querySelector('[data-notice="clock"]')).not.toBeNull();
  expect(root.querySelector('[data-role="no-jobs"]')).not.toBeNull();
});

test('failed save warns but still shows the data', async () => {
  const root = await setup((T + 807) * 1000, { store: memoryStore({}, { failWrites: true }) });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('[data-notice="storage"]')).not.toBeNull();
});

test('ticking leaves the account line untouched while its text is unchanged', async () => {
  const root = await setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  const span = root.querySelector('.account span')!;
  const node = span.firstChild;
  const text = span.textContent;
  await vi.advanceTimersByTimeAsync(1000);
  expect(span.textContent).toBe(text);
  expect(span.firstChild).toBe(node);
});

test('unreadable saved data asks for a new paste, and a good paste clears it', async () => {
  const root = await setup((T + 807) * 1000, { store: memoryStore({ [STORAGE_KEY]: '{broken' }) });
  expect(root.querySelector('[data-notice="unreadable"]')!.textContent).toContain('dán lại');
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-notice="unreadable"]')).toBeNull();
  expect(rows(root)).toHaveLength(13);
});

const on = (over: Partial<AlertSettings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });
const all = on({ banner: true, vibrate: true, ting: true, voice: true });
const twoJobs = JSON.stringify({ tag: '#TEST123', timestamp: T, buildings: [
  { data: 1000026, lvl: 1, timer: 100 }, { data: 1000059, lvl: 1, timer: 100 }] });
const oneJob = JSON.stringify({ tag: '#TEST123', timestamp: T, buildings: [{ data: 1000026, lvl: 1, timer: 100 }] });
const staggered = async () => JSON.stringify({ tag: '#TEST123', timestamp: T, buildings: [
  { data: 1000026, lvl: 1, timer: 100 }, { data: 1000059, lvl: 1, timer: 103 }] });
const notice = (root: HTMLElement, kind: string) => root.querySelector(`[data-notice="${kind}"]`);
const input = (root: HTMLElement, name: string) => root.querySelector(`input[name="${name}"]`) as HTMLInputElement;

async function pasted(clockMs: number, opts: Parameters<typeof setup>[1] = {}) {
  const root = await setup(clockMs, opts);
  click(root, 'button[data-action="paste"]');
  await flush();
  return root;
}

test('a job reaching its end fires the enabled kinds once, in order', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, settings: all });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:Workshop đã xong', 'vibrate', 'ting', 'voice-vi']);
});

test('only the enabled kinds fire', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, settings: on({ ting: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['ting']);
});

test('jobs ending in the same tick fire once', async () => {
  const output = fakeOutput();
  await pasted((T + 98) * 1000, { output, settings: on({ banner: true }), clip: async () => twoJobs });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:2 hạng mục đã xong']);
});

test('jobs finished before opening stay quiet', async () => {
  const shared = memoryStore();
  await pasted((T + 54800) * 1000, { store: shared });
  unmount!();
  const output = fakeOutput();
  await setup((T + 54810) * 1000, { store: shared, output, settings: all });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual([]);
});

test('an account not on screen still alerts', async () => {
  let clip = sample;
  const output = fakeOutput();
  const root = await pasted((T + 54757) * 1000, { output, settings: on({ banner: true }), clip: async () => clip });
  clip = JSON.stringify({ tag: '#OTHER1', timestamp: T, buildings: [{ data: 1000026, lvl: 1, timer: 999999 }] });
  click(root, 'button[data-action="paste"]');
  await flush();
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:Workshop đã xong']);
});

test('a page resumed after a long pause alerts once for everything it missed', async () => {
  const output = fakeOutput();
  await pasted((T + 44000) * 1000, { output, settings: on({ banner: true }) });
  vi.setSystemTime((T + 60000) * 1000);
  document.dispatchEvent(new Event('visibilitychange'));
  await flush();
  await vi.advanceTimersByTimeAsync(3000);
  expect(output.calls).toEqual(['banner:2 hạng mục đã xong']);
});

test('a deleted account no longer alerts', async () => {
  const output = fakeOutput();
  const root = await pasted((T + 54757) * 1000, { output, settings: all });
  click(root, 'button[data-action="delete"]');
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual([]);
});

test('a later alert does not play over a sound, and the next one plays once it ends', async () => {
  let plays = 0;
  let release!: (ok: boolean) => void;
  const output = fakeOutput({ play: () => { plays += 1; return new Promise((r) => { release = r; }); } });
  const clip = async () => JSON.stringify({ tag: '#TEST123', timestamp: T, buildings: [
    { data: 1000026, lvl: 1, timer: 100 }, { data: 1000059, lvl: 1, timer: 103 }, { data: 1000067, lvl: 1, timer: 109 }] });
  await pasted((T + 98) * 1000, { output, settings: on({ banner: true, voice: true }), clip });
  await vi.advanceTimersByTimeAsync(7000);
  expect(plays).toBe(1);
  expect(output.calls).toEqual(['banner:Dark Barracks đã xong', 'banner:Workshop đã xong']);
  release(true);
  await flush();
  await vi.advanceTimersByTimeAsync(6000);
  expect(plays).toBe(2);
});

test('pasting again does not alert twice', async () => {
  const output = fakeOutput();
  const root = await pasted((T + 54757) * 1000, { output, settings: on({ banner: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  click(root, 'button[data-action="paste"]');
  await flush();
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:Workshop đã xong']);
});

test('a sound that fails shows a notice, the next success clears it', async () => {
  const results = [false, true];
  const output = fakeOutput({ play: async () => results.shift()! });
  const root = await pasted((T + 98) * 1000, { output, settings: on({ ting: true }), clip: staggered });
  await vi.advanceTimersByTimeAsync(3000);
  expect(notice(root, 'sound-failed')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(3000);
  expect(notice(root, 'sound-failed')).toBeNull();
});

test('a failed ting stays reported even when the voice plays', async () => {
  const output = fakeOutput({ play: async (sound) => sound === 'voice-vi' });
  const root = await pasted((T + 98) * 1000, { output, settings: on({ ting: true, voice: true }), clip: async () => oneJob });
  await vi.advanceTimersByTimeAsync(3000);
  expect(notice(root, 'sound-failed')).not.toBeNull();
});

test('a hung banner does not block the sounds', async () => {
  const output = fakeOutput({ showBanner: () => new Promise(() => {}) });
  await pasted((T + 98) * 1000, { output, settings: on({ banner: true, ting: true }), clip: async () => oneJob });
  await vi.advanceTimersByTimeAsync(3000);
  expect(output.calls).toContain('ting');
});

test('settings are saved and restored', async () => {
  const root = await setup(T * 1000);
  click(root, 'input[name="alert-voice"]');
  await flush();
  expect((await loadSettings(store)).voice).toBe(true);
  unmount!();
  const again = await setup(T * 1000);
  expect(input(again, 'alert-voice').checked).toBe(true);
});

test('rapid clicks keep the last state', async () => {
  const root = await setup(T * 1000);
  for (let i = 0; i < 3; i += 1) click(root, 'input[name="alert-ting"]');
  await flush();
  expect((await loadSettings(store)).ting).toBe(true);
});

test('refused permission turns the switch back off', async () => {
  const output = fakeOutput({ bannerPermission: () => 'default', requestBannerPermission: async () => 'denied' });
  const root = await setup(T * 1000, { output });
  click(root, 'input[name="alert-banner"]');
  await flush();
  expect(input(root, 'alert-banner').checked).toBe(false);
  expect(input(root, 'alert-banner').disabled).toBe(false);
  expect((await loadSettings(store)).banner).toBe(false);
  expect(notice(root, 'banner-denied')).not.toBeNull();
});

test('unsupported notifications never ask', async () => {
  const request = vi.fn(async () => 'granted' as const);
  const output = fakeOutput({ bannerPermission: () => 'unsupported', requestBannerPermission: request });
  const root = await setup(T * 1000, { output });
  click(root, 'input[name="alert-banner"]');
  await flush();
  expect(request).not.toHaveBeenCalled();
  expect(notice(root, 'banner-denied')).not.toBeNull();
});

test('granted permission turns the switch on', async () => {
  const output = fakeOutput({ bannerPermission: () => 'default', requestBannerPermission: async () => 'granted' });
  const root = await setup(T * 1000, { output });
  click(root, 'input[name="alert-banner"]');
  await flush();
  expect(input(root, 'alert-banner').checked).toBe(true);
  expect((await loadSettings(store)).banner).toBe(true);
});

test('already granted permission turns the switch on without asking', async () => {
  const request = vi.fn(async () => 'granted' as const);
  const root = await setup(T * 1000, { output: fakeOutput({ requestBannerPermission: request }) });
  click(root, 'input[name="alert-banner"]');
  await flush();
  expect(request).not.toHaveBeenCalled();
  expect((await loadSettings(store)).banner).toBe(true);
});

test('the banner switch is locked while the prompt is open, and the denied notice clears on the next change', async () => {
  let answer!: (p: 'denied') => void;
  const output = fakeOutput({
    bannerPermission: () => 'default',
    requestBannerPermission: () => new Promise((r) => { answer = r; }),
  });
  const root = await setup(T * 1000, { output });
  click(root, 'input[name="alert-banner"]');
  expect(input(root, 'alert-banner').disabled).toBe(true);
  answer('denied');
  await flush();
  expect(input(root, 'alert-banner').disabled).toBe(false);
  expect(notice(root, 'banner-denied')).not.toBeNull();
  click(root, 'input[name="alert-ting"]');
  expect(notice(root, 'banner-denied')).toBeNull();
});

test('permission revoked since last time shows as off', async () => {
  const output = fakeOutput({ bannerPermission: () => 'denied' });
  const root = await setup(T * 1000, { output, settings: on({ banner: true }) });
  expect(input(root, 'alert-banner').checked).toBe(false);
});

test('a failed settings save shows the storage notice', async () => {
  const root = await setup(T * 1000, { store: memoryStore({}, { failWrites: true }) });
  click(root, 'input[name="alert-ting"]');
  await flush();
  expect(notice(root, 'storage')).not.toBeNull();
  expect(input(root, 'alert-ting').checked).toBe(true);
});

test('all-finished notice ignores helpers', async () => {
  const clip = async () => JSON.stringify({
    tag: '#TEST123', timestamp: T, buildings: [{ data: 1000026, lvl: 1, timer: 100 }],
    helpers: [{ data: 93000000, lvl: 1, helper_cooldown: 5000 }],
  });
  const root = await pasted((T + 500) * 1000, { clip });
  expect(notice(root, 'all-finished')).not.toBeNull();
});

test('all-finished appears when the last job ends', async () => {
  const root = await pasted((T + 98) * 1000, { clip: async () => oneJob });
  expect(notice(root, 'all-finished')).toBeNull();
  await vi.advanceTimersByTimeAsync(3000);
  expect(notice(root, 'all-finished')).not.toBeNull();
});

test('needs-tap shows until the user touches the app', async () => {
  let active = false;
  const output = fakeOutput({ hasUserActivation: () => active });
  const root = await setup(T * 1000, { output, settings: on({ voice: true }) });
  expect(notice(root, 'needs-tap')).not.toBeNull();
  active = true;
  document.dispatchEvent(new Event('click'));
  expect(notice(root, 'needs-tap')).toBeNull();
});

test('needs-tap stays during a press and clears on the click that follows', async () => {
  let active = false;
  const output = fakeOutput({ hasUserActivation: () => active });
  const root = await setup(T * 1000, { output, settings: on({ vibrate: true }) });
  // Activation arrives at pointerup on touch. The notice must stay until the click: removing it
  // earlier would shift the layout under the finger before the click lands.
  active = true;
  document.dispatchEvent(new Event('pointerdown'));
  document.dispatchEvent(new Event('pointerup'));
  expect(notice(root, 'needs-tap')).not.toBeNull();
  document.dispatchEvent(new Event('click'));
  expect(notice(root, 'needs-tap')).toBeNull();
});

test('clearing needs-tap keeps the buttons in place', async () => {
  let active = false;
  let clip = sample;
  const output = fakeOutput({ hasUserActivation: () => active });
  const root = await pasted((T + 807) * 1000, { output, settings: on({ ting: true }), clip: async () => clip });
  clip = JSON.stringify({ tag: '#OTHER1', timestamp: T, buildings: [{ data: 1000026, lvl: 1, timer: 5000 }] });
  click(root, 'button[data-action="paste"]');
  await flush();
  const tab = root.querySelector('button[data-tag]')!;
  expect(notice(root, 'needs-tap')).not.toBeNull();
  active = true;
  document.dispatchEvent(new Event('click'));
  expect(notice(root, 'needs-tap')).toBeNull();
  expect(tab.isConnected).toBe(true);
});

test('no needs-tap when only the banner is on', async () => {
  const output = fakeOutput({ hasUserActivation: () => false });
  const root = await setup(T * 1000, { output, settings: on({ banner: true }) });
  expect(notice(root, 'needs-tap')).toBeNull();
});

test('the test button fires the enabled kinds', async () => {
  const output = fakeOutput();
  const root = await setup(T * 1000, { output, settings: on({ ting: true }) });
  click(root, 'button[data-action="test-alert"]');
  await flush();
  expect(output.calls).toEqual(['ting']);
});

test('the test button does nothing when all are off', async () => {
  const output = fakeOutput();
  const root = await setup(T * 1000, { output });
  click(root, 'button[data-action="test-alert"]');
  await flush();
  expect(output.calls).toEqual([]);
});

test('the footer credits both voices', async () => {
  const root = await setup(T * 1000);
  expect(root.querySelector('footer a[href="licenses/vais1000-voice.txt"]')).not.toBeNull();
  expect(root.querySelector('footer a[href="licenses/lj-speech-voice.txt"]')).not.toBeNull();
});

test('the voice follows the language', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, deviceLanguage: 'en', settings: on({ voice: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['voice-en']);
});

test('nothing fires after unmount', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, settings: all });
  unmount!();
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual([]);
});

const VIETNAMESE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i;

test('english mode shows no Vietnamese, pasted data included', async () => {
  const root = await pasted((T + 807) * 1000, { deviceLanguage: 'en' });
  expect(root.querySelector('[data-view="main"]')!.textContent).not.toMatch(VIETNAMESE);
  expect(document.documentElement.lang).toBe('en');
  expect(row(root, 'Workshop').querySelector('.job-detail')!.textContent).toBe('Level 6 → 7');
});

test('a saved language wins over the device', async () => {
  const root = await setup(T * 1000, { deviceLanguage: 'en', settings: { ...DEFAULT_SETTINGS, language: 'vi' } });
  expect(root.textContent).toContain('Dữ liệu chỉ lưu trên máy này');
  expect(document.documentElement.lang).toBe('vi');
});

test('a finished job alerts in the current language', async () => {
  const output = fakeOutput();
  await pasted((T + 54757) * 1000, { output, deviceLanguage: 'en', settings: on({ banner: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  expect(output.calls).toEqual(['banner:Workshop finished']);
});

const screen = (root: HTMLElement) => root.querySelector('[data-view]:not([hidden])')!.getAttribute('data-view');
const openSettings = (root: HTMLElement) => click(root, 'button[data-action="settings"]');
const input2 = (root: HTMLElement, value: string) =>
  root.querySelector(`input[name="language"][value="${value}"]`) as HTMLInputElement;

test('settings opens and closes with its buttons, and focus follows', async () => {
  const root = await setup(T * 1000);
  expect(screen(root)).toBe('main');
  openSettings(root);
  expect(screen(root)).toBe('settings');
  expect(document.activeElement).toBe(root.querySelector('button[data-action="back"]'));
  click(root, 'button[data-action="back"]');
  expect(screen(root)).toBe('main');
  expect(document.activeElement).toBe(root.querySelector('button[data-action="settings"]'));
});

test('opening settings adds one history entry and the back button removes it', async () => {
  const root = await setup(T * 1000);
  const push = vi.spyOn(history, 'pushState');
  openSettings(root);
  expect(push).toHaveBeenCalledWith({ view: 'settings' }, '');
  expect(historyBack).not.toHaveBeenCalled();
  click(root, 'button[data-action="back"]');
  expect(historyBack).toHaveBeenCalledOnce();
  push.mockRestore();
});

test('the system back button closes settings without touching history again', async () => {
  const root = await setup(T * 1000);
  openSettings(root);
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(screen(root)).toBe('main');
  expect(historyBack).not.toHaveBeenCalled();
});

test('the popstate after the in-app back button changes nothing', async () => {
  const root = await setup(T * 1000);
  openSettings(root);
  click(root, 'button[data-action="back"]');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(screen(root)).toBe('main');
  openSettings(root);
  expect(screen(root)).toBe('settings');
});

test('reloading inside settings starts on the main screen', async () => {
  history.replaceState({ view: 'settings' }, '');
  const root = await setup(T * 1000);
  expect(screen(root)).toBe('main');
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(screen(root)).toBe('main');
  history.replaceState(null, '');
});

test('picking a language applies at once and is saved', async () => {
  const root = await pasted((T + 807) * 1000);
  click(root, 'input[name="language"][value="en"]');
  expect(root.querySelector('[data-view="main"]')!.textContent).not.toMatch(VIETNAMESE);
  expect(document.documentElement.lang).toBe('en');
  await flush();
  expect((await loadSettings(store)).language).toBe('en');
});

test('a language change reaches every attribute and every built-once text', async () => {
  const root = await setup(T * 1000);
  const attr = (selector: string, name: string) => root.querySelector(selector)!.getAttribute(name);
  expect(attr('button[data-action="settings"]', 'aria-label')).toBe('Cài đặt');
  click(root, 'input[name="language"][value="en"]');
  expect(attr('button[data-action="settings"]', 'aria-label')).toBe('Settings');
  expect(attr('button[data-action="back"]', 'aria-label')).toBe('Back');
  expect(attr('textarea[name="export"]', 'placeholder')).toBe('Or paste the data here');
  expect(attr('textarea[name="export"]', 'aria-label')).toBe('Or paste the data here');
  expect(root.querySelector('button[data-action="paste"]')!.textContent).toBe('Paste data');
  expect(root.querySelector('footer')!.textContent).toContain('Data stays on this device');
  expect(root.querySelector('footer')!.textContent).toContain('English voice');
  expect(root.querySelector('footer')!.textContent).not.toMatch(VIETNAMESE);
  expect(root.querySelector('[data-view="settings"] h2')!.textContent).toBe('Language');
  click(root, 'input[name="language"][value="vi"]');
  expect(attr('button[data-action="settings"]', 'aria-label')).toBe('Cài đặt');
  expect(attr('textarea[name="export"]', 'placeholder')).toBe('Hoặc dán dữ liệu vào đây');
  expect(root.querySelector('button[data-action="paste"]')!.textContent).toBe('Dán dữ liệu');
});

test('the language follows the device until one is picked', async () => {
  const root = await setup(T * 1000, { deviceLanguage: 'en' });
  expect(input2(root, 'en').checked).toBe(true);
  expect(input2(root, 'vi').checked).toBe(false);
  await flush();
  expect((await loadSettings(store)).language).toBeNull();
});

test('a language change during the ting leaves that alert in its own language', async () => {
  let release!: (ok: boolean) => void;
  const played: string[] = [];
  const output = fakeOutput({ play: (sound) => {
    played.push(sound);
    return sound === 'ting' ? new Promise((r) => { release = r; }) : Promise.resolve(true);
  } });
  const root = await pasted((T + 54757) * 1000, { output, settings: on({ ting: true, voice: true }) });
  await vi.advanceTimersByTimeAsync(5000);
  click(root, 'input[name="language"][value="en"]');
  release(true);
  await flush();
  expect(played).toEqual(['ting', 'voice-vi']);
});

test('a refused permission shows its notice on the settings screen', async () => {
  const output = fakeOutput({ bannerPermission: () => 'default', requestBannerPermission: async () => 'denied' });
  const root = await setup(T * 1000, { output });
  openSettings(root);
  click(root, 'input[name="alert-banner"]');
  await flush();
  expect(root.querySelector('[data-view="settings"] [data-notice="banner-denied"]')).not.toBeNull();
  expect(root.querySelectorAll('[data-notice="banner-denied"]')).toHaveLength(1);
});

test('a sound failure on the test button shows on the settings screen', async () => {
  const output = fakeOutput({ play: async () => false });
  const root = await setup(T * 1000, { output, settings: on({ ting: true }) });
  openSettings(root);
  click(root, 'button[data-action="test-alert"]');
  await flush();
  expect(root.querySelector('[data-view="settings"] [data-notice="sound-failed"]')).not.toBeNull();
});

test('alert notices move back to the main screen', async () => {
  const output = fakeOutput({ play: async () => false });
  const root = await setup(T * 1000, { output, settings: on({ ting: true }) });
  openSettings(root);
  click(root, 'button[data-action="test-alert"]');
  await flush();
  click(root, 'button[data-action="back"]');
  expect(root.querySelector('[data-view="main"] [data-notice="sound-failed"]')).not.toBeNull();
  expect(root.querySelectorAll('[data-notice="sound-failed"]')).toHaveLength(1);
});

test('a failed language save warns and still applies', async () => {
  const root = await setup(T * 1000, { store: memoryStore({}, { failWrites: true }) });
  click(root, 'input[name="language"][value="en"]');
  await flush();
  expect(notice(root, 'storage')).not.toBeNull();
  expect(document.documentElement.lang).toBe('en');
});

test('delete sits on the settings screen, only with an account', async () => {
  const root = await setup((T + 807) * 1000);
  expect(root.querySelector('button[data-action="delete"]')).toBeNull();
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-view="settings"] button[data-action="delete"]')).not.toBeNull();
  expect(root.querySelector('[data-view="main"] button[data-action="delete"]')).toBeNull();
});

test('deleting returns to the main screen and closes the history entry', async () => {
  const root = await pasted((T + 807) * 1000);
  openSettings(root);
  click(root, 'button[data-action="delete"]');
  expect(screen(root)).toBe('main');
  expect(rows(root)).toHaveLength(0);
  expect(historyBack).toHaveBeenCalledOnce();
});

test('choosing the language that is already shown still saves it', async () => {
  const root = await setup(T * 1000, { deviceLanguage: 'en' });
  click(root, 'input[name="language"][value="en"]');
  await flush();
  expect((await loadSettings(store)).language).toBe('en');
});

test('needs-tap on the settings screen clears on the next click', async () => {
  let active = false;
  const output = fakeOutput({ hasUserActivation: () => active });
  const root = await setup(T * 1000, { output, settings: on({ ting: true }) });
  openSettings(root);
  expect(root.querySelector('[data-view="settings"] [data-notice="needs-tap"]')).not.toBeNull();
  expect(root.querySelectorAll('[data-notice="needs-tap"]')).toHaveLength(1);
  active = true;
  document.dispatchEvent(new Event('click'));
  expect(notice(root, 'needs-tap')).toBeNull();
});

const pasteButtons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('button[data-action="paste"]')];
const pasteBox = (root: HTMLElement) => root.querySelector('textarea[name="export"]') as HTMLTextAreaElement;
const nextWhat = (root: HTMLElement) => root.querySelector('[data-role="next"] .what')?.textContent;
const nextCount = (root: HTMLElement) => root.querySelector('[data-role="next"] .next-count')!.textContent;
const account = (tag: string, buildings: unknown[], extra: object = {}) =>
  JSON.stringify({ tag, timestamp: T, buildings, ...extra });

test('one big paste button before any data', async () => {
  const root = await setup(T * 1000);
  const [button] = pasteButtons(root);
  expect(pasteButtons(root)).toHaveLength(1);
  expect(button.closest('.controls')).not.toBeNull();
  expect(button.textContent).toBe('Dán dữ liệu');
  expect(button.classList.contains('primary')).toBe(true);
});

test('a small paste button beside the data age', async () => {
  const root = await pasted((T + 807) * 1000);
  const [button] = pasteButtons(root);
  expect(pasteButtons(root)).toHaveLength(1);
  expect(button.closest('.account')).not.toBeNull();
  expect(button.textContent).toBe('Dán mới');
  expect(button.querySelector('svg')).not.toBeNull();
  expect(button.classList.contains('primary')).toBe(false);
});

test('a big paste button when everything finished', async () => {
  const root = await pasted((T + 98) * 1000, { clip: async () => oneJob });
  await vi.advanceTimersByTimeAsync(3000);
  const [button] = pasteButtons(root);
  expect(pasteButtons(root)).toHaveLength(1);
  expect(button.closest('[data-notice="all-finished"]')).not.toBeNull();
  expect(button.textContent).toBe('Dán dữ liệu mới');
  expect(button.classList.contains('primary')).toBe(true);
});

test('the paste button keeps keyboard focus when it moves', async () => {
  const root = await setup((T + 807) * 1000);
  pasteButtons(root)[0].focus();
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(pasteButtons(root)[0].closest('.account')).not.toBeNull();
  expect(document.activeElement).toBe(pasteButtons(root)[0]);
});

test('the paste box shows only when needed', async () => {
  const root = await setup((T + 807) * 1000);
  expect(pasteBox(root).hidden).toBe(false);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(pasteBox(root).hidden).toBe(true);
  expect(root.querySelector('.controls')!.hasAttribute('hidden')).toBe(true);
  const failing = async () => { throw new Error('denied'); };
  unmount!();
  const again = await setup((T + 807) * 1000, { clip: failing });
  click(again, 'button[data-action="paste"]');
  await flush();
  expect(pasteBox(again).hidden).toBe(false);
  expect(again.querySelector('.controls')!.hasAttribute('hidden')).toBe(false);
  pasteBox(again).value = sample;
  pasteBox(again).dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
  expect(pasteBox(again).hidden).toBe(true);
});

test('the next card picks the soonest job and ticks', async () => {
  const root = await pasted((T + 807) * 1000);
  const soonest = Number((row(root, 'Baby Dragon') as HTMLElement).dataset.endsAt);
  expect(nextWhat(root)).toContain('Baby Dragon');
  expect(nextCount(root)).toBe(formatCountdown(soonest - (T + 807), 'vi'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(nextCount(root)).toBe(formatCountdown(soonest - (T + 808), 'vi'));
});

test('the next card skips helpers', async () => {
  const clip = async () => account('#TEST123', [{ data: 1000026, lvl: 1, timer: 5000 }],
    { helpers: [{ data: 93000000, lvl: 1, helper_cooldown: 100 }] });
  const root = await pasted((T + 10) * 1000, { clip });
  expect(nextWhat(root)).toContain('Dark Barracks');
});

test('the next card moves on when a job finishes', async () => {
  const root = await pasted((T + 98) * 1000, { clip: staggered });
  expect(nextWhat(root)).toContain('Dark Barracks');
  await vi.advanceTimersByTimeAsync(3000);
  expect(nextWhat(root)).toContain('Workshop');
});

test('the next card follows the account tabs', async () => {
  let clip = account('#TEST123', [{ data: 1000026, lvl: 1, timer: 5000 }]);
  const root = await setup((T + 10) * 1000, { clip: async () => clip });
  click(root, 'button[data-action="paste"]');
  await flush();
  clip = account('#OTHER1', [{ data: 1000059, lvl: 1, timer: 9000 }]);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(nextWhat(root)).toContain('Workshop');
  click(root, 'button[data-tag="#TEST123"]');
  expect(nextWhat(root)).toContain('Dark Barracks');
});

test.each([
  ['only helpers', account('#TEST123', [], { helpers: [{ data: 93000000, lvl: 1, helper_cooldown: 5000 }] })],
  ['no jobs', account('#TEST123', [])],
])('no next card with %s', async (_name, clip) => {
  const root = await pasted((T + 10) * 1000, { clip: async () => clip });
  expect(root.querySelector('[data-role="next"]')).toBeNull();
  expect(notice(root, 'all-finished')).toBeNull();
});

test('the nudge shows after the first paste with alerts off', async () => {
  const root = await pasted((T + 807) * 1000);
  expect(root.querySelector('[data-role="alerts-nudge"]')).not.toBeNull();
});

test('the nudge opens settings and goes away', async () => {
  const root = await pasted((T + 807) * 1000);
  click(root, 'button[data-action="open-alerts"]');
  expect(screen(root)).toBe('settings');
  click(root, 'button[data-action="back"]');
  expect(root.querySelector('[data-role="alerts-nudge"]')).toBeNull();
});

test('no nudge once an alert is on, or on the second paste, or after reopening', async () => {
  const withAlert = await pasted((T + 807) * 1000, { settings: on({ voice: true }) });
  expect(withAlert.querySelector('[data-role="alerts-nudge"]')).toBeNull();
  unmount!();
  store = memoryStore();
  const root = await pasted((T + 807) * 1000);
  expect(root.querySelector('[data-role="alerts-nudge"]')).not.toBeNull();
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-role="alerts-nudge"]')).not.toBeNull();
  unmount!();
  const reopened = await setup((T + 900) * 1000);
  expect(reopened.querySelector('[data-role="alerts-nudge"]')).toBeNull();
});

test('the nudge does not come back on a second paste after it was dismissed', async () => {
  const root = await pasted((T + 807) * 1000);
  openSettings(root);
  click(root, 'button[data-action="back"]');
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-role="alerts-nudge"]')).toBeNull();
});

test('deleting the last account returns to the first screen', async () => {
  const root = await pasted((T + 807) * 1000);
  openSettings(root);
  click(root, 'button[data-action="delete"]');
  expect(root.querySelector('[data-role="help"]')).not.toBeNull();
  expect(pasteButtons(root)).toHaveLength(1);
  expect(pasteButtons(root)[0].classList.contains('primary')).toBe(true);
  expect(pasteBox(root).hidden).toBe(false);
  expect(root.querySelector('[data-role="alerts-nudge"]')).toBeNull();
});

test('the account line drops the tag with two accounts', async () => {
  let clip = sample;
  const root = await setup((T + 807) * 1000, { clip: async () => clip });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('.account span')!.textContent).toContain('#TEST123');
  clip = account('#OTHER1', [{ data: 1000026, lvl: 1, timer: 5000 }]);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('.account span')!.textContent).not.toContain('#OTHER1');
  expect(root.querySelector('.account span')!.textContent).not.toContain('#TEST123');
});

test('group counts', async () => {
  const root = await pasted((T + 807) * 1000);
  expect(root.querySelector('.group-count')!.textContent).toBe('6');
  expect(root.querySelector('h2')!.textContent).toBe('Làng chính · Công trình');
});

test('the export time is in place', async () => {
  const root = await pasted((T + 807) * 1000);
  expect(root.querySelector('.export-at')!.textContent).toContain('lúc ');
  await vi.advanceTimersByTimeAsync(1000);
  expect(root.querySelector('.export-at')!.textContent).toContain('lúc ');
});

test('the account line is in English too', async () => {
  const root = await pasted((T + 807) * 1000, { deviceLanguage: 'en' });
  expect(root.querySelector('.account span')!.textContent).toContain('Exported 13m ago');
  expect(root.querySelector('.export-at')!.textContent).toContain('at ');
});
