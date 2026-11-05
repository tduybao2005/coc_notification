import type { Group, Job } from './types';

export const GROUP_ORDER: Group[] = [
  'home-build', 'home-hero', 'lab', 'pet', 'builder-build', 'builder-lab', 'helper', 'other',
];

const CLOCK_SKEW_SECONDS = 120;

export function remainingSeconds(endsAt: number, nowMs: number): number {
  return Math.max(0, Math.ceil(endsAt - nowMs / 1000));
}

export function formatRemaining(seconds: number): string {
  const total = Math.floor(seconds);
  if (total <= 0) return 'Đã xong';
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d} ngày ${h} giờ ${m} phút`;
  if (h > 0) return `${h} giờ ${m} phút ${s} giây`;
  if (m > 0) return `${m} phút ${s} giây`;
  return `${s} giây`;
}

export function formatEnd(endsAt: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(endsAt * 1000));
}

export function formatAgo(seconds: number): string {
  if (seconds < 60) return 'vừa xong';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
  return `${Math.floor(seconds / 86400)} ngày trước`;
}

export function deviceClockBehind(exportedAt: number, nowMs: number): boolean {
  return exportedAt - nowMs / 1000 > CLOCK_SKEW_SECONDS;
}

export function groupJobs(jobs: Job[], nowMs: number): { group: Group; jobs: Job[] }[] {
  return GROUP_ORDER.map((group) => {
    const inGroup = jobs.filter((j) => j.group === group);
    const running = inGroup.filter((j) => remainingSeconds(j.endsAt, nowMs) > 0);
    const finished = inGroup.filter((j) => remainingSeconds(j.endsAt, nowMs) === 0);
    const byEnd = (a: Job, b: Job) => a.endsAt - b.endsAt;
    return { group, jobs: [...running.sort(byEnd), ...finished.sort(byEnd)] };
  }).filter((g) => g.jobs.length > 0);
}
