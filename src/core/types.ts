export type Group = 'home-build' | 'home-hero' | 'lab' | 'pet'
  | 'builder-build' | 'builder-lab' | 'helper' | 'other';
export interface Job { id: number; parentId?: number; group: Group; detail: string; endsAt: number } // endsAt: Unix giây
export interface Village { tag: string; exportedAt: number; jobs: Job[]; hasBoosts: boolean }
