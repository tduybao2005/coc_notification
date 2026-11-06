import { readFileSync } from 'node:fs';
import { parseExport } from '../src/core/parse';

const sample = readFileSync('tests/fixtures/export.sample.json', 'utf8');
const T = 1793895122;
const wrap = (extra: object) => JSON.stringify({ tag: '#TEST123', timestamp: T, ...extra });
const jobs = (text: string) => {
  const r = parseExport(text);
  if (!r.ok) throw new Error(r.error);
  return r.village.jobs;
};

test('reads every running timer from the real export', () => {
  const r = parseExport(sample);
  expect(r).toMatchObject({ ok: true, village: { tag: '#TEST123', exportedAt: T, hasBoosts: false } });
  const all = jobs(sample);
  expect(all).toHaveLength(13);
  const count = (g: string) => all.filter((j) => j.group === g).length;
  expect([count('home-build'), count('lab'), count('pet'), count('builder-build'),
    count('builder-lab'), count('helper')]).toEqual([6, 1, 1, 2, 1, 2]);
});

test('computes end time and target level', () => {
  const all = jobs(sample);
  expect(all.find((j) => j.id === 1000026)).toMatchObject({ endsAt: 1794295613, detail: { kind: 'upgrade', level: 12 } });
  expect(all.find((j) => j.id === 4000042)).toMatchObject({ group: 'builder-lab', detail: { kind: 'upgrade', level: 17 } });
  expect(all.find((j) => j.id === 93000000)).toMatchObject({ group: 'helper', detail: { kind: 'cooldown' } });
});

test('keeps two upgrades of the same building as two jobs', () => {
  const ends = jobs(sample).filter((j) => j.id === 1000067).map((j) => j.endsAt).sort();
  expect(ends).toEqual([1793983896, 1794014804]);
});

test('finds timers nested inside crafted defenses', () => {
  const text = wrap({ buildings: [{ data: 1000097, types: [{ data: 103000011,
    modules: [{ data: 102000033, lvl: 1, timer: 100 }] }] }] });
  expect(jobs(text)).toEqual([{ id: 102000033, parentId: 103000011, group: 'home-build',
    detail: { kind: 'upgrade', level: 1 }, endsAt: T + 100 }]);
});

test('keeps a timer on an object without numeric data, parented to the nearest ancestor with data', () => {
  const text = wrap({ buildings: [{ data: 1000097, types: [{ lvl: 3, timer: 50 }] }] });
  expect(jobs(text)).toEqual([{ id: 0, parentId: 1000097, group: 'home-build',
    detail: { kind: 'upgrade', level: 3 }, endsAt: T + 50 }]);
});

test('keeps timers from unknown ids and sections', () => {
  const text = wrap({ new_things: [{ data: 999, lvl: 1, timer: 5 }] });
  expect(jobs(text)).toMatchObject([{ id: 999, group: 'other', endsAt: T + 5 }]);
});

test('uses neutral labels for cases the sample cannot confirm', () => {
  expect(jobs(wrap({ buildings: [{ data: 1000001, lvl: 16, weapon: 1, timer: 9 }] }))[0].detail).toEqual({ kind: 'weapon', level: 16, weapon: 1 });
  expect(jobs(wrap({ buildings: [{ data: 1000001, lvl: 16, weapon: 'x', timer: 9 }] }))[0].detail).toEqual({ kind: 'upgrade', level: 16 });
  expect(jobs(wrap({ buildings: [{ data: 1000006, lvl: 0, timer: 9 }] }))[0].detail).toEqual({ kind: 'build' });
});

test('maps heroes and ignores invalid timers', () => {
  expect(jobs(wrap({ heroes: [{ data: 28000000, lvl: 71, timer: 9 }] }))[0]).toMatchObject({ group: 'home-hero', detail: { kind: 'upgrade', level: 71 } });
  expect(jobs(wrap({ units: [{ data: 1, timer: '9' }, { data: 2, timer: -1 }, { data: 3, timer: 0 }] }))).toEqual([]);
});

test('flags active boosts', () => {
  expect(parseExport(wrap({ boosts: { any: 1 } }))).toMatchObject({ ok: true, village: { hasBoosts: true } });
});

test('accepts text around the JSON', () => {
  expect(parseExport(`Của tôi:\n${sample}\n`).ok).toBe(true);
});

test.each([
  ['', 'empty'], ['   \n', 'empty'],
  ['xin chào', 'not-json'], [sample.slice(0, 500), 'not-json'],
  ['{"a":1}', 'not-export'], ['[1,2]', 'not-json'],
  ['{"tag":"<img src=x>","timestamp":1793895122}', 'not-export'],
  ['{"tag":"#ABC","timestamp":"soon"}', 'not-export'],
])('rejects %j as %s', (text, error) => {
  expect(parseExport(text)).toEqual({ ok: false, error });
});
