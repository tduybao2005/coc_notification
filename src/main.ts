import { registerSW } from 'virtual:pwa-register';
import './ui/style.css';
import { loadState } from './core/store';
import { openStore } from './platform/indexeddb-store';
import { mountApp } from './ui/app';

const store = await openStore();
const loaded = await loadState(store, () => localStorage);

mountApp(document.getElementById('app')!, {
  store,
  loaded,
  now: Date.now,
  readClipboard: () => navigator.clipboard.readText(),
});

registerSW({ immediate: true });
