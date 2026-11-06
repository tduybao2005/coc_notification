import { registerSW } from 'virtual:pwa-register';
import './ui/style.css';
import { deviceLanguage } from './core/language';
import { loadSettings } from './core/settings';
import { loadState } from './core/store';
import { browserAlertOutput } from './platform/alert-output';
import { openStore } from './platform/indexeddb-store';
import { mountApp } from './ui/app';

const store = await openStore();
const loaded = await loadState(store, () => localStorage);
const settings = await loadSettings(store);

mountApp(document.getElementById('app')!, {
  store,
  loaded,
  settings,
  deviceLanguage: deviceLanguage(navigator.language),
  output: browserAlertOutput(import.meta.env.BASE_URL),
  now: Date.now,
  readClipboard: () => navigator.clipboard.readText(),
});

registerSW({ immediate: true });
