import type { GitLabPerson, MergeRequest, ReviewItem } from './types.js';

function sameUser(a: string, b: string): boolean { return a.trim().toLowerCase() === b.trim().toLowerCase(); }
export function isMine(item: MergeRequest, viewer: GitLabPerson): boolean {
  return sameUser(item.author.username, viewer.username);
}
export function needsMyReview(item: MergeRequest, viewer: GitLabPerson): boolean {
  if (isMine(item, viewer) || item.approval.approved === true || item.approval.userHasApproved === true) return false;
  if (item.approval.approved === null || item.approvedBy.some((person) => sameUser(person.username, viewer.username))) return false;
  if (item.approval.userCanApprove === false || item.approval.left === 0) return false;
  const assignedReviewer = item.reviewers.some((person) => sameUser(person.username, viewer.username));
  const eligibleForRequiredApproval = item.approval.left != null && item.approval.left > 0 && item.approval.userCanApprove === true;
  return assignedReviewer || eligibleForRequiredApproval;
}
export function isStale(item: MergeRequest, days: number, now: number): boolean {
  const created = Date.parse(item.createdAt);
  return Number.isFinite(created) && now - created >= days * 86_400_000;
}
export function decorateItems(items: MergeRequest[], viewer: GitLabPerson, staleAfterDays: number, now: number): ReviewItem[] {
  return items.map((item) => ({ ...item, mine: isMine(item, viewer), waitingForMe: needsMyReview(item, viewer), aging: isStale(item, staleAfterDays, now) }));
}
