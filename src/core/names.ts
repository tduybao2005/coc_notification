import names from '../generated/names.json';
import type { Language } from './language';
import type { Job, JobDetail } from './types';

const table: Record<string, string> = names;

export function nameOf(id: number): string {
  return table[String(id)] ?? `Không rõ (#${id})`;
}

export function jobName(job: Pick<Job, 'id' | 'parentId'>): string {
  return job.parentId === undefined ? nameOf(job.id) : `${nameOf(job.parentId)} — ${nameOf(job.id)}`;
}

export function jobDetailText(detail: JobDetail, lang: Language): string {
  const vi = lang === 'vi';
  switch (detail.kind) {
    case 'upgrade': return `${vi ? 'Cấp' : 'Level'} ${detail.level} → ${detail.level + 1}`;
    case 'weapon': return `${vi ? 'Cấp' : 'Level'} ${detail.level} · ${vi ? 'Vũ khí' : 'Weapon'} ${detail.weapon}`;
    case 'build': return vi ? 'Xây mới' : 'New build';
    case 'cooldown': return vi ? 'Hồi chiêu' : 'Cooldown';
  }
}
