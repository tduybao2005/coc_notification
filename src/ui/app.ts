import { alertMessage, allFinished, finishedBetween, type AlertMessage } from '../core/alerts';
import { jobName } from '../core/names';
import { parseExport } from '../core/parse';
import { saveSettings, type AlertSettings } from '../core/settings';
import {
  removeVillage, saveState, upsertVillage, type AppState, type KeyValueStore, type LoadResult,
} from '../core/store';
import {
  deviceClockBehind, formatAgo, formatEnd, formatRemaining, groupJobs, remainingSeconds,
} from '../core/time';
import type { Village } from '../core/types';
import type { AlertOutput, Sound } from '../platform/alert-output';
import { createAlertsPanel, type AlertKey } from './alerts-panel';
import { copy } from './copy';
import { el } from './dom';

export interface AppDeps {
  store: KeyValueStore;
  loaded: LoadResult;
  settings: AlertSettings;
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
  let settings: AlertSettings = {
    ...deps.settings,
    banner: deps.settings.banner && deps.output.bannerPermission() === 'granted',
  };
  let lastCheckSec = deps.now() / 1000;
  let unreadable = deps.loaded.unreadable;
  let disposed = false;
  let finishedCount = 0;
  let accountLine: HTMLElement | null = null;

  const top = el('div');
  const list = el('div');
  const pasteButton = el('button', { type: 'button', 'data-action': 'paste' }, copy.paste);
  const box = el('textarea', {
    name: 'export', rows: '3', placeholder: copy.placeholder, 'aria-label': copy.placeholder,
    autocomplete: 'off', spellcheck: 'false',
  });
  const controls = el('div', { class: 'controls' });
  controls.append(pasteButton, box);

  const panel = createAlertsPanel({
    onToggle: (key, on) => onToggle(key, on),
    onTest: () => {
      if (Object.values(settings).some(Boolean)) {
        void fireAlert({ title: copy.alerts.testTitle, body: copy.alerts.testBody });
      }
    },
  });
  panel.update(settings);

  const footer = el('footer');
  const credit = el('p');
  const voiceCredit = el('p');
  // Relative hrefs so the links also work when the app is served from a sub-path (GitHub Pages).
  credit.append(el('a', { href: 'licenses/clash-of-clans-data.txt' }, copy.credit));
  voiceCredit.append(el('a', { href: 'licenses/vais1000-voice.txt' }, copy.voiceCredit));
  footer.append(el('p', {}, copy.privacy), el('p', {}, copy.disclaimer), credit, voiceCredit);

  root.replaceChildren(el('h1', {}, copy.title), top, controls, panel.element, list, footer);

  const active = (): Village | undefined => (state.activeTag === null ? undefined : state.villages[state.activeTag]);
  const accountText = (village: Village) => {
    const ago = formatAgo(Math.max(0, deps.now() / 1000 - village.exportedAt));
    return `${village.tag} · ${copy.exportedAt.replace('{time}', formatEnd(village.exportedAt)).replace('{ago}', ago)}`;
  };
  const notice = (kind: string, text: string) => el('p', { 'data-notice': kind, role: 'status' }, text);

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

  // Removes only the notice node. A full render() would replace the tab and delete buttons between
  // pointerdown and the click that follows, and lose that click.
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
      if (chosen.voice && !(await playSafe('voice'))) failed = true;
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
    const village = active();
    const now = deps.now();
    const tags = Object.keys(state.villages);

    const topNodes: HTMLElement[] = [];
    if (tags.length === 0) {
      const help = el('div', { 'data-role': 'help' });
      help.append(el('p', {}, copy.help1), el('p', {}, copy.help2), el('p', {}, copy.help3));
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
      header.append(accountLine, el('button', { type: 'button', 'data-action': 'delete' }, copy.delete));
      topNodes.push(header, el('p', { class: 'hint' }, copy.staleHint));
    }
    if (errorText !== null) topNodes.push(notice('error', errorText));
    if (keptNewer) topNodes.push(notice('kept-newer', copy.notice['kept-newer']));
    if (stateSaveFailed || settingsSaveFailed) topNodes.push(notice('storage', copy.notice.storage));
    if (unreadable) topNodes.push(notice('unreadable', copy.notice.unreadable));
    if (village && allFinished(village.jobs, now)) topNodes.push(notice('all-finished', copy.notice['all-finished']));
    if (needsTap()) topNodes.push(notice('needs-tap', copy.notice['needs-tap']));
    if (bannerDenied) topNodes.push(notice('banner-denied', copy.notice['banner-denied']));
    if (soundFailed) topNodes.push(notice('sound-failed', copy.notice['sound-failed']));
    if (village?.hasBoosts) topNodes.push(notice('boost', copy.notice.boost));
    if (village && deviceClockBehind(village.exportedAt, now)) topNodes.push(notice('clock', copy.notice.clock));
    top.replaceChildren(...topNodes);

    const listNodes: HTMLElement[] = [];
    finishedCount = 0;
    if (village) {
      if (village.jobs.length === 0) listNodes.push(el('p', { 'data-role': 'no-jobs' }, copy.noJobs));
      for (const { group, jobs } of groupJobs(village.jobs, now)) {
        const section = el('section');
        const items = el('ul');
        for (const job of jobs) {
          const left = remainingSeconds(job.endsAt, now);
          if (left === 0) finishedCount += 1;
          const item = el('li', { 'data-ends-at': String(job.endsAt) });
          item.append(
            el('span', { class: 'job-name' }, jobName(job)),
            el('span', { class: 'job-remaining' }, formatRemaining(left)),
            el('span', { class: 'job-detail' }, job.detail),
            el('span', { class: 'job-end' }, formatEnd(job.endsAt)),
          );
          items.append(item);
        }
        section.append(el('h2', {}, copy.groups[group]), items);
        listNodes.push(section);
      }
    }
    list.replaceChildren(...listNodes);
  }

  function handleText(text: string): void {
    resetMessages();
    const result = parseExport(text);
    if (!result.ok) {
      errorText = copy.error[result.error];
      render();
      return;
    }
    const firstAccount = Object.keys(state.villages).length === 0;
    const { state: next, outcome } = upsertVillage(state, result.village);
    state = next;
    // A one-time hint after the very first paste, for people who have not chosen any alert yet.
    if (outcome === 'added' && firstAccount && !Object.values(settings).some(Boolean)) panel.open();
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
      const text = formatRemaining(left);
      if (target && target.textContent !== text) target.textContent = text;
    }
    const village = active();
    if (village && accountLine) {
      const text = accountText(village);
      if (accountLine.textContent !== text) accountLine.textContent = text;
    }
    const nowSec = now / 1000;
    const due = finishedBetween(Object.values(state.villages), lastCheckSec, nowSec);
    lastCheckSec = Math.max(lastCheckSec, nowSec);
    if (due.length > 0) void fireAlert(alertMessage(due));
    if (finished !== finishedCount) render();
  }

  async function onPaste(): Promise<void> {
    let text: string;
    try {
      text = await deps.readClipboard();
    } catch {
      resetMessages();
      errorText = copy.error.clipboard;
      render();
      return;
    }
    handleText(text);
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
  // A touch tap reports no activation at pointerdown but does at pointerup, so listen to both.
  for (const type of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(type, recheckActivation);
  const timer = setInterval(tick, 1000);

  render();

  return () => {
    disposed = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
    for (const type of ['pointerdown', 'pointerup', 'keydown']) document.removeEventListener(type, recheckActivation);
    root.removeEventListener('click', onClick);
    pasteButton.removeEventListener('click', onPasteClick);
    box.removeEventListener('input', onInput);
  };
}
