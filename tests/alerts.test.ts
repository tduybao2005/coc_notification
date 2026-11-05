import { alertMessage, allFinished, finishedBetween } from '../src/core/alerts';
import type { Job, Village } from '../src/core/types';

const job = (id: number, endsAt: number, group: Job['group'] = 'home-build'): Job =>
  ({ id, group, detail: 'Cấp 6 → 7', endsAt });
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
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }]))
    .toEqual({ title: 'Workshop đã xong', body: 'Cấp 6 → 7 · #A' });
});

test('several jobs are summed up', () => {
  expect(alertMessage([{ tag: '#A', job: job(1000059, 5) }, { tag: '#B', job: job(1000026, 5) }]))
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
