import type { KeyValueStore } from '../src/core/store';

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
