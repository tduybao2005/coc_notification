import { remainingSeconds, formatRemaining, formatEnd, formatAgo, deviceClockBehind, groupJobs } from '../src/core/time';
import type { Job } from '../src/core/types';

const T = 1793895122;
const job = (group: Job['group'], endsAt: number): Job => ({ id: endsAt, group, detail: { kind: 'build' }, endsAt });

test('remaining time counts down from the device clock and stops at zero', () => {
  expect(remainingSeconds(T + 100, (T + 30) * 1000)).toBe(70);
  expect(remainingSeconds(T + 100, (T + 500) * 1000)).toBe(0);
});

test.each([
  [400491, '4 ngày 15 giờ 14 phút'],
  [54759, '15 giờ 12 phút 39 giây'],
  [86400, '1 ngày 0 giờ 0 phút'],
  [60, '1 phút 0 giây'],
  [59, '59 giây'],
  [0, 'Đã xong'],
])('formats %i seconds', (seconds, text) => {
  expect(formatRemaining(seconds)).toBe(text);
});

test('end time follows the device time zone', () => {
  const endsAt = T + 54759;
  const vn = formatEnd(endsAt, 'Asia/Ho_Chi_Minh');
  expect(vn).toContain('14:24');
  expect(vn).toContain('06/11');
  expect(formatEnd(endsAt, 'UTC')).toContain('07:24');
});

test.each([
  [30, 'vừa xong'], [807, '13 phút trước'], [7200, '2 giờ trước'], [172800, '2 ngày trước'],
])('ago %i', (seconds, text) => {
  expect(formatAgo(seconds)).toBe(text);
});

test('detects a device clock behind the export time', () => {
  expect(deviceClockBehind(T, (T - 121) * 1000)).toBe(true);
  expect(deviceClockBehind(T, (T - 120) * 1000)).toBe(false);
  expect(deviceClockBehind(T, (T + 900) * 1000)).toBe(false);
});

test('groups in fixed order, soonest first, finished last, no empty groups', () => {
  const now = (T + 50) * 1000;
  const a = job('lab', T + 900);
  const b = job('home-build', T + 500);
  const c = job('home-build', T + 100);
  const done = job('home-build', T + 10);
  expect(groupJobs([a, b, done, c], now)).toEqual([
    { group: 'home-build', jobs: [c, b, done] },
    { group: 'lab', jobs: [a] },
  ]);
});
