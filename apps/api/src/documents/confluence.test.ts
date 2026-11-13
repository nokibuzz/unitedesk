import assert from 'node:assert/strict';
import test from 'node:test';
import { getDocumentPage, getDocuments, searchDocuments } from './service.js';

test('Confluence adapter discovers selected spaces and pages with source links', async () => {
  const names = ['CONFLUENCE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN', 'CONFLUENCE_SPACE_KEYS', 'DOCUMENTATION_PROVIDER'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  process.env.CONFLUENCE_URL = 'https://docs.test'; process.env.CONFLUENCE_EMAIL = 'alex@example.test';
  process.env.CONFLUENCE_API_TOKEN = 'test-token'; process.env.CONFLUENCE_SPACE_KEYS = 'TEAM';
  process.env.DOCUMENTATION_PROVIDER = 'confluence';
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(new Headers(init?.headers).get('Authorization'), `Basic ${Buffer.from('alex@example.test:test-token').toString('base64')}`);
    if (url.pathname === '/wiki/rest/api/space') return Response.json({ results: [
      { key: 'TEAM', name: 'Team space', type: 'global', _links: { webui: '/spaces/TEAM' } },
      { key: '~alex', name: 'Personal', type: 'personal', _links: { webui: '/spaces/~alex' } },
    ] });
    if (url.pathname === '/wiki/rest/api/content' && !url.searchParams.has('start')) return Response.json({ results: [
      { id: '1', title: 'Runbook', _links: { webui: '/spaces/TEAM/pages/1/Runbook' } },
    ], _links: { next: '/rest/api/content?spaceKey=TEAM&start=1' } });
    if (url.pathname === '/wiki/rest/api/content' && url.searchParams.get('start') === '1') return Response.json({ results: [
      { id: '2', title: 'Meeting notes', ancestors: [{ id: '1' }], _links: { webui: '/spaces/TEAM/pages/2/Meeting+notes' } },
    ] });
    if (url.pathname === '/wiki/rest/api/search') {
      assert.match(url.searchParams.get('cql') ?? '', /siteSearch ~ "runbook"/);
      assert.match(url.searchParams.get('cql') ?? '', /space IN \("TEAM"\)/);
      assert.equal(url.searchParams.get('expand'), 'content.space');
      return Response.json({ results: [{ content: { id: '1', title: 'Runbook', type: 'page', space: { key: 'TEAM', name: 'Team space' }, _links: { webui: '/spaces/TEAM/pages/1/Runbook' } }, excerpt: '@@@hl@@@runbook@@@endhl@@@ <b>steps</b>' }] });
    }
    if (url.pathname === '/wiki/rest/api/content/1') return Response.json({ id: '1', title: 'Runbook', space: { key: 'TEAM' }, version: { number: 2, when: '2026-11-13T10:00:00Z' }, body: { view: { value: '<h2>Runbook</h2><p>Use <a href="/spaces/TEAM/pages/2">notes</a>.</p><script>alert(1)</script><img src="https://outside.test/pixel">' } }, _links: { webui: '/spaces/TEAM/pages/1/Runbook' } });
    return new Response(null, { status: 404 });
  };
  try {
    const snapshot = await getDocuments();
    assert.equal(snapshot.source, 'confluence');
    assert.deepEqual(snapshot.spaces.map((space) => space.key), ['TEAM']);
    assert.equal(snapshot.pages.length, 2);
    assert.equal(snapshot.pages[0].url, 'https://docs.test/wiki/spaces/TEAM/pages/1/Runbook');
    assert.equal(snapshot.pages[1].parentId, '1');
    const found = await searchDocuments('runbook');
    assert.equal(found.results[0].title, 'Runbook');
    assert.equal(found.results[0].excerpt, 'runbook steps');
    const detail = await getDocumentPage('1');
    assert.match(detail.html, /<h2>Runbook<\/h2>/);
    assert.match(detail.html, /https:\/\/docs\.test\/wiki\/spaces\/TEAM\/pages\/2/);
    assert.doesNotMatch(detail.html, /<script|<img/);
    await assert.rejects(() => getDocumentPage('../2'), /Invalid Confluence page ID/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
