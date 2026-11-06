import type { Language } from './language';
import type { Group, Job } from './types';

export const GROUP_ORDER: Group[] = [
  'home-build', 'home-hero', 'lab', 'pet', 'builder-build', 'builder-lab', 'helper', 'other',
];

const CLOCK_SKEW_SECONDS = 120;

export function remainingSeconds(endsAt: number, nowMs: number): number {
  return Math.max(0, Math.ceil(endsAt - nowMs / 1000));
}

export function formatRemaining(seconds: number, lang: Language): string {
  const total = Math.floor(seconds);
  const vi = lang === 'vi';
  if (total <= 0) return vi ? 'Đã xong' : 'Done';
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return vi ? `${d} ngày ${h} giờ` : `${d}d ${h}h`;
  if (h > 0) return vi ? `${h} giờ ${m} phút` : `${h}h ${m}m`;
  if (m > 0) return vi ? `${m} phút ${s} giây` : `${m}m ${s}s`;
  return vi ? `${s} giây` : `${s}s`;
}

// H:MM:SS under 24 hours; from 24 hours up, and when finished, the same text as formatRemaining.
export function formatCountdown(seconds: number, lang: Language): string {
  const total = Math.floor(seconds);
  if (total <= 0 || total >= 86400) return formatRemaining(total, lang);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Same order in both languages (time, weekday, day/month); only the wording of the weekday differs.
export function formatEnd(endsAt: number, lang: Language, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(endsAt * 1000));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')} ${part('weekday')}, ${part('day')}/${part('month')}`;
}

export function formatAgo(seconds: number, lang: Language): string {
  const vi = lang === 'vi';
  if (seconds < 60) return vi ? 'vừa xong' : 'just now';
  if (seconds < 3600) {
    const n = Math.floor(seconds / 60);
    return vi ? `${n} phút trước` : `${n}m ago`;
  }
  if (seconds < 86400) {
    const n = Math.floor(seconds / 3600);
    return vi ? `${n} giờ trước` : `${n}h ago`;
  }
  const n = Math.floor(seconds / 86400);
  return vi ? `${n} ngày trước` : `${n}d ago`;
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
