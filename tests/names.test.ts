import names from '../src/generated/names.json';
import { nameOf, jobName, jobDetailText } from '../src/core/names';

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

test.each([
  [{ kind: 'upgrade', level: 6 }, 'Cấp 6 → 7', 'Level 6 → 7'],
  [{ kind: 'weapon', level: 3, weapon: 2 }, 'Cấp 3 · Vũ khí 2', 'Level 3 · Weapon 2'],
  [{ kind: 'build' }, 'Xây mới', 'New build'],
  [{ kind: 'cooldown' }, 'Hồi chiêu', 'Cooldown'],
] as const)('detail %j reads in both languages', (detail, vi, en) => {
  expect(jobDetailText(detail, 'vi')).toBe(vi);
  expect(jobDetailText(detail, 'en')).toBe(en);
});
