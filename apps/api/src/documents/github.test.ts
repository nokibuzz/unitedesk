import assert from 'node:assert/strict';
import test from 'node:test';
import { githubDocumentsAdapter } from './github.js';

test('GitHub Markdown adapter builds a folder tree, searches text, and sanitizes preview', async () => {
  const names = ['GITHUB_API_URL', 'GITHUB_TOKEN', 'GITHUB_DOCS_REPOS', 'GITHUB_DOCS_PATHS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  process.env.GITHUB_API_URL = 'https://api.github.test';
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_DOCS_REPOS = 'team/handbook';
  process.env.GITHUB_DOCS_PATHS = 'docs/';
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    if (url.pathname === '/repos/team/handbook') return Response.json({ full_name: 'team/handbook', default_branch: 'main', html_url: 'https://github.test/team/handbook' });
    if (url.pathname === '/repos/team/handbook/git/trees/main') return Response.json({ tree: [
      { path: 'docs/README.md', type: 'blob', sha: 'abc', size: 50 },
      { path: 'docs/guides/onboarding.md', type: 'blob', sha: 'def', size: 100 },
      { path: 'src/index.ts', type: 'blob', sha: 'ghi', size: 30 },
    ], truncated: false });
    if (url.pathname === '/repos/team/handbook/git/blobs/abc') return Response.json({ encoding: 'base64', size: 20, content: Buffer.from('# Documentation').toString('base64') });
    if (url.pathname === '/repos/team/handbook/git/blobs/def') return Response.json({ encoding: 'base64', size: 100,
      content: Buffer.from('# Onboarding\n\nRead the [guide](../README.md). <script>alert(1)</script>').toString('base64') });
    return new Response(null, { status: 404 });
  };
  try {
    const snapshot = await githubDocumentsAdapter.load();
    assert.equal(snapshot.spaces.length, 1);
    assert.equal(snapshot.pages.filter((page) => page.kind === 'folder').length, 2);
    const guide = snapshot.pages.find((page) => page.title === 'onboarding');
    assert.ok(guide);
    assert.ok(guide.parentId);
    const found = await githubDocumentsAdapter.search('onboarding');
    assert.equal(found.results.length, 1);
    assert.equal(found.results[0].id, guide.id);
    const preview = await githubDocumentsAdapter.getPage(guide.id);
    assert.match(preview.html, /https:\/\/github\.test\/team\/handbook\/blob\/main\/docs\/README\.md/);
    assert.doesNotMatch(preview.html, /<script/);
    await assert.rejects(() => githubDocumentsAdapter.getPage('file.bad'), /Invalid GitHub document ID/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
