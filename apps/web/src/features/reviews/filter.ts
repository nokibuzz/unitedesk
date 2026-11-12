import type { MergeRequest } from './types';

export type View = 'all' | 'mine' | 'review' | 'aging';
export type ApprovalFilter = 'all' | 'approved' | 'needed' | 'unknown';
export type Sort = 'oldest' | 'newest' | 'updated';
export interface ReviewFilters {
  view: View; search: string; author: string; reviewer: string; project: string;
  target: string; pipeline: string; approval: ApprovalFilter; sort: Sort;
}
export function pipelineValue(item: MergeRequest): string {
  return item.pipelineKnown ? item.pipelineStatus ?? 'none' : 'unavailable';
}
export function filterMergeRequests(items: MergeRequest[], filters: ReviewFilters): MergeRequest[] {
  const term = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.view === 'mine' && !item.mine) return false;
    if (filters.view === 'review' && !item.waitingForMe) return false;
    if (filters.view === 'aging' && !item.aging) return false;
    if (filters.author && item.author.username !== filters.author) return false;
    if (filters.reviewer && !item.reviewers.some((person) => person.username === filters.reviewer)) return false;
    if (filters.project && item.project !== filters.project) return false;
    if (filters.target && item.targetBranch !== filters.target) return false;
    if (filters.pipeline && pipelineValue(item) !== filters.pipeline) return false;
    if (filters.approval === 'approved' && item.approval.approved !== true) return false;
    if (filters.approval === 'needed' && item.approval.approved !== false) return false;
    if (filters.approval === 'unknown' && item.approval.approved !== null) return false;
    return !term || [item.title, item.project, item.sourceBranch, item.targetBranch, item.author.name, item.author.username, String(item.iid)]
      .some((value) => value.toLowerCase().includes(term));
  }).sort((a, b) => {
    const timeA = Date.parse(filters.sort === 'updated' ? a.updatedAt : a.createdAt);
    const timeB = Date.parse(filters.sort === 'updated' ? b.updatedAt : b.createdAt);
    const safeA = Number.isFinite(timeA) ? timeA : 0;
    const safeB = Number.isFinite(timeB) ? timeB : 0;
    return filters.sort === 'oldest' ? safeA - safeB : safeB - safeA;
  });
}
