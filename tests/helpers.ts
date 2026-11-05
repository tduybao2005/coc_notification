import type { KeyValueStore } from '../src/core/store';
import type { AlertOutput } from '../src/platform/alert-output';

export function memoryStore(
  initial: Record<string, string> = {},
  options: { failWrites?: boolean; failReads?: boolean } = {},
): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    async get(key) {
      if (options.failReads) throw new Error('read failed');
      return data.get(key) ?? null;
    },
    async set(key, value) {
      if (options.failWrites) throw new Error('write failed');
      data.set(key, value);
    },
  };
}

// Records what was fired in `calls`: banner:<title>, vibrate, ting, voice. Everything succeeds by default.
export function fakeOutput(overrides: Partial<AlertOutput> = {}): AlertOutput & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play: async (sound) => { calls.push(sound); return true; },
    vibrate: () => { calls.push('vibrate'); return true; },
    showBanner: async (message) => { calls.push(`banner:${message.title}`); return true; },
    bannerPermission: () => 'granted',
    requestBannerPermission: async () => 'granted',
    hasUserActivation: () => true,
    ...overrides,
  };
}
