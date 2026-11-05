// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { mountApp, type AppDeps } from '../src/ui/app';

const sample = readFileSync('tests/fixtures/export.sample.json', 'utf8');
const T = 1793895122;
const flush = () => vi.advanceTimersByTimeAsync(0);
let unmount: (() => void) | undefined;

function setup(clockMs: number, clip: AppDeps['readClipboard'] = async () => sample, storage = window.localStorage) {
  document.body.innerHTML = '<div id="app"></div>';
  const deps: AppDeps = { storage, now: () => Date.now(), readClipboard: clip };
  vi.setSystemTime(clockMs);
  unmount = mountApp(document.getElementById('app')!, deps);
  return document.getElementById('app')!;
}
const click = (root: HTMLElement, selector: string) => (root.querySelector(selector) as HTMLElement).click();
const rows = (root: HTMLElement) => [...root.querySelectorAll('li[data-ends-at]')];
const row = (root: HTMLElement, name: string) => rows(root).find((r) => r.textContent!.includes(name))!;
const remaining = (r: Element) => r.querySelector('.job-remaining')!.textContent;

beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => { unmount?.(); vi.useRealTimers(); });

test('first visit shows how to export and the legal footer', () => {
  const root = setup(T * 1000);
  expect(root.querySelector('[data-role="help"]')!.textContent).toContain('Data Export');
  expect(root.querySelector('footer')!.textContent).toContain('not endorsed by Supercell');
  expect(root.querySelector('footer')!.textContent).toContain('Dữ liệu chỉ lưu trên máy này');
  expect(root.querySelector('footer a')!.getAttribute('href')).toBe('licenses/clash-of-clans-data.txt');
});

test('pasting shows every job with remaining time and end time', async () => {
  const root = setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('h2')!.textContent).toBe('Làng chính · Công trình');
  const barracks = row(root, 'Dark Barracks');
  expect(barracks.querySelector('.job-detail')!.textContent).toBe('Cấp 12 → 13');
  expect(remaining(barracks)).toBe('4 ngày 15 giờ 1 phút');
  expect(root.textContent).toContain('13 phút trước');
});

test('remaining time ticks every second', async () => {
  const root = setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(remaining(row(root, 'Workshop'))).toBe('14 giờ 59 phút 12 giây');
  await vi.advanceTimersByTimeAsync(1000);
  expect(remaining(row(root, 'Workshop'))).toBe('14 giờ 59 phút 11 giây');
});

test('reopening restores data, and finished jobs stay visible', async () => {
  let root = setup((T + 807) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  unmount!();
  root = setup((T + 30 * 86400) * 1000);
  expect(rows(root)).toHaveLength(13);
  expect(rows(root).every((r) => remaining(r) === 'Đã xong')).toBe(true);
});

test('job moves to the end of its group when it finishes', async () => {
  const root = setup((T + 54750) * 1000);
  click(root, 'button[data-action="paste"]');
  await flush();
  const first = () => root.querySelector('li[data-ends-at] .job-name')!.textContent;
  expect(first()).toContain('Workshop');
  await vi.advanceTimersByTimeAsync(10000);
  expect(first()).not.toContain('Workshop');
});

test('clipboard denied explains and manual paste still works', async () => {
  const root = setup((T + 807) * 1000, async () => { throw new Error('denied'); });
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
  const root = setup((T + 807) * 1000, async () => clip);
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
  const root = setup((T + 900) * 1000, async () => clip);
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
  const root = setup((T + 807) * 1000, async () => clip);
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
  const root = setup((T - 600) * 1000, async () => clip);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(root.querySelector('[data-notice="boost"]')).not.toBeNull();
  expect(root.querySelector('[data-notice="clock"]')).not.toBeNull();
  expect(root.querySelector('[data-role="no-jobs"]')).not.toBeNull();
});

test('failed save warns but still shows the data', async () => {
  const storage = { getItem: () => null, setItem() { throw new Error('quota'); } } as unknown as Storage;
  const root = setup((T + 807) * 1000, async () => sample, storage);
  click(root, 'button[data-action="paste"]');
  await flush();
  expect(rows(root)).toHaveLength(13);
  expect(root.querySelector('[data-notice="storage"]')).not.toBeNull();
});
