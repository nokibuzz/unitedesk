import assert from 'node:assert/strict';
import test from 'node:test';
import { notionDocumentsAdapter } from './notion.js';

const root = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const child = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

test('Notion adapter builds nested pages and searches readable block content', async () => {
  const names = ['NOTION_API_KEY', 'NOTION_API_URL', 'NOTION_API_VERSION'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  process.env.NOTION_API_KEY = 'test-notion-token';
  process.env.NOTION_API_URL = 'https://notion.test';
  process.env.NOTION_API_VERSION = '2026-03-11';
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer test-notion-token');
    assert.equal(headers.get('Notion-Version'), '2026-03-11');
    if (url.pathname === '/v1/search') return Response.json({ results: [
      { object: 'page', id: root, url: `https://www.notion.so/${root}`, last_edited_time: '2026-11-13T10:00:00Z', properties: { title: { type: 'title', title: [{ plain_text: 'Team handbook' }] } } },
      { object: 'page', id: child, url: `https://www.notion.so/${child}`, parent: { type: 'page_id', page_id: root }, properties: { Name: { type: 'title', title: [{ plain_text: 'Getting started' }] } } },
    ], has_more: false, next_cursor: null });
    if (url.pathname === `/v1/blocks/${root}/children`) return Response.json({ results: [
      { id: 'block-1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'This is the onboarding guide.' }] } },
    ], has_more: false, next_cursor: null });
    if (url.pathname === `/v1/blocks/${child}/children`) return Response.json({ results: [
      { id: 'block-2', type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Start here' }] } },
      { id: 'block-3', type: 'paragraph', paragraph: { rich_text: [{ plain_text: '<script>alert(1)</script>' }] } },
    ], has_more: false, next_cursor: null });
    return new Response(null, { status: 404 });
  };
  try {
    const snapshot = await notionDocumentsAdapter.load();
    assert.equal(snapshot.pages.length, 2);
    assert.equal(snapshot.pages.find((page) => page.id === child)?.parentId, root);
    const found = await notionDocumentsAdapter.search('onboarding');
    assert.equal(found.results.length, 1);
    assert.equal(found.results[0].id, root);
    const preview = await notionDocumentsAdapter.getPage(child);
    assert.match(preview.html, /<h2>Start here<\/h2>/);
    assert.doesNotMatch(preview.html, /<script>/);
    await assert.rejects(() => notionDocumentsAdapter.getPage('../oops'), /Invalid Notion page ID/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
