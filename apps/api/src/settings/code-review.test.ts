import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getReviewConnection, publicReviewConnection, saveReviewConnection } from './code-review.js';
import { getMergeRequests } from '../merge-requests/service.js';

test('code review settings switch providers, preserve tokens, and redact API responses', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-review-config-'));
  try {
    const first = await saveReviewConnection(root, { provider: 'gitlab', gitlab: { url: 'https://gitlab.example.test', group: 'team/platform', token: 'sample-gitlab-token' }, github: { apiUrl: 'https://api.github.com', owner: 'team', repos: '' } });
    assert.equal(first.provider, 'gitlab');
    assert.equal(first.gitlab.hasToken, true);
    assert.equal(JSON.stringify(first).includes('sample-gitlab-token'), false);
    const second = await saveReviewConnection(root, { provider: 'github', gitlab: { url: 'https://gitlab.example.test', group: 'team/platform', token: '' }, github: { apiUrl: 'https://api.github.com', owner: 'team', repos: 'team/app', token: 'sample-github-token' } });
    assert.equal(second.provider, 'github');
    assert.equal(second.github.hasToken, true);
    assert.equal(JSON.stringify(second).includes('sample-github-token'), false);
    const connection = await getReviewConnection(root);
    assert.equal(connection.gitlab.token, 'sample-gitlab-token');
    assert.equal(connection.github.token, 'sample-github-token');
    assert.equal(publicReviewConnection(connection).github.repos, 'team/app');
    const file = path.join(root, 'data', 'code-review-connection.json');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('code review settings reject unsafe URLs and missing selected credentials', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-review-config-'));
  try {
    await assert.rejects(saveReviewConnection(root, { provider: 'gitlab', gitlab: { url: 'https://user:secret@gitlab.example.test', group: 'team', token: 'sample' } }), /without credentials/);
    await assert.rejects(saveReviewConnection(root, { provider: 'github', github: { apiUrl: 'http://github.example.test', owner: 'team', repos: '', token: 'sample' } }), /HTTPS/);
    await assert.rejects(saveReviewConnection(root, { provider: 'github', github: { apiUrl: 'https://api.github.com', owner: 'team', repos: '', token: '' } }), /token is required/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('saved provider choice drives the existing Review Queue adapter without environment changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-review-config-'));
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.host === 'api.github.test') {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-github-token');
      seen.push('github');
      if (url.pathname === '/user') return Response.json({ login: 'alex' });
      if (url.pathname === '/user/repos') return Response.json([]);
    }
    if (url.host === 'gitlab.example.test') {
      assert.equal(new Headers(init?.headers).get('PRIVATE-TOKEN'), 'fixture-gitlab-token');
      seen.push('gitlab');
      if (url.pathname === '/api/v4/user') return Response.json({ username: 'alex' });
      if (url.pathname === '/api/v4/groups/team/merge_requests') return Response.json([]);
    }
    return new Response(null, { status: 404 });
  };
  try {
    await saveReviewConnection(root, { provider: 'github', github: { apiUrl: 'https://api.github.test', owner: 'team', repos: '', token: 'fixture-github-token' } });
    assert.equal((await getMergeRequests(root, true)).source, 'github');
    await saveReviewConnection(root, { provider: 'gitlab', gitlab: { url: 'https://gitlab.example.test', group: 'team', token: 'fixture-gitlab-token' } });
    assert.equal((await getMergeRequests(root, true)).source, 'gitlab');
    assert.deepEqual([...new Set(seen)], ['github', 'gitlab']);
  } finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); }
});
