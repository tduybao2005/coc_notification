import { alertMessage, allFinished, finishedBetween, type AlertMessage } from '../core/alerts';
import { jobDetailText, jobName } from '../core/names';
import { parseExport } from '../core/parse';
import type { Language } from '../core/language';
import { anyAlertOn, saveSettings, type Settings } from '../core/settings';
import {
  removeVillage, saveState, upsertVillage, type AppState, type KeyValueStore, type LoadResult,
} from '../core/store';
import {
  deviceClockBehind, formatAgo, formatEnd, formatRemaining, groupJobs, remainingSeconds,
} from '../core/time';
import type { Village } from '../core/types';
import type { AlertOutput, Sound } from '../platform/alert-output';
import { createAlertsPanel, type AlertKey } from './alerts-panel';
import { copy, type Copy } from './copy';
import { el } from './dom';

export interface AppDeps {
  store: KeyValueStore;
  loaded: LoadResult;
  settings: Settings;
  deviceLanguage: Language;
  output: AlertOutput;
  now: () => number;
  readClipboard: () => Promise<string>;
}

export function mountApp(root: HTMLElement, deps: AppDeps): () => void {
  let state: AppState = deps.loaded.state;
  // Messages describing the last user action; cleared when the next action starts.
  let errorText: string | null = null;
  let keptNewer = false;
  let stateSaveFailed = false;
  let settingsSaveFailed = false;
  let bannerDenied = false;
  let soundFailed = false;
  let soundPlaying = false;
  // The banner switch only counts as on while the browser still grants permission.
  let settings: Settings = {
    ...deps.settings,
    banner: deps.settings.banner && deps.output.bannerPermission() === 'granted',
  };
  let lastCheckSec = deps.now() / 1000;
  let unreadable = deps.loaded.unreadable;
  let disposed = false;
  let finishedCount = 0;
  let accountLine: HTMLElement | null = null;

  const language = (): Language => settings.language ?? deps.deviceLanguage;
  const text = (): Copy => copy[language()];

  const top = el('div');
  const list = el('div');
  const pasteButton = el('button', { type: 'button', 'data-action': 'paste' }, text().paste);
  const box = el('textarea', {
    name: 'export', rows: '3', placeholder: text().placeholder, 'aria-label': text().placeholder,
    autocomplete: 'off', spellcheck: 'false',
  });
  const controls = el('div', { class: 'controls' });
  controls.append(pasteButton, box);

  const panel = createAlertsPanel({
    onToggle: (key, on) => onToggle(key, on),
    onTest: () => {
      if (anyAlertOn(settings)) {
        void fireAlert({ title: text().alerts.testTitle, body: text().alerts.testBody });
      }
    },
  }, text());
  panel.update(settings);

  const footer = el('footer');
  const credit = el('p');
  const voiceCreditVi = el('p');
  const voiceCreditEn = el('p');
  // Relative hrefs so the links also work when the app is served from a sub-path (GitHub Pages).
  credit.append(el('a', { href: 'licenses/clash-of-clans-data.txt' }, text().credit));
  voiceCreditVi.append(el('a', { href: 'licenses/vais1000-voice.txt' }, text().voiceCreditVi));
  voiceCreditEn.append(el('a', { href: 'licenses/lj-speech-voice.txt' }, text().voiceCreditEn));
  footer.append(el('p', {}, text().privacy), el('p', {}, text().disclaimer), credit, voiceCreditVi, voiceCreditEn);

  root.replaceChildren(el('h1', {}, text().title), top, controls, panel.element, list, footer);

  const active = (): Village | undefined => (state.activeTag === null ? undefined : state.villages[state.activeTag]);
  const accountText = (village: Village) => {
    const lang = language();
    const ago = formatAgo(Math.max(0, deps.now() / 1000 - village.exportedAt), lang);
    const when = text().exportedAt.replace('{time}', formatEnd(village.exportedAt, lang)).replace('{ago}', ago);
    return `${village.tag} · ${when}`;
  };
  const notice = (kind: string, message: string) => el('p', { 'data-notice': kind, role: 'status' }, message);

  // Saves without waiting, so the screen never stalls on storage. The notice appears or clears when
  // the result arrives, and only a change in the result triggers a redraw.
  function persist(): void {
    void saveState(deps.store, state).then((ok) => {
      if (disposed || stateSaveFailed === !ok) return;
      stateSaveFailed = !ok;
      render();
    });
  }

  function persistSettings(): void {
    void saveSettings(deps.store, settings).then((ok) => {
      if (disposed || settingsSaveFailed === !ok) return;
      settingsSaveFailed = !ok;
      render();
    });
  }

  const needsTap = (): boolean =>
    (settings.voice || settings.ting || settings.vibrate) && !deps.output.hasUserActivation();

  // Runs on click and keydown only. On touch, activation arrives at pointerup, and removing the notice
  // any earlier shifts everything below it up a line before the click lands, so the first press hits
  // the wrong element. By click time the target has already been hit. Removes only the notice node:
  // a full render() would also replace the tab and delete buttons.
  const recheckActivation = (): void => {
    if (!needsTap()) top.querySelector('[data-notice="needs-tap"]')?.remove();
  };

  function applySetting(key: AlertKey, on: boolean): void {
    settings = { ...settings, [key]: on };
    panel.update(settings);
    persistSettings();
    render();
  }

  async function enableBanner(): Promise<void> {
    let permission = deps.output.bannerPermission();
    if (permission === 'default') {
      panel.lockBanner(true);
      try {
        permission = await deps.output.requestBannerPermission();
      } catch {
        permission = 'denied';
      } finally {
        panel.lockBanner(false);
      }
      if (disposed) return;
    }
    if (permission === 'granted') {
      applySetting('banner', true);
      return;
    }
    bannerDenied = true;
    panel.update(settings);
    render();
  }

  function onToggle(key: AlertKey, on: boolean): void {
    bannerDenied = false;
    if (key === 'banner' && on) {
      void enableBanner();
    } else {
      applySetting(key, on);
    }
  }

  async function playSafe(sound: Sound): Promise<boolean> {
    try {
      return await deps.output.play(sound);
    } catch {
      return false;
    }
  }

  // Order: banner, vibrate, ting (waits until it ends), voice. A failing signal never stops the next.
  async function fireAlert(message: AlertMessage): Promise<void> {
    const chosen = settings;
    const lang = language();
    if (chosen.banner) {
      // Not awaited: a registration that never answers must not hold back the sounds.
      try { void deps.output.showBanner(message).catch(() => {}); } catch { /* ignore */ }
    }
    if (chosen.vibrate) {
      try { deps.output.vibrate(); } catch { /* ignore */ }
    }
    if ((!chosen.ting && !chosen.voice) || soundPlaying) return;
    soundPlaying = true;
    try {
      let failed = false;
      if (chosen.ting && !(await playSafe('ting'))) failed = true;
      if (disposed) return;
      if (chosen.voice && !(await playSafe(lang === 'vi' ? 'voice-vi' : 'voice-en'))) failed = true;
      if (disposed || soundFailed === failed) return;
      soundFailed = failed;
      render();
    } finally {
      soundPlaying = false;
    }
  }

  function resetMessages(): void {
    errorText = null;
    keptNewer = false;
  }

  function render(): void {
    const lang = language();
    document.documentElement.lang = lang;
    const t = text();
    const village = active();
    const now = deps.now();
    const tags = Object.keys(state.villages);

    const topNodes: HTMLElement[] = [];
    if (tags.length === 0) {
      const help = el('div', { 'data-role': 'help' });
      help.append(el('p', {}, t.help1), el('p', {}, t.help2), el('p', {}, t.help3));
      topNodes.push(help);
    }
    if (tags.length >= 2) {
      const tabs = el('div', { class: 'tabs' });
      for (const tag of tags) {
        tabs.append(el('button', {
          type: 'button', 'data-tag': tag, 'aria-pressed': String(tag === state.activeTag),
        }, tag));
      }
      topNodes.push(tabs);
    }
    accountLine = null;
    if (village) {
      const header = el('div', { class: 'account' });
      accountLine = el('span', {}, accountText(village));
      header.append(accountLine, el('button', { type: 'button', 'data-action': 'delete' }, t.delete));
      topNodes.push(header, el('p', { class: 'hint' }, t.staleHint));
    }
    if (errorText !== null) topNodes.push(notice('error', errorText));
    if (keptNewer) topNodes.push(notice('kept-newer', t.notice['kept-newer']));
    if (stateSaveFailed || settingsSaveFailed) topNodes.push(notice('storage', t.notice.storage));
    if (unreadable) topNodes.push(notice('unreadable', t.notice.unreadable));
    if (village && allFinished(village.jobs, now)) topNodes.push(notice('all-finished', t.notice['all-finished']));
    if (needsTap()) topNodes.push(notice('needs-tap', t.notice['needs-tap']));
    if (bannerDenied) topNodes.push(notice('banner-denied', t.notice['banner-denied']));
    if (soundFailed) topNodes.push(notice('sound-failed', t.notice['sound-failed']));
    if (village?.hasBoosts) topNodes.push(notice('boost', t.notice.boost));
    if (village && deviceClockBehind(village.exportedAt, now)) topNodes.push(notice('clock', t.notice.clock));
    top.replaceChildren(...topNodes);

    const listNodes: HTMLElement[] = [];
    finishedCount = 0;
    if (village) {
      if (village.jobs.length === 0) listNodes.push(el('p', { 'data-role': 'no-jobs' }, t.noJobs));
      for (const { group, jobs } of groupJobs(village.jobs, now)) {
        const section = el('section');
        const items = el('ul');
        for (const job of jobs) {
          const left = remainingSeconds(job.endsAt, now);
          if (left === 0) finishedCount += 1;
          const item = el('li', { 'data-ends-at': String(job.endsAt) });
          item.append(
            el('span', { class: 'job-name' }, jobName(job, lang)),
            el('span', { class: 'job-remaining' }, formatRemaining(left, lang)),
            el('span', { class: 'job-detail' }, jobDetailText(job.detail, lang)),
            el('span', { class: 'job-end' }, formatEnd(job.endsAt, lang)),
          );
          items.append(item);
        }
        section.append(el('h2', {}, t.groups[group]), items);
        listNodes.push(section);
      }
    }
    list.replaceChildren(...listNodes);
  }

  function handleText(pasted: string): void {
    resetMessages();
    const result = parseExport(pasted);
    if (!result.ok) {
      errorText = text().error[result.error];
      render();
      return;
    }
    const firstAccount = Object.keys(state.villages).length === 0;
    const { state: next, outcome } = upsertVillage(state, result.village);
    state = next;
    // A one-time hint after the very first paste, for people who have not chosen any alert yet.
    if (outcome === 'added' && firstAccount && !anyAlertOn(settings)) panel.open();
    keptNewer = outcome === 'kept-newer';
    unreadable = false;
    persist();
    box.value = '';
    render();
  }

  function tick(): void {
    const now = deps.now();
    let finished = 0;
    for (const item of list.querySelectorAll<HTMLElement>('li[data-ends-at]')) {
      const left = remainingSeconds(Number(item.dataset.endsAt), now);
      if (left === 0) finished += 1;
      const target = item.querySelector('.job-remaining');
      const label = formatRemaining(left, language());
      if (target && target.textContent !== label) target.textContent = label;
    }
    const village = active();
    if (village && accountLine) {
      const label = accountText(village);
      if (accountLine.textContent !== label) accountLine.textContent = label;
    }
    const nowSec = now / 1000;
    const due = finishedBetween(Object.values(state.villages), lastCheckSec, nowSec);
    lastCheckSec = Math.max(lastCheckSec, nowSec);
    if (due.length > 0) void fireAlert(alertMessage(due, language()));
    if (finished !== finishedCount) render();
  }

  async function onPaste(): Promise<void> {
    let pasted: string;
    try {
      pasted = await deps.readClipboard();
    } catch {
      resetMessages();
      errorText = text().error.clipboard;
      render();
      return;
    }
    handleText(pasted);
  }

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const tag = target.closest<HTMLElement>('button[data-tag]')?.dataset.tag;
    if (tag !== undefined) {
      state = { ...state, activeTag: tag };
    } else if (target.closest('button[data-action="delete"]') && state.activeTag !== null) {
      state = removeVillage(state, state.activeTag);
    } else {
      return;
    }
    resetMessages();
    persist();
    render();
  };
  const onPasteClick = (): void => { void onPaste(); };
  const onInput = (): void => {
    if (box.value.trim() !== '') handleText(box.value);
  };

  root.addEventListener('click', onClick);
  pasteButton.addEventListener('click', onPasteClick);
  box.addEventListener('input', onInput);
  document.addEventListener('visibilitychange', tick);
  for (const type of ['click', 'keydown']) document.addEventListener(type, recheckActivation);
  const timer = setInterval(tick, 1000);

  render();

  return () => {
    disposed = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
    for (const type of ['click', 'keydown']) document.removeEventListener(type, recheckActivation);
    root.removeEventListener('click', onClick);
    pasteButton.removeEventListener('click', onPasteClick);
    box.removeEventListener('input', onInput);
  };
}
