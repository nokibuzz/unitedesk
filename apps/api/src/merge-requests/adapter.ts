import type { ReviewSnapshot } from './types.js';
import type { ReviewConnection } from '../settings/code-review.js';

export type ReviewSource = 'mock' | 'gitlab' | 'github';
export interface ReviewAdapter {
  source: ReviewSource;
  load(root: string, staleAfterDays: number, connection: ReviewConnection): Promise<ReviewSnapshot>;
}
