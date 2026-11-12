import assert from 'node:assert/strict';
import test from 'node:test';
import { decorateItems, needsMyReview } from './model.js';
import { getMergeRequests } from './service.js';
import type { MergeRequest } from './types.js';

const viewer = { username: 'alex', name: 'Alex' };
const base: MergeRequest = {
  id: '1:3', iid: 3, projectId: 1, project: 'team/app', title: 'Add a feature', url: 'https://gitlab.test/team/app/-/merge_requests/3',
  author: { username: 'sam', name: 'Sam' }, reviewers: [viewer], approvedBy: [], sourceBranch: 'feature/one', targetBranch: 'main',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', draft: false, pipelineStatus: 'success', pipelineKnown: true,
  approval: { approved: false, required: 2, left: 2, userCanApprove: true, userHasApproved: false },
};
test('review queue includes eligible requests and excludes own, approved, and unknown approvals', () => {
  assert.equal(needsMyReview(base, viewer), true);
  assert.equal(needsMyReview({ ...base, author: viewer }, viewer), false);
  assert.equal(needsMyReview({ ...base, approvedBy: [viewer] }, viewer), false);
  assert.equal(needsMyReview({ ...base, approval: { ...base.approval, approved: null } }, viewer), false);
  assert.equal(needsMyReview({ ...base, approval: { ...base.approval, userCanApprove: false } }, viewer), false);
  assert.equal(needsMyReview({ ...base, reviewers: [], approval: { ...base.approval, left: null } }, viewer), false);
  assert.equal(needsMyReview({ ...base, reviewers: [], approval: { ...base.approval, left: 1 } }, viewer), true);
  const [item] = decorateItems([base], viewer, 2, Date.parse('2026-01-04T00:00:00Z'));
  assert.equal(item.waitingForMe, true);
  assert.equal(item.aging, true);
});

test('GitLab live mode reads group MRs, current user, approval, and pipeline details', async () => {
  const originalFetch = globalThis.fetch;
  const originals = Object.fromEntries(['GITLAB_MODE', 'GITLAB_URL', 'GITLAB_GROUP', 'GITLAB_TOKEN'].map((key) => [key, process.env[key]]));
  process.env.GITLAB_MODE = 'gitlab'; process.env.GITLAB_URL = 'https://gitlab.test/gitlab'; process.env.GITLAB_GROUP = 'team'; process.env.GITLAB_TOKEN = 'test-token';
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    assert.equal(new Headers(init?.headers).get('PRIVATE-TOKEN'), 'test-token');
    if (url.pathname === '/gitlab/api/v4/user') return Response.json(viewer);
    if (url.pathname === '/gitlab/api/v4/groups/team/merge_requests') return Response.json([{
      iid: 3, project_id: 1, title: 'Add a feature', web_url: 'https://gitlab.test/gitlab/team/app/-/merge_requests/3', created_at: base.createdAt, updated_at: base.updatedAt,
      source_branch: base.sourceBranch, target_branch: base.targetBranch, author: base.author, reviewers: [viewer],
    }]);
    if (url.pathname === '/gitlab/api/v4/projects/1/merge_requests/3/approvals') return Response.json({ approved: false, approvals_required: 2, approvals_left: 1, approved_by: [{ user: { username: 'lee', name: 'Lee' } }], user_can_approve: true, user_has_approved: false });
    if (url.pathname === '/gitlab/api/v4/projects/1/merge_requests/3') return Response.json({ head_pipeline: { status: 'running' } });
    return new Response(null, { status: 404 });
  };
  try {
    const result = await getMergeRequests(process.cwd(), true);
    assert.equal(result.source, 'gitlab');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].pipelineStatus, 'running');
    assert.equal(result.items[0].pipelineKnown, true);
    assert.equal(result.items[0].approval.left, 1);
    assert.equal(result.items[0].waitingForMe, true);
    assert.equal(result.items[0].project, 'team/app');
    assert.ok(calls.includes('/gitlab/api/v4/projects/1/merge_requests/3/approvals'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
