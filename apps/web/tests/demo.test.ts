import assert from 'node:assert/strict';
import test from 'node:test';
import { demoResponse } from '../src/demo/api.js';

test('public demo serves sprint, reviews, documentation, and useful links without a server', async () => {
  const sprint = await (await demoResponse('/api/sprint/active')).json();
  const reviews = await (await demoResponse('/api/merge-requests')).json();
  const documents = await (await demoResponse('/api/documents')).json();
  const search = await (await demoResponse('/api/documents/search?q=sprint')).json();
  const page = await (await demoResponse('/api/documents/confluence%3Aguide')).json();
  const links = await (await demoResponse('/api/useful-links')).json();
  assert.equal(sprint.source, 'mock');
  assert.ok(sprint.tickets.length >= 5);
  assert.equal(reviews.source, 'mock');
  assert.ok(reviews.items.some((item: { waitingForMe: boolean }) => item.waitingForMe));
  assert.equal(documents.spaces.length, 3);
  assert.ok(search.results.length > 0);
  assert.equal(page.title, 'How we run a sprint');
  assert.ok(links.links.length > 0);
});

test('public demo rejects writes and never exposes provider credentials', async () => {
  const response = await demoResponse('/api/settings/code-review', { method: 'PUT', body: '{}' });
  assert.equal(response.status, 403);
  const settings = await (await demoResponse('/api/settings/code-review')).json();
  assert.equal(settings.connection.gitlab.hasToken, false);
  assert.equal(settings.connection.github.hasToken, false);
  assert.equal(JSON.stringify(settings).includes('token:'), false);
});
