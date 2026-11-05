import { registerSW } from 'virtual:pwa-register';
import './ui/style.css';
import { openStorage } from './core/store';
import { mountApp } from './ui/app';

mountApp(document.getElementById('app')!, {
  storage: openStorage(() => localStorage),
  now: Date.now,
  readClipboard: () => navigator.clipboard.readText(),
});

registerSW({ immediate: true });
