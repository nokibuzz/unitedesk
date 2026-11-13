import type { ReviewSnapshot } from './types.js';

export type ReviewSource = 'mock' | 'gitlab' | 'github';
export interface ReviewAdapter {
  source: ReviewSource;
  load(root: string, staleAfterDays: number): Promise<ReviewSnapshot>;
}
