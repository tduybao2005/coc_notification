import names from '../generated/names.json';
import type { Job } from './types';

const table: Record<string, string> = names;

export function nameOf(id: number): string {
  return table[String(id)] ?? `Không rõ (#${id})`;
}

export function jobName(job: Pick<Job, 'id' | 'parentId'>): string {
  return job.parentId === undefined ? nameOf(job.id) : `${nameOf(job.parentId)} — ${nameOf(job.id)}`;
}
