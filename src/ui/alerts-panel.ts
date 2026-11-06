import type { AlertSettings } from '../core/settings';
import type { Copy } from './copy';
import { el } from './dom';

export type AlertKey = keyof AlertSettings;
export interface AlertsPanelHandlers { onToggle(key: AlertKey, on: boolean): void; onTest(): void }
export interface AlertsPanel {
  element: HTMLDetailsElement;
  update(settings: AlertSettings): void;
  open(): void;
  // Disables the banner switch while the permission prompt is pending.
  lockBanner(locked: boolean): void;
}

const KEYS: AlertKey[] = ['voice', 'ting', 'vibrate', 'banner'];

export function createAlertsPanel(handlers: AlertsPanelHandlers, text: Copy): AlertsPanel {
  const element = el('details', { 'data-role': 'alerts' });
  const summary = el('summary');
  element.append(summary);

  const inputs = {} as Record<AlertKey, HTMLInputElement>;
  for (const key of KEYS) {
    const input = el('input', { type: 'checkbox', name: `alert-${key}` });
    input.addEventListener('change', () => handlers.onToggle(key, input.checked));
    inputs[key] = input;
    const label = el('label', { class: 'switch' });
    label.append(input, el('span', {}, text.alerts[key]));
    element.append(label);
  }

  const test = el('button', { type: 'button', 'data-action': 'test-alert' }, text.alerts.test);
  test.addEventListener('click', () => handlers.onTest());
  element.append(test, el('p', { 'data-role': 'alerts-limit', class: 'hint' }, text.alerts.limit));

  return {
    element,
    update(settings) {
      for (const key of KEYS) inputs[key].checked = settings[key];
      summary.textContent = KEYS.some((key) => settings[key]) ? text.alerts.summaryOn : text.alerts.summaryOff;
    },
    open() { element.open = true; },
    lockBanner(locked) { inputs.banner.disabled = locked; },
  };
}
