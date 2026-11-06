import names from '../generated/names.json';
import type { Language } from './language';
import type { Job, JobDetail } from './types';

const table: Record<string, string> = names;

// Item names exist in English only; the language only changes the fallback for an id that is not in the table.
export function nameOf(id: number, lang: Language): string {
  return table[String(id)] ?? `${lang === 'vi' ? 'Không rõ' : 'Unknown'} (#${id})`;
}

export function jobName(job: Pick<Job, 'id' | 'parentId'>, lang: Language): string {
  return job.parentId === undefined
    ? nameOf(job.id, lang)
    : `${nameOf(job.parentId, lang)} — ${nameOf(job.id, lang)}`;
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
