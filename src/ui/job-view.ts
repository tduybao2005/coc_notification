import type { Language } from '../core/language';
import { jobDetailText, jobName } from '../core/names';
import { formatCountdown, formatEnd, formatRemaining, groupJobs, remainingSeconds } from '../core/time';
import type { Job, Village } from '../core/types';
import type { Copy } from './copy';
import { el } from './dom';

// The list of jobs by group, and how many of them are already finished at nowMs.
export function jobList(
  village: Village, nowMs: number, lang: Language, text: Copy,
): { nodes: HTMLElement[]; finished: number } {
  const nodes: HTMLElement[] = [];
  let finished = 0;
  if (village.jobs.length === 0) nodes.push(el('p', { 'data-role': 'no-jobs' }, text.noJobs));
  for (const { group, jobs } of groupJobs(village.jobs, nowMs)) {
    const section = el('section');
    const heading = el('div', { class: 'group' });
    heading.append(el('h2', {}, text.groups[group]), el('span', { class: 'group-count' }, String(jobs.length)));
    const items = el('ul');
    for (const job of jobs) {
      const left = remainingSeconds(job.endsAt, nowMs);
      if (left === 0) finished += 1;
      const item = el('li', { 'data-ends-at': String(job.endsAt) });
      item.append(
        el('span', { class: 'job-name' }, jobName(job, lang)),
        el('span', { class: 'job-remaining' }, formatRemaining(left, lang)),
        el('span', { class: 'job-detail' }, jobDetailText(job.detail, lang)),
        el('span', { class: 'job-end' }, formatEnd(job.endsAt, lang)),
      );
      items.append(item);
    }
    section.append(heading, items);
    nodes.push(section);
  }
  return { nodes, finished };
}

// The block for the job that finishes next. `tick` finds the countdown through data-ends-at-next.
export function nextCard(job: Job, nowMs: number, lang: Language, text: Copy): HTMLElement {
  const card = el('div', { class: 'hero', 'data-role': 'next' });
  card.append(
    el('div', { class: 'eyebrow' }, text.next),
    el('div', {
      class: 'next-count', 'data-ends-at-next': String(job.endsAt),
    }, formatCountdown(remainingSeconds(job.endsAt, nowMs), lang)),
    el('div', { class: 'what' }, `${jobName(job, lang)} · ${jobDetailText(job.detail, lang)}`),
    el('div', { class: 'when' }, formatEnd(job.endsAt, lang)),
  );
  return card;
}
