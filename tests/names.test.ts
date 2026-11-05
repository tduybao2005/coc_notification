import names from '../src/generated/names.json';
import { nameOf, jobName } from '../src/core/names';

test('names table covers real export ids', () => {
  expect(Object.keys(names).length).toBeGreaterThanOrEqual(250);
  expect(nameOf(1000026)).toBe('Dark Barracks');
  expect(nameOf(4000023)).toBe('Baby Dragon');
  expect(nameOf(73000010)).toBe('Spirit Fox');
  expect(nameOf(4000042)).toBe('Night Witch');
  expect(nameOf(93000000)).toBe("Builder's Apprentice");
});

test('unknown id falls back without throwing', () => {
  expect(nameOf(999)).toBe('Không rõ (#999)');
});

test('nested job is named with its parent', () => {
  expect(jobName({ id: 102000033, parentId: 103000011 })).toBe('Hot Candle — Hitpoints');
  expect(jobName({ id: 1000026 })).toBe('Dark Barracks');
});
