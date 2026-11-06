import { alertMessage, allFinished, finishedBetween, nextJob, type AlertMessage } from '../core/alerts';
import { parseExport } from '../core/parse';
import type { Language } from '../core/language';
import { anyAlertOn, saveSettings, type Settings } from '../core/settings';
import {
  removeVillage, saveState, upsertVillage, type AppState, type KeyValueStore, type LoadResult,
} from '../core/store';
import {
  deviceClockBehind, formatAgo, formatCountdown, formatEnd, formatRemaining, remainingSeconds,
} from '../core/time';
import type { Village } from '../core/types';
import type { AlertOutput, Sound } from '../platform/alert-output';
import { copy, type Copy } from './copy';
import { el } from './dom';
import { icon } from './icons';
import { jobList, nextCard } from './job-view';
import { createSettingsView, type AlertKey } from './settings-view';

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
  // The text node with the age of the data, the only part of the account line that changes each minute.
  let agoNode: Text | null = null;
  let clipboardFailed = false;
  // The hint to turn on alerts: set by the first account, not saved, so it lasts until settings open.
  let nudge = false;
  let view: 'main' | 'settings' = 'main';
  // True while the history holds the entry pushed by opening settings.
  let settingsEntry = false;

  const language = (): Language => settings.language ?? deps.deviceLanguage;
  const text = (): Copy => copy[language()];

  const top = el('div', { class: 'stack' });
  const list = el('div', { class: 'content' });
  const title = el('h1');
  const settingsButton = el('button', { type: 'button', 'data-action': 'settings' });
  settingsButton.append(icon('settings'));
  const header = el('div', { class: 'app-bar' });
  header.append(title, settingsButton);
  // The only paste button. render moves it between the first screen, the account line and the
  // "everything finished" block, so the listener is attached once.
  const pasteButton = el('button', { type: 'button', 'data-action': 'paste' });
  const box = el('textarea', { name: 'export', rows: '3', autocomplete: 'off', spellcheck: 'false' });
  const controls = el('div', { class: 'controls' });
  controls.append(pasteButton, box);

  const settingsView = createSettingsView({
    onToggle: (key, on) => onToggle(key, on),
    onLanguage: (lang) => onLanguage(lang),
    onTest: () => {
      if (anyAlertOn(settings)) {
        void fireAlert({ title: text().alerts.testTitle, body: text().alerts.testBody });
      }
    },
    onDelete: () => onDelete(),
    onBack: () => leaveSettings(),
  });

  // Footer text is set by applyStaticText, because it changes with the language. Relative hrefs so the
  // links also work when the app is served from a sub-path (GitHub Pages).
  const footer = el('footer');
  const privacy = el('p');
  const disclaimer = el('p');
  const credit = el('a', { href: 'licenses/clash-of-clans-data.txt' });
  const voiceCreditVi = el('a', { href: 'licenses/vais1000-voice.txt' });
  const voiceCreditEn = el('a', { href: 'licenses/lj-speech-voice.txt' });
  const links = [credit, voiceCreditVi, voiceCreditEn].map((link) => {
    const line = el('p');
    line.append(link);
    return line;
  });
  footer.append(privacy, disclaimer, ...links);

  const side = el('div', { class: 'side' });
  side.append(top, controls);
  const layout = el('div', { class: 'layout' });
  layout.append(side, list);
  const mainView = el('div', { 'data-view': 'main' });
  mainView.append(header, layout, footer);
  root.replaceChildren(mainView, settingsView.element);

  // Text that is built once and must still follow the language, including attributes.
  function applyStaticText(): void {
    const t = text();
    title.textContent = t.title;
    settingsButton.setAttribute('aria-label', t.settings.open);
    box.setAttribute('placeholder', t.placeholder);
    box.setAttribute('aria-label', t.placeholder);
    privacy.textContent = t.privacy;
    disclaimer.textContent = t.disclaimer;
    credit.textContent = t.credit;
    voiceCreditVi.textContent = t.voiceCreditVi;
    voiceCreditEn.textContent = t.voiceCreditEn;
  }

  const active = (): Village | undefined => (state.activeTag === null ? undefined : state.villages[state.activeTag]);
  const agoText = (village: Village): string =>
    text().exportedAgo.replace('{ago}', formatAgo(Math.max(0, deps.now() / 1000 - village.exportedAt), language()));
  const notice = (kind: string, message: string) =>
    el('p', { class: 'note', 'data-notice': kind, role: 'status' }, message);

  // The tag (only when there is one account: with several, the chips already show it), how long ago the
  // data was exported, and the export time, which only wide screens show (on a line of its own).
  function accountRow(village: Village, withTag: boolean): HTMLElement {
    const line = el('span');
    if (withTag) line.append(el('b', {}, village.tag), ' · ');
    agoNode = document.createTextNode(agoText(village));
    const when = text().exportedAt.replace('{time}', formatEnd(village.exportedAt, language()));
    line.append(agoNode, el('span', { class: 'export-at' }, when));
    const row = el('div', { class: 'account' });
    row.append(line);
    return row;
  }

  function stepsCard(t: Copy): HTMLElement {
    const help = el('div', { 'data-role': 'help' });
    help.append(el('h2', {}, t.helpTitle));
    [t.help1, t.help2, t.help3].forEach((step, index) => {
      const item = el('div', { class: 'step' });
      item.append(el('span', { class: 'num' }, String(index + 1)), el('span', {}, step));
      help.append(item);
    });
    return help;
  }

  function finishedCard(t: Copy): HTMLElement {
    const card = el('div', { class: 'hero', 'data-notice': 'all-finished', role: 'status' });
    card.append(
      el('div', { class: 'eyebrow' }, t.allDoneEyebrow),
      el('div', { class: 'what big' }, t.allDoneTitle),
      el('div', { class: 'when' }, t.allDoneText),
    );
    return card;
  }

  function nudgeBlock(t: Copy): HTMLElement {
    const block = el('div', { class: 'nudge', 'data-role': 'alerts-nudge' });
    const action = el('button', { type: 'button', 'data-action': 'open-alerts' }, t.nudgeAction);
    block.append(el('span', {}, t.nudge), action);
    return block;
  }

  // Sets what the paste button says and looks like for where it is about to be placed.
  function styleFor(mode: 'first' | 'small' | 'fresh', t: Copy): void {
    pasteButton.classList.toggle('primary', mode !== 'small');
    if (mode === 'small') pasteButton.replaceChildren(icon('clipboard'), document.createTextNode(t.pasteSmall));
    else pasteButton.replaceChildren(document.createTextNode(mode === 'first' ? t.paste : t.pasteFresh));
  }

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
    if (!needsTap()) root.querySelector('[data-notice="needs-tap"]')?.remove();
  };

  function applySetting(key: AlertKey, on: boolean): void {
    settings = { ...settings, [key]: on };
    persistSettings();
    render();
  }

  async function enableBanner(): Promise<void> {
    let permission = deps.output.bannerPermission();
    if (permission === 'default') {
      settingsView.lockBanner(true);
      try {
        permission = await deps.output.requestBannerPermission();
      } catch {
        permission = 'denied';
      } finally {
        settingsView.lockBanner(false);
      }
      if (disposed) return;
    }
    if (permission === 'granted') {
      applySetting('banner', true);
      return;
    }
    bannerDenied = true;
    render();
  }

  function onLanguage(lang: Language): void {
    settings = { ...settings, language: lang };
    persistSettings();
    render();
  }

  function onDelete(): void {
    if (state.activeTag === null) return;
    state = removeVillage(state, state.activeTag);
    resetMessages();
    persist();
    leaveSettings();
    render();
  }

  // Both views exist in the page; the other one is hidden. Focus moves only after the view is shown,
  // because browsers ignore focus() on a hidden element.
  function openSettings(): void {
    if (view === 'settings') return;
    view = 'settings';
    nudge = false;
    history.pushState({ view: 'settings' }, '');
    settingsEntry = true;
    render();
    settingsView.focusBack();
  }

  function closeSettings(): void {
    if (view !== 'settings') return;
    view = 'main';
    settingsEntry = false;
    render();
    settingsButton.focus();
  }

  // The in-app way out: closes at once, then removes the history entry that opening added. The popstate
  // that follows finds the screen already closed and does nothing.
  function leaveSettings(): void {
    const hadEntry = settingsEntry;
    closeSettings();
    if (hadEntry) history.back();
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

  // The notices caused by what happens in settings. They are shown on whichever screen is open, so each
  // one has exactly one element in the page.
  function alertNotices(): HTMLElement[] {
    const t = text();
    const nodes: HTMLElement[] = [];
    if (stateSaveFailed || settingsSaveFailed) nodes.push(notice('storage', t.notice.storage));
    if (needsTap()) nodes.push(notice('needs-tap', t.notice['needs-tap']));
    if (bannerDenied) nodes.push(notice('banner-denied', t.notice['banner-denied']));
    if (soundFailed) nodes.push(notice('sound-failed', t.notice['sound-failed']));
    return nodes;
  }

  function render(): void {
    const lang = language();
    document.documentElement.lang = lang;
    applyStaticText();
    mainView.hidden = view !== 'main';
    settingsView.element.hidden = view !== 'settings';
    settingsView.update({ settings, lang, accountTag: active()?.tag ?? null });
    settingsView.notices.replaceChildren(...(view === 'settings' ? alertNotices() : []));
    const t = text();
    const village = active();
    const now = deps.now();
    const tags = Object.keys(state.villages);
    // Moving the button drops keyboard focus in a real browser, so give it back afterwards.
    const keepFocus = view === 'main' && document.activeElement === pasteButton;
    if (tags.length === 0) nudge = false;
    layout.classList.toggle('single', tags.length === 0);

    const topNodes: HTMLElement[] = [];
    if (tags.length === 0) topNodes.push(stepsCard(t));
    if (tags.length >= 2) {
      const chips = el('div', { class: 'chips' });
      for (const tag of tags) {
        chips.append(el('button', {
          type: 'button', 'data-tag': tag, 'aria-pressed': String(tag === state.activeTag),
        }, tag));
      }
      topNodes.push(chips);
    }
    agoNode = null;
    const done = village !== undefined && allFinished(village.jobs, now);
    if (village) {
      const row = accountRow(village, tags.length < 2);
      if (!done) {
        styleFor('small', t);
        row.append(pasteButton);
      }
      topNodes.push(row);
    } else {
      styleFor('first', t);
      controls.prepend(pasteButton);
    }
    if (errorText !== null) topNodes.push(notice('error', errorText));
    if (keptNewer) topNodes.push(notice('kept-newer', t.notice['kept-newer']));
    if (view === 'main') topNodes.push(...alertNotices());
    if (unreadable) topNodes.push(notice('unreadable', t.notice.unreadable));
    if (village?.hasBoosts) topNodes.push(notice('boost', t.notice.boost));
    if (village && deviceClockBehind(village.exportedAt, now)) topNodes.push(notice('clock', t.notice.clock));
    const upcoming = village ? nextJob(village.jobs, now) : null;
    if (village && done) {
      const card = finishedCard(t);
      styleFor('fresh', t);
      card.append(pasteButton);
      topNodes.push(card);
    } else if (upcoming) {
      topNodes.push(nextCard(upcoming, now, lang, t));
    }
    if (nudge && village) topNodes.push(nudgeBlock(t));
    top.replaceChildren(...topNodes);

    const showBox = tags.length === 0 || clipboardFailed;
    box.hidden = !showBox;
    controls.hidden = !showBox;

    const listNodes: HTMLElement[] = [];
    finishedCount = 0;
    if (village) {
      const jobs = jobList(village, now, lang, t);
      finishedCount = jobs.finished;
      listNodes.push(...jobs.nodes, el('p', { class: 'hint' }, t.staleHint));
    }
    list.replaceChildren(...listNodes);
    if (keepFocus) pasteButton.focus();
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
    if (outcome === 'added' && firstAccount && !anyAlertOn(settings)) nudge = true;
    clipboardFailed = false;
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
    if (village && agoNode) {
      const label = agoText(village);
      if (agoNode.data !== label) agoNode.data = label;
    }
    const countdown = root.querySelector<HTMLElement>('[data-ends-at-next]');
    if (countdown) {
      const label = formatCountdown(remainingSeconds(Number(countdown.dataset.endsAtNext), now), language());
      if (countdown.textContent !== label) countdown.textContent = label;
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
      clipboardFailed = true;
      errorText = text().error.clipboard;
      render();
      return;
    }
    handleText(pasted);
  }

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button[data-action="open-alerts"]')) {
      openSettings();
      return;
    }
    const tag = target.closest<HTMLElement>('button[data-tag]')?.dataset.tag;
    if (tag === undefined) return;
    state = { ...state, activeTag: tag };
    resetMessages();
    persist();
    render();
  };
  const onPasteClick = (): void => { void onPaste(); };
  const onSettingsClick = (): void => openSettings();
  const onPopState = (): void => closeSettings();
  const onInput = (): void => {
    if (box.value.trim() !== '') handleText(box.value);
  };

  root.addEventListener('click', onClick);
  pasteButton.addEventListener('click', onPasteClick);
  settingsButton.addEventListener('click', onSettingsClick);
  box.addEventListener('input', onInput);
  window.addEventListener('popstate', onPopState);
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
    settingsButton.removeEventListener('click', onSettingsClick);
    box.removeEventListener('input', onInput);
    window.removeEventListener('popstate', onPopState);
  };
}
