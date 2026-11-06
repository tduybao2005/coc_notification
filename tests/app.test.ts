// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { STORAGE_KEY, loadState, type KeyValueStore } from '../src/core/store';
import type { Language } from '../src/core/language';
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

beforeEach(() => { vi.useFakeTimers(); store = memoryStore(); });
afterEach(() => { unmount?.(); vi.useRealTimers(); });

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
const summary = (root: HTMLElement) => root.querySelector('details[data-role="alerts"] summary')!.textContent!;

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
  expect(summary(root)).toContain('Đang tắt');
});

test('a failed settings save shows the storage notice', async () => {
  const root = await setup(T * 1000, { store: memoryStore({}, { failWrites: true }) });
  click(root, 'input[name="alert-ting"]');
  await flush();
  expect(notice(root, 'storage')).not.toBeNull();
  expect(input(root, 'alert-ting').checked).toBe(true);
});

test('the summary follows the switches', async () => {
  const root = await setup(T * 1000);
  expect(summary(root)).toContain('Đang tắt');
  click(root, 'input[name="alert-ting"]');
  expect(summary(root)).toContain('Đang bật');
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

test('details opens after the first paste only', async () => {
  let clip = sample;
  const root = await setup((T + 807) * 1000, { clip: async () => clip });
  const details = root.querySelector('details[data-role="alerts"]') as HTMLDetailsElement;
  expect(details.open).toBe(false);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(details.open).toBe(true);
  details.open = false;
  clip = JSON.stringify({ tag: '#OTHER1', timestamp: T, buildings: [] });
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(details.open).toBe(false);
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
  expect(root.textContent).not.toMatch(VIETNAMESE);
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
