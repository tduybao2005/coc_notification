import { jobName } from '../core/names';
import { parseExport } from '../core/parse';
import { loadState, removeVillage, saveState, upsertVillage, type AppState } from '../core/store';
import {
  deviceClockBehind, formatAgo, formatEnd, formatRemaining, groupJobs, remainingSeconds,
} from '../core/time';
import type { Village } from '../core/types';
import { copy } from './copy';

export interface AppDeps { storage: Storage; now: () => number; readClipboard: () => Promise<string> }

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountApp(root: HTMLElement, deps: AppDeps): () => void {
  let state: AppState = loadState(deps.storage);
  // Messages describing the last user action; cleared when the next action starts.
  let errorText: string | null = null;
  let keptNewer = false;
  let storageFailed = false;
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

  const footer = el('footer');
  const credit = el('p');
  // Relative href so the link also works when the app is served from a sub-path (GitHub Pages).
  credit.append(el('a', { href: 'licenses/clash-of-clans-data.txt' }, copy.credit));
  footer.append(el('p', {}, copy.privacy), el('p', {}, copy.disclaimer), credit);

  root.replaceChildren(el('h1', {}, copy.title), top, controls, list, footer);

  const active = (): Village | undefined => (state.activeTag === null ? undefined : state.villages[state.activeTag]);
  const accountText = (village: Village) => {
    const ago = formatAgo(Math.max(0, deps.now() / 1000 - village.exportedAt));
    return `${village.tag} · ${copy.exportedAt.replace('{time}', formatEnd(village.exportedAt)).replace('{ago}', ago)}`;
  };
  const notice = (kind: string, text: string) => el('p', { 'data-notice': kind, role: 'status' }, text);

  function persist(): void {
    storageFailed = !saveState(deps.storage, state);
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
    if (storageFailed) topNodes.push(notice('storage', copy.notice.storage));
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
    const { state: next, outcome } = upsertVillage(state, result.village);
    state = next;
    keptNewer = outcome === 'kept-newer';
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
  const timer = setInterval(tick, 1000);

  render();

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
    root.removeEventListener('click', onClick);
    pasteButton.removeEventListener('click', onPasteClick);
    box.removeEventListener('input', onInput);
  };
}
