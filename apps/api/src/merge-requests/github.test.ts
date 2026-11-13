import assert from 'node:assert/strict';
import test from 'node:test';
import { getMergeRequests } from './service.js';

test('GitHub adapter discovers repositories and feeds the existing review filters', async () => {
  const previous = Object.fromEntries(['CODE_REVIEW_PROVIDER', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_API_URL', 'GITHUB_REPOS'].map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  process.env.CODE_REVIEW_PROVIDER = 'github'; process.env.GITHUB_TOKEN = 'local-test'; process.env.GITHUB_OWNER = 'team';
  delete process.env.GITHUB_API_URL; delete process.env.GITHUB_REPOS;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer local-test');
    if (url.pathname === '/user') return Response.json({ login: 'alex', name: 'Alex' });
    if (url.pathname === '/user/repos') return Response.json([
      { id: 1, name: 'app', full_name: 'team/app', owner: { login: 'team' } },
      { id: 2, name: 'other', full_name: 'other/other', owner: { login: 'other' } },
    ]);
    if (url.pathname === '/repos/team/app/pulls') return Response.json([{
      number: 7, title: 'Add a view', html_url: 'https://github.test/team/app/pull/7',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', draft: false,
      user: { login: 'sam' }, requested_reviewers: [{ login: 'alex' }], head: { ref: 'feature', sha: 'abc' }, base: { ref: 'main' },
    }]);
    if (url.pathname === '/repos/team/app/pulls/7/reviews') return Response.json([]);
    if (url.pathname === '/repos/team/app/commits/abc/status') return Response.json({ state: 'pending', total_count: 0 });
    if (url.pathname === '/repos/team/app/commits/abc/check-runs') return Response.json({ check_runs: [{ status: 'completed', conclusion: 'success' }] });
    return new Response(null, { status: 404 });
  };
  try {
    const snapshot = await getMergeRequests(process.cwd(), true);
    assert.equal(snapshot.source, 'github');
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].project, 'team/app');
    assert.equal(snapshot.items[0].waitingForMe, true);
    assert.equal(snapshot.items[0].pipelineStatus, 'success');
    assert.ok(!calls.includes('/repos/other/other/pulls'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
