import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMergeRequests, pipelineValue, type ReviewFilters } from '../src/features/reviews/filter.js';
import type { MergeRequest } from '../src/features/reviews/types.js';

const base: MergeRequest = {
  id: '1:1', iid: 1, projectId: 1, project: 'team/app', title: 'Add search', url: 'https://gitlab.test/team/app/-/merge_requests/1',
  author: { username: 'alex', name: 'Alex' }, reviewers: [{ username: 'sam', name: 'Sam' }], approvedBy: [],
  sourceBranch: 'feature/search', targetBranch: 'main', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z',
  draft: false, pipelineStatus: 'success', pipelineKnown: true,
  approval: { approved: false, required: 1, left: 1, userCanApprove: false, userHasApproved: false },
  mine: true, waitingForMe: false, aging: true,
};
const other: MergeRequest = {
  ...base, id: '2:2', iid: 2, projectId: 2, project: 'team/api', title: 'Fix API',
  author: { username: 'sam', name: 'Sam' }, reviewers: [{ username: 'alex', name: 'Alex' }],
  createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', pipelineStatus: null, pipelineKnown: false,
  approval: { ...base.approval, approved: null }, mine: false, waitingForMe: true, aging: false,
};
const defaults: ReviewFilters = { view: 'all', search: '', author: '', reviewer: '', project: '', target: '', pipeline: '', approval: 'all', sort: 'oldest' };
test('quick views and person filters combine without changing source data', () => {
  assert.deepEqual(filterMergeRequests([base, other], { ...defaults, view: 'mine' }).map((item) => item.id), ['1:1']);
  assert.deepEqual(filterMergeRequests([base, other], { ...defaults, view: 'review', reviewer: 'alex' }).map((item) => item.id), ['2:2']);
  assert.deepEqual(filterMergeRequests([base, other], { ...defaults, author: 'alex', reviewer: 'alex' }), []);
});
test('pipeline, approval, search, and sort work together', () => {
  assert.equal(pipelineValue(other), 'unavailable');
  assert.deepEqual(filterMergeRequests([base, other], { ...defaults, pipeline: 'unavailable', approval: 'unknown', search: 'api' }).map((item) => item.id), ['2:2']);
  assert.deepEqual(filterMergeRequests([base, other], { ...defaults, sort: 'newest' }).map((item) => item.id), ['2:2', '1:1']);
});
