import type { Group, Job, JobDetail, Village } from './types';

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

// A Builder Potion makes Home Village builders work ten times faster, and `timer` is the time left at
// normal speed. Measured on two exports of one village 442 seconds apart during a potion: building
// timers fell by 4366, research by 442, and builder_boost counted down in seconds.
const BUILDER_POTION_SPEED = 10;
const POTION_GROUPS: ReadonlySet<Group> = new Set<Group>(['home-build', 'home-hero']);

// Entries of `boosts` that need no warning: the potion is counted in, the other is only a wait.
const COUNTED_BOOSTS: ReadonlySet<string> = new Set(['builder_boost', 'clocktower_cooldown']);

// Real seconds until a timer ends with `boost` seconds of potion left.
function secondsWithPotion(timer: number, boost: number): number {
  const covered = boost * BUILDER_POTION_SPEED;
  return timer <= covered ? Math.ceil(timer / BUILDER_POTION_SPEED) : timer - covered + boost;
}

function detailOf(node: Record<string, unknown>, group: Group): JobDetail {
  if (group === 'helper') return { kind: 'cooldown' };
  const level = typeof node.lvl === 'number' ? node.lvl : 0;
  if (typeof node.weapon === 'number') return { kind: 'weapon', level, weapon: node.weapon };
  if (level === 0) return { kind: 'build' };
  return { kind: 'upgrade', level };
}

type EndOf = (group: Group, seconds: number) => number;

function collectJobs(node: unknown, group: Group, parentId: number | undefined, endOf: EndOf, out: Job[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJobs(item, group, parentId, endOf, out);
    return;
  }
  if (!isRecord(node)) return;

  const id = typeof node.data === 'number' ? node.data : 0;
  const base = { id, ...(parentId === undefined ? {} : { parentId }) };
  if (positive(node.timer)) {
    out.push({ ...base, group, detail: detailOf(node, group), endsAt: endOf(group, node.timer) });
  }
  if (positive(node.helper_cooldown)) {
    out.push({ ...base, group: 'helper', detail: detailOf(node, 'helper'), endsAt: endOf('helper', node.helper_cooldown) });
  }

  const childParent = typeof node.data === 'number' ? node.data : parentId;
  for (const value of Object.values(node)) {
    if (typeof value === 'object' && value !== null) collectJobs(value, group, childParent, endOf, out);
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

  const { timestamp } = data;
  const boosts = isRecord(data.boosts) ? data.boosts : {};
  const potion = positive(boosts.builder_boost) ? boosts.builder_boost : 0;
  const endOf: EndOf = (group, seconds) =>
    timestamp + (POTION_GROUPS.has(group) ? secondsWithPotion(seconds, potion) : seconds);

  const jobs: Job[] = [];
  for (const [section, value] of Object.entries(data)) {
    if (Array.isArray(value)) collectJobs(value, SECTION_GROUPS[section] ?? 'other', undefined, endOf, jobs);
  }

  const hasBoosts = Object.keys(boosts).some((key) => !COUNTED_BOOSTS.has(key));
  return { ok: true, village: { tag: data.tag, exportedAt: timestamp, jobs, hasBoosts } };
}
