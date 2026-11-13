export interface GitLabPerson { username: string; name: string }
export interface MergeRequest {
  id: string;
  iid: number;
  projectId: number;
  project: string;
  title: string;
  url: string;
  author: GitLabPerson;
  reviewers: GitLabPerson[];
  approvedBy: GitLabPerson[];
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  pipelineStatus: string | null;
  pipelineKnown: boolean;
  approval: { approved: boolean | null; required: number | null; left: number | null; userCanApprove: boolean | null; userHasApproved: boolean | null };
}
export interface ReviewItem extends MergeRequest { mine: boolean; waitingForMe: boolean; aging: boolean }
export interface ReviewSnapshot {
  source: 'mock' | 'gitlab' | 'github';
  fetchedAt: string;
  group: string;
  viewer: GitLabPerson;
  staleAfterDays: number;
  items: ReviewItem[];
}
