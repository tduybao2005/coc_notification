import {
  remainingSeconds, formatRemaining, formatCountdown, formatEnd, formatAgo, deviceClockBehind, groupJobs,
} from '../src/core/time';
import type { Job } from '../src/core/types';

const T = 1793895122;
const job = (group: Job['group'], endsAt: number): Job => ({ id: endsAt, group, detail: { kind: 'build' }, endsAt });

test('remaining time counts down from the device clock and stops at zero', () => {
  expect(remainingSeconds(T + 100, (T + 30) * 1000)).toBe(70);
  expect(remainingSeconds(T + 100, (T + 500) * 1000)).toBe(0);
});

test.each([
  [400491, '4 ngày 15 giờ', '4d 15h'],
  [90061, '1 ngày 1 giờ', '1d 1h'],
  [54759, '15 giờ 12 phút', '15h 12m'],
  [3661, '1 giờ 1 phút', '1h 1m'],
  [86400, '1 ngày 0 giờ', '1d 0h'],
  [2712, '45 phút 12 giây', '45m 12s'],
  [60, '1 phút 0 giây', '1m 0s'],
  [59, '59 giây', '59s'],
  [12, '12 giây', '12s'],
  [0, 'Đã xong', 'Done'],
])('formats %i seconds', (seconds, vi, en) => {
  expect(formatRemaining(seconds, 'vi')).toBe(vi);
  expect(formatRemaining(seconds, 'en')).toBe(en);
});

test.each([
  [35992, '9:59:52', '9:59:52'], [303, '0:05:03', '0:05:03'], [86399, '23:59:59', '23:59:59'],
  [86400, '1 ngày 0 giờ', '1d 0h'], [0, 'Đã xong', 'Done'],
])('countdown %i', (seconds, vi, en) => {
  expect(formatCountdown(seconds, 'vi')).toBe(vi);
  expect(formatCountdown(seconds, 'en')).toBe(en);
});

test('end time follows the device time zone', () => {
  const endsAt = T + 54759;
  const vn = formatEnd(endsAt, 'vi', 'Asia/Ho_Chi_Minh');
  expect(vn).toContain('14:24');
  expect(vn).toContain('06/11');
  expect(formatEnd(endsAt, 'vi', 'UTC')).toContain('07:24');
});

test('end time keeps the same order in both languages', () => {
  expect(formatEnd(T + 54759, 'vi', 'Asia/Ho_Chi_Minh')).toBe('14:24 Thứ 6, 06/11');
  expect(formatEnd(T + 54759, 'en', 'Asia/Ho_Chi_Minh')).toBe('14:24 Fri, 06/11');
});

test.each([
  [30, 'vừa xong', 'just now'], [807, '13 phút trước', '13m ago'],
  [7200, '2 giờ trước', '2h ago'], [172800, '2 ngày trước', '2d ago'],
])('ago %i', (seconds, vi, en) => {
  expect(formatAgo(seconds, 'vi')).toBe(vi);
  expect(formatAgo(seconds, 'en')).toBe(en);
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
