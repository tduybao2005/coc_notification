import type { KeyValueStore } from '../core/store';

const DB_NAME = 'village-timer';
const STORE_NAME = 'kv';

// Stand-in used when IndexedDB cannot be opened: reads find nothing and writes fail, so the app keeps
// running and shows its storage notice instead of crashing at startup.
const unavailableStore: KeyValueStore = {
  get: async () => null,
  set: () => Promise.reject(new Error('storage unavailable')),
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('open failed'));
    request.onblocked = () => reject(new Error('open blocked'));
  });
}

export async function openStore(): Promise<KeyValueStore> {
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return unavailableStore;
  }
  // Let a newer version of the app upgrade the database instead of being blocked by this tab.
  db.onversionchange = () => db.close();

  return {
    get: (key) => new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error('read failed'));
    }),
    // Resolves only when the transaction is complete, so a resolved write has reached the database.
    set: (key, value) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('write aborted'));
    }),
  };
}
