import './ui/style.css';
import { mountApp } from './ui/app';

mountApp(document.getElementById('app')!, {
  storage: localStorage,
  now: Date.now,
  readClipboard: () => navigator.clipboard.readText(),
});
