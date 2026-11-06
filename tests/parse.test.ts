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

test.each([
  [{}, false],
  [{ any: 1 }, true],
  [{ builder_boost: 1049 }, false],
  [{ clocktower_cooldown: 23491 }, false],
  [{ builder_boost: 1049, clocktower_cooldown: 23491 }, false],
  [{ builder_boost: 1049, lab_boost: 300 }, true],
])('boosts %j warn: %s', (boosts, hasBoosts) => {
  expect(parseExport(wrap({ boosts }))).toMatchObject({ ok: true, village: { hasBoosts } });
});

describe('builder potion', () => {
  const offset = (extra: object) => jobs(wrap({ boosts: { builder_boost: 1049 }, ...extra }))[0].endsAt - T;

  test('a job longer than the potion loses nine seconds per potion second', () => {
    expect(offset({ buildings: [{ data: 1000000, lvl: 9, timer: 26867 }] })).toBe(17426);
  });

  test('a job shorter than the potion runs ten times faster', () => {
    expect(offset({ buildings: [{ data: 1000024, lvl: 6, timer: 5253 }] })).toBe(526);
  });

  test.each([[10490, 1049], [10491, 1050]])('at the edge of the potion, timer %i takes %i seconds', (timer, seconds) => {
    expect(offset({ buildings: [{ data: 1000000, lvl: 9, timer }] })).toBe(seconds);
  });

  test('covers traps, heroes and modules', () => {
    expect(offset({ traps: [{ data: 12000000, lvl: 8, timer: 20000 }] })).toBe(10559);
    expect(offset({ heroes: [{ data: 28000000, lvl: 50, timer: 20000 }] })).toBe(10559);
    expect(offset({ buildings: [{ data: 1000097, types: [{ data: 103000011, modules: [{ data: 102000033, lvl: 1, timer: 20000 }] }] }] })).toBe(10559);
  });

  test.each([
    ['research', { spells: [{ data: 26000009, lvl: 4, timer: 28209 }] }],
    ['pets', { pets: [{ data: 73000010, lvl: 1, timer: 28209 }] }],
    ['the Builder Base', { buildings2: [{ data: 1000041, lvl: 8, timer: 28209 }] }],
    ['helpers', { helpers: [{ data: 93000000, lvl: 2, helper_cooldown: 28209 }] }],
  ])('leaves %s alone', (_name, extra) => {
    expect(offset(extra)).toBe(28209);
  });

  test('no potion, or a value that is not a positive number, changes nothing', () => {
    const buildings = [{ data: 1000000, lvl: 9, timer: 26867 }];
    for (const boosts of [{}, { builder_boost: 0 }, { builder_boost: -5 }, { builder_boost: '1049' }]) {
      expect(jobs(wrap({ boosts, buildings }))[0].endsAt - T).toBe(26867);
    }
  });

  // Two real exports of one village, 442 seconds apart, with one potion running through both.
  test.each([
    ['Army Camp', 26867, 22501],
    ['Dark Elixir Storage', 5253, 887],
    ['Hero Hall', 48423, 44057],
  ])('two exports during one potion agree on when %s ends', (_name, first, second) => {
    const ends = (timestamp: number, timer: number, builder_boost: number) => jobs(JSON.stringify({
      tag: '#TEST123', timestamp, boosts: { builder_boost }, buildings: [{ data: 1000000, lvl: 9, timer }],
    }))[0].endsAt;
    expect(Math.abs(ends(1793947710, first, 1049) - ends(1793948152, second, 614))).toBeLessThanOrEqual(10);
  });
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
