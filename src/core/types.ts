export type Group = 'home-build' | 'home-hero' | 'lab' | 'pet'
  | 'builder-build' | 'builder-lab' | 'helper' | 'other';
export type JobDetail =
  | { kind: 'upgrade'; level: number }
  | { kind: 'weapon'; level: number; weapon: number }
  | { kind: 'build' }
  | { kind: 'cooldown' };
export interface Job { id: number; parentId?: number; group: Group; detail: JobDetail; endsAt: number } // endsAt: Unix giây
export interface Village { tag: string; exportedAt: number; jobs: Job[]; hasBoosts: boolean }
