import { alertMessage, allFinished, finishedBetween, nextJob } from '../src/core/alerts';
import type { Job, Village } from '../src/core/types';

const job = (id: number, endsAt: number, group: Job['group'] = 'home-build'): Job =>
  ({ id, group, detail: { kind: 'upgrade', level: 6 }, endsAt });
const village = (tag: string, jobs: Job[]): Village => ({ tag, exportedAt: 1, jobs, hasBoosts: false });

test('includes the upper bound and excludes the lower bound', () => {
  const v = village('#A', [job(1, 100), job(2, 101), job(3, 110), job(4, 111)]);
  expect(finishedBetween([v], 100, 110).map((f) => f.job.id)).toEqual([2, 3]);
});

test('skips helper cooldowns', () => {
  expect(finishedBetween([village('#A', [job(1, 105, 'helper')])], 100, 110)).toEqual([]);
});

test('covers every account', () => {
  const found = finishedBetween([village('#A', [job(1, 105)]), village('#B', [job(2, 105)])], 100, 110);
  expect(found.map((f) => f.tag)).toEqual(['#A', '#B']);
});

test('one job names it, with its detail and tag', () => {
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }], 'vi'))
    .toEqual({ title: 'Workshop đã xong', body: 'Cấp 6 → 7 · #A' });
});

test('several jobs are summed up', () => {
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }, { tag: '#B', job: job(1000026, 5) }], 'vi'))
    .toEqual({ title: '2 hạng mục đã xong', body: 'Workshop, Dark Barracks' });
});

test.each<[string, Job[], boolean]>([
  ['no jobs', [], false],
  ['only helpers', [job(1, 5, 'helper')], false],
  ['one still running', [job(1, 5), job(2, 200)], false],
  ['a job ending right now', [job(1, 100)], true],
  ['all done while a helper still runs', [job(1, 5), job(2, 200, 'helper')], true],
])('allFinished: %s', (_name, jobs, expected) => {
  expect(allFinished(jobs, 100_000)).toBe(expected);
});

test('messages in English', () => {
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }], 'en'))
    .toEqual({ title: 'Workshop finished', body: 'Level 6 → 7 · #A' });
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }, { tag: '#B', job: job(1000026, 5) }], 'en'))
    .toEqual({ title: '2 items finished', body: 'Workshop, Dark Barracks' });
});

test('an unknown id is not Vietnamese in English', () => {
  expect(alertMessage([{ tag: '#A', job: job(999, 5) }], 'en').title).toBe('Unknown (#999) finished');
  expect(alertMessage([{ tag: '#A', job: job(999, 5) }], 'vi').title).toBe('Không rõ (#999) đã xong');
});

test('nextJob picks the soonest running job and skips helpers and finished ones', () => {
  const soon = job(1, 150);
  expect(nextJob([job(2, 300), soon, job(3, 100), job(4, 120, 'helper'), job(5, 90)], 100_000)).toBe(soon);
  expect(nextJob([job(1, 100), job(2, 300, 'helper')], 100_000)).toBeNull();
  expect(nextJob([], 100_000)).toBeNull();
});
