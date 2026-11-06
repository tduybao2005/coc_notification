import type { Language } from '../core/language';
import type { AlertSettings } from '../core/settings';
import { copy, languageNames } from './copy';
import { el } from './dom';
import { icon } from './icons';

export type AlertKey = keyof AlertSettings;
export interface SettingsHandlers {
  onToggle(key: AlertKey, on: boolean): void;
  onLanguage(lang: Language): void;
  onTest(): void;
  onDelete(): void;
  onBack(): void;
}
export interface SettingsView {
  element: HTMLElement;
  // Where the app puts the alert notices while this screen is open.
  notices: HTMLElement;
  update(view: { settings: AlertSettings; lang: Language; accountTag: string | null }): void;
  // Disables the banner switch while the permission prompt is pending.
  lockBanner(locked: boolean): void;
  focusBack(): void;
}

const KEYS: AlertKey[] = ['voice', 'ting', 'vibrate', 'banner'];
const LANGUAGES: Language[] = ['vi', 'en'];

export function createSettingsView(handlers: SettingsHandlers): SettingsView {
  const element = el('div', { 'data-view': 'settings' });

  const back = el('button', { type: 'button', 'data-action': 'back' });
  back.append(icon('back'));
  back.addEventListener('click', () => handlers.onBack());
  const title = el('h1');
  const header = el('div', { class: 'app-bar' });
  header.append(back, title);

  const notices = el('div', { class: 'notices stack' });

  const languageTitle = el('h2');
  const languageInputs = {} as Record<Language, HTMLInputElement>;
  const languageGroup = el('div', { class: 'choices', role: 'radiogroup' });
  for (const lang of LANGUAGES) {
    const input = el('input', { type: 'radio', name: 'language', value: lang });
    // click, not change: choosing the language that is already shown (the device's) must still pin it.
    input.addEventListener('click', () => handlers.onLanguage(lang));
    languageInputs[lang] = input;
    const label = el('label', { class: 'choice' });
    label.append(input, el('span', {}, languageNames[lang]));
    languageGroup.append(label);
  }

  const alertsTitle = el('h2');
  const switchLabels = {} as Record<AlertKey, HTMLSpanElement>;
  const inputs = {} as Record<AlertKey, HTMLInputElement>;
  const alertsGroup = el('div', { class: 'switches' });
  for (const key of KEYS) {
    const input = el('input', { type: 'checkbox', name: `alert-${key}` });
    input.addEventListener('change', () => handlers.onToggle(key, input.checked));
    inputs[key] = input;
    switchLabels[key] = el('span');
    const label = el('label', { class: 'switch' });
    label.append(input, switchLabels[key]);
    alertsGroup.append(label);
  }
  const test = el('button', { type: 'button', 'data-action': 'test-alert' });
  test.addEventListener('click', () => handlers.onTest());
  const limit = el('p', { 'data-role': 'alerts-limit', class: 'hint' });

  // The account section exists only while there is an account; it names the one that Delete removes.
  const accountTitle = el('h2');
  const remove = el('button', { type: 'button', 'data-action': 'delete', class: 'danger' });
  remove.addEventListener('click', () => handlers.onDelete());
  const accountTag = el('span', { 'data-role': 'account-tag' });
  const accountRow = el('div', { class: 'account-row' });
  accountRow.append(accountTag, remove);
  const account = el('section');
  account.append(accountTitle, accountRow);

  const languageSection = el('section');
  languageSection.append(languageTitle, languageGroup);
  const alertsSection = el('section');
  alertsSection.append(alertsTitle, alertsGroup, test, limit);
  element.append(header, notices, languageSection, alertsSection);

  return {
    element,
    notices,
    update({ settings, lang, accountTag: tag }) {
      const text = copy[lang];
      back.setAttribute('aria-label', text.settings.back);
      title.textContent = text.settings.title;
      languageTitle.textContent = text.settings.language;
      languageGroup.setAttribute('aria-label', text.settings.language);
      for (const code of LANGUAGES) languageInputs[code].checked = code === lang;
      alertsTitle.textContent = text.settings.alerts;
      for (const key of KEYS) {
        inputs[key].checked = settings[key];
        switchLabels[key].textContent = text.alerts[key];
      }
      test.textContent = text.alerts.test;
      limit.textContent = text.alerts.limit;
      accountTitle.textContent = text.settings.account;
      remove.textContent = text.delete;
      accountTag.textContent = tag;
      if (tag !== null) element.append(account);
      else account.remove();
    },
    lockBanner(locked) { inputs.banner.disabled = locked; },
    focusBack() { back.focus(); },
  };
}
