import assert from 'node:assert/strict';
import test from 'node:test';
import { getDocumentPage, getDocuments, searchDocuments } from './service.js';

test('Knowledge combines providers without mixing document IDs or links', async () => {
  const names = ['DOCUMENTATION_PROVIDERS', 'DOCUMENTATION_PROVIDER', 'CONFLUENCE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN', 'CONFLUENCE_SPACE_KEYS', 'GITHUB_API_URL', 'GITHUB_TOKEN', 'GITHUB_DOCS_REPOS', 'GITHUB_DOCS_PATHS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, { DOCUMENTATION_PROVIDERS: 'confluence,github', CONFLUENCE_URL: 'https://docs.test', CONFLUENCE_EMAIL: 'alex@example.test', CONFLUENCE_API_TOKEN: 'sample', CONFLUENCE_SPACE_KEYS: 'TEAM',
    GITHUB_API_URL: 'https://api.github.test', GITHUB_TOKEN: 'sample', GITHUB_DOCS_REPOS: 'team/handbook', GITHUB_DOCS_PATHS: 'docs/' });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'docs.test') {
      if (url.pathname === '/wiki/rest/api/space') return Response.json({ results: [{ key: 'TEAM', name: 'Team', type: 'global', _links: { webui: '/spaces/TEAM' } }] });
      if (url.pathname === '/wiki/rest/api/content' && !url.pathname.includes('/1')) return Response.json({ results: [{ id: '1', title: 'Guide', _links: { webui: '/spaces/TEAM/pages/1/Guide' } }] });
      if (url.pathname === '/wiki/rest/api/content/1') return Response.json({ id: '1', title: 'Guide', space: { key: 'TEAM' }, body: { view: { value: '<p>Confluence guide</p>' } }, _links: { webui: '/spaces/TEAM/pages/1/Guide' } });
      if (url.pathname === '/wiki/rest/api/search') return Response.json({ results: [{ content: { id: '1', title: 'Guide', type: 'page', space: { key: 'TEAM', name: 'Team' }, _links: { webui: '/spaces/TEAM/pages/1/Guide' } } }] });
    }
    if (url.hostname === 'api.github.test') {
      if (url.pathname === '/repos/team/handbook') return Response.json({ full_name: 'team/handbook', default_branch: 'main', html_url: 'https://github.test/team/handbook' });
      if (url.pathname === '/repos/team/handbook/git/trees/main') return Response.json({ tree: [{ path: 'docs/guide.md', type: 'blob', sha: 'abc', size: 20 }], truncated: false });
      if (url.pathname === '/repos/team/handbook/git/blobs/abc') return Response.json({ encoding: 'base64', size: 20, content: Buffer.from('# Guide\n\nMarkdown guide').toString('base64') });
    }
    return new Response(null, { status: 404 });
  };
  try {
    const snapshot = await getDocuments();
    assert.equal(snapshot.source, 'mixed');
    assert.equal(snapshot.spaces.length, 2);
    const confluence = snapshot.pages.find((page) => page.source === 'confluence');
    const github = snapshot.pages.find((page) => page.source === 'github' && page.kind !== 'folder');
    assert.ok(confluence);
    assert.ok(confluence.id.startsWith('confluence:'));
    assert.ok(github);
    assert.ok(github.id.startsWith('github:'));
    const found = await searchDocuments('guide');
    assert.deepEqual(new Set(found.results.map((item) => item.source)), new Set(['confluence', 'github']));
    const preview = await getDocumentPage(github.id);
    assert.equal(preview.source, 'github');
    assert.equal(preview.id, github.id);
    assert.equal(preview.spaceKey, github.spaceKey);
    process.env.DOCUMENTATION_PROVIDERS = 'github,notion';
    await assert.rejects(() => getDocumentPage(confluence.id), /not enabled/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
