import assert from 'node:assert/strict';
import test from 'node:test';
import { searchUsefulLinks } from '../src/features/useful-links/search.js';
import type { UsefulLink } from '../src/features/useful-links/types.js';

const links: UsefulLink[] = [
  { id: 'deploy', label: 'SPS deployment', url: 'https://gitlab.example.test/sps/si1', description: 'Staging environment', aliases: ['GitLab', 'SI1'], iconUrl: null },
  { id: 'github', label: 'GitHub repositories', url: 'https://github.com/example', description: '', aliases: ['code'], iconUrl: null },
  { id: 'logs', label: 'Victoria Logs', url: 'https://logs.example.test/query', description: 'Observability', aliases: ['search logs'], iconUrl: null },
];

test('search matches service and environment terms across name, aliases, and URL in any order', () => {
  assert.deepEqual(searchUsefulLinks(links, 'GitLab SPS SI1').map((link) => link.id), ['deploy']);
  assert.deepEqual(searchUsefulLinks(links, 'si1 gitlab').map((link) => link.id), ['deploy']);
  assert.deepEqual(searchUsefulLinks(links, 'logs query').map((link) => link.id), ['logs']);
});

test('search tolerates one-character typos and ranks names above incidental URL matches', () => {
  assert.deepEqual(searchUsefulLinks(links, 'gitlb').map((link) => link.id), ['deploy']);
  assert.deepEqual(searchUsefulLinks(links, 'Victoira').map((link) => link.id), ['logs']);
  assert.equal(searchUsefulLinks(links, 'github')[0].id, 'github');
  assert.deepEqual(searchUsefulLinks(links, 'gitlab missing'), []);
});
