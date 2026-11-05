import type { Group, Job, Village } from './types';

export type ParseError = 'empty' | 'not-json' | 'not-export';
export type ParseResult = { ok: true; village: Village } | { ok: false; error: ParseError };

const SECTION_GROUPS: Record<string, Group> = {
  buildings: 'home-build',
  traps: 'home-build',
  heroes: 'home-hero',
  units: 'lab',
  spells: 'lab',
  siege_machines: 'lab',
  pets: 'pet',
  buildings2: 'builder-build',
  traps2: 'builder-build',
  heroes2: 'builder-build',
  units2: 'builder-lab',
  helpers: 'helper',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

function detailOf(node: Record<string, unknown>, group: Group): string {
  if (group === 'helper') return 'Hồi chiêu';
  const lvl = typeof node.lvl === 'number' ? node.lvl : 0;
  if (node.weapon !== undefined && node.weapon !== null) return `Cấp ${lvl} · Vũ khí ${node.weapon}`;
  if (lvl === 0) return 'Xây mới';
  return `Cấp ${lvl} → ${lvl + 1}`;
}

function collectJobs(node: unknown, group: Group, parentId: number | undefined, timestamp: number, out: Job[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJobs(item, group, parentId, timestamp, out);
    return;
  }
  if (!isRecord(node)) return;

  const id = typeof node.data === 'number' ? node.data : 0;
  const base = { id, ...(parentId === undefined ? {} : { parentId }) };
  if (positive(node.timer)) {
    out.push({ ...base, group, detail: detailOf(node, group), endsAt: timestamp + node.timer });
  }
  if (positive(node.helper_cooldown)) {
    out.push({ ...base, group: 'helper', detail: detailOf(node, 'helper'), endsAt: timestamp + node.helper_cooldown });
  }

  const childParent = typeof node.data === 'number' ? node.data : parentId;
  for (const value of Object.values(node)) {
    if (typeof value === 'object' && value !== null) collectJobs(value, group, childParent, timestamp, out);
  }
}

export function parseExport(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end < start) return { ok: false, error: 'not-json' };

  let data: unknown;
  try {
    data = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return { ok: false, error: 'not-json' };
  }

  if (!isRecord(data) || typeof data.tag !== 'string' || !/^#[0-9A-Z]+$/.test(data.tag) || !positive(data.timestamp)) {
    return { ok: false, error: 'not-export' };
  }

  const jobs: Job[] = [];
  for (const [section, value] of Object.entries(data)) {
    if (Array.isArray(value)) collectJobs(value, SECTION_GROUPS[section] ?? 'other', undefined, data.timestamp, jobs);
  }

  const hasBoosts = typeof data.boosts === 'object' && data.boosts !== null && Object.keys(data.boosts).length > 0;
  return { ok: true, village: { tag: data.tag, exportedAt: data.timestamp, jobs, hasBoosts } };
}
