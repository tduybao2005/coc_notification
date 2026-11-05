// @vitest-environment jsdom
import { browserAlertOutput } from '../src/platform/alert-output';

const BASE = '/coc_notification/';

class FakeAudio extends EventTarget {
  currentTime = 5;
  preload = '';
  play = vi.fn(async () => {});
  pause = vi.fn();
  constructor(readonly src: string) { super(); }
}

function setup() {
  const made: FakeAudio[] = [];
  const output = browserAlertOutput(BASE, (src) => {
    const audio = new FakeAudio(src);
    made.push(audio);
    return audio as unknown as HTMLAudioElement;
  });
  return { output, made, voice: () => made.find((a) => a.src.endsWith('voice.wav'))! };
}

const define = (name: string, value: unknown) =>
  Object.defineProperty(navigator, name, { value, configurable: true, writable: true });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const name of ['vibrate', 'userActivation', 'serviceWorker']) Reflect.deleteProperty(navigator, name);
});

test('plays the right file under the base path', async () => {
  const { output, made, voice } = setup();
  expect(made.map((a) => a.src).sort()).toEqual(['/coc_notification/sounds/ting.wav', '/coc_notification/sounds/voice.wav']);
  expect(made.every((a) => a.preload === 'auto')).toBe(true);
  const done = output.play('voice');
  await vi.advanceTimersByTimeAsync(0);
  expect(voice().play).toHaveBeenCalledOnce();
  expect(voice().currentTime).toBe(0);
  voice().dispatchEvent(new Event('ended'));
  await done;
});

test('play resolves true when the sound ends', async () => {
  const { output, voice } = setup();
  const done = output.play('voice');
  await vi.advanceTimersByTimeAsync(0);
  voice().dispatchEvent(new Event('ended'));
  expect(await done).toBe(true);
});

test('a blocked sound resolves false', async () => {
  const { output, voice } = setup();
  voice().play.mockRejectedValue(new Error('NotAllowedError'));
  expect(await output.play('voice')).toBe(false);
});

test('a load error resolves false', async () => {
  const { output, voice } = setup();
  const done = output.play('voice');
  await vi.advanceTimersByTimeAsync(0);
  voice().dispatchEvent(new Event('error'));
  expect(await done).toBe(false);
});

test('a sound that never ends gives up after 10 seconds', async () => {
  const { output } = setup();
  let result: boolean | undefined;
  void output.play('voice').then((r) => { result = r; });
  await vi.advanceTimersByTimeAsync(9999);
  expect(result).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(result).toBe(false);
});

test('vibrate returns false without the API', () => {
  define('vibrate', undefined);
  expect(setup().output.vibrate()).toBe(false);
});

test('vibrate uses the double pulse pattern', () => {
  const vibrate = vi.fn(() => true);
  define('vibrate', vibrate);
  expect(setup().output.vibrate()).toBe(true);
  expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
});

test('permission is unsupported without Notification', async () => {
  const { output } = setup();
  expect(output.bannerPermission()).toBe('unsupported');
  expect(await output.requestBannerPermission()).toBe('unsupported');
});

test('user activation counts as true without the API', () => {
  define('userActivation', undefined);
  expect(setup().output.hasUserActivation()).toBe(true);
});

test('user activation reflects the browser flag', () => {
  define('userActivation', { hasBeenActive: false });
  expect(setup().output.hasUserActivation()).toBe(false);
});

test('showBanner returns false without a registration', async () => {
  vi.stubGlobal('Notification', { permission: 'granted' });
  define('serviceWorker', { getRegistration: async () => undefined });
  expect(await setup().output.showBanner({ title: 'T', body: 'B' })).toBe(false);
});

test('showBanner returns false without permission', async () => {
  vi.stubGlobal('Notification', { permission: 'denied' });
  const showNotification = vi.fn(async () => {});
  define('serviceWorker', { getRegistration: async () => ({ showNotification }) });
  expect(await setup().output.showBanner({ title: 'T', body: 'B' })).toBe(false);
  expect(showNotification).not.toHaveBeenCalled();
});

test('showBanner goes through the service worker', async () => {
  vi.stubGlobal('Notification', { permission: 'granted' });
  const showNotification = vi.fn(async () => {});
  define('serviceWorker', { getRegistration: async () => ({ showNotification }) });
  expect(await setup().output.showBanner({ title: 'Workshop đã xong', body: 'Cấp 6 → 7 · #A' })).toBe(true);
  expect(showNotification).toHaveBeenCalledWith('Workshop đã xong', expect.objectContaining({
    body: 'Cấp 6 → 7 · #A',
    icon: '/coc_notification/pwa-192x192.png',
    tag: 'village-timer-finished',
    renotify: true,
  }));
});

test('showBanner returns false instead of throwing when showNotification fails', async () => {
  vi.stubGlobal('Notification', { permission: 'granted' });
  define('serviceWorker', { getRegistration: async () => ({ showNotification: async () => { throw new TypeError('x'); } }) });
  expect(await setup().output.showBanner({ title: 'T', body: 'B' })).toBe(false);
});
