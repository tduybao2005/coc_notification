import { jobDetailText, jobName } from './names';
import { remainingSeconds } from './time';
import type { Job, Village } from './types';

export interface FinishedJob { tag: string; job: Job }
export interface AlertMessage { title: string; body: string }

// True when at least one non-helper job exists and every such job is finished. Uses the same rule as
// the list, so this flips at the moment a row changes to "Đã xong".
export function allFinished(jobs: Job[], nowMs: number): boolean {
  const tracked = jobs.filter((job) => job.group !== 'helper');
  return tracked.length > 0 && tracked.every((job) => remainingSeconds(job.endsAt, nowMs) === 0);
}

// Jobs of every account with fromSec < endsAt <= toSec, helper cooldowns excluded.
export function finishedBetween(villages: Village[], fromSec: number, toSec: number): FinishedJob[] {
  const found: FinishedJob[] = [];
  for (const village of villages) {
    for (const job of village.jobs) {
      if (job.group !== 'helper' && job.endsAt > fromSec && job.endsAt <= toSec) {
        found.push({ tag: village.tag, job });
      }
    }
  }
  return found;
}

export function alertMessage(finished: FinishedJob[]): AlertMessage {
  if (finished.length === 1) {
    const { tag, job } = finished[0];
    return { title: `${jobName(job)} đã xong`, body: `${jobDetailText(job.detail, 'vi')} · ${tag}` };
  }
  return {
    title: `${finished.length} hạng mục đã xong`,
    body: finished.map(({ job }) => jobName(job)).join(', '),
  };
}
