export interface Person { username: string; name: string }
export interface MergeRequest {
  id: string; iid: number; projectId: number; project: string; title: string; url: string;
  author: Person; reviewers: Person[]; approvedBy: Person[];
  sourceBranch: string; targetBranch: string; createdAt: string; updatedAt: string;
  draft: boolean; pipelineStatus: string | null; pipelineKnown: boolean;
  approval: { approved: boolean | null; required: number | null; left: number | null; userCanApprove: boolean | null; userHasApproved: boolean | null };
  mine: boolean; waitingForMe: boolean; aging: boolean;
}
export interface ReviewSnapshot {
  source: 'mock' | 'gitlab'; fetchedAt: string; group: string; viewer: Person; staleAfterDays: number; items: MergeRequest[];
}
