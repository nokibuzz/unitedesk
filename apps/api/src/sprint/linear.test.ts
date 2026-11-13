import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getActiveSprint } from './service.js';
import { getStatusMapping, saveStatusMapping } from './mapping.js';

test('Linear cycle uses the existing sprint view with original links and state duration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-linear-'));
  const originalFetch = globalThis.fetch;
  const names = ['TICKETING_PROVIDER', 'LINEAR_TEAM', 'LINEAR_API_KEY'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.TICKETING_PROVIDER = 'linear'; process.env.LINEAR_TEAM = 'LAB'; process.env.LINEAR_API_KEY = 'read-test';
  const started = new Date(Date.now() - 60_000).toISOString();
  const ends = new Date(Date.now() + 60_000).toISOString();
  const state = { id: 'started', name: 'In Progress', type: 'started' };
  const base = { description: 'Synthetic details', createdAt: started, updatedAt: started, estimate: 3, state, assignee: null };
  const parent = { ...base, id: 'parent', identifier: 'LAB-1', title: 'Build sprint view', url: 'https://linear.app/lab/issue/LAB-1/build-sprint-view', parent: null };
  const child = { ...base, id: 'child', identifier: 'LAB-2', title: 'Test the solution', url: 'https://linear.app/lab/issue/LAB-2/test-the-solution', parent: { id: 'parent' } };
  const orphan = { ...base, id: 'orphan', identifier: 'LAB-3', title: 'Cycle-only subissue', url: 'https://linear.app/lab/issue/LAB-3/cycle-only-subissue', parent: { id: 'outside' } };
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'read-test');
    const request = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string> };
    if (request.query.includes('organization{urlKey}')) return Response.json({ data: { organization: { urlKey: 'lab' }, team: { key: 'LAB', states: { nodes: [state] }, cycles: { nodes: [{ id: 'cycle', number: 1, name: 'Test cycle', startsAt: started, endsAt: ends }] } } } });
    if (request.query.includes('cycle(id:$cycle)')) return Response.json({ data: { cycle: { issues: { nodes: [parent, child, orphan], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    if (request.query.includes('stateHistory')) return Response.json({ data: { issue: { stateHistory: { nodes: [{ stateId: state.id, startedAt: started, state: { name: state.name } }], pageInfo: { hasNextPage: false, endCursor: null } } } } });
    return Response.json({ errors: [{ message: 'Unexpected query' }] });
  };
  try {
    const snapshot = await getActiveSprint(root);
    assert.equal(snapshot.source, 'linear');
    assert.equal(snapshot.sprint?.name, 'Test cycle');
    assert.equal(snapshot.tickets.length, 2);
    const parentTicket = snapshot.tickets.find((ticket) => ticket.key === 'LAB-1');
    assert.ok(parentTicket);
    assert.equal(parentTicket.statusRole, 'in_progress');
    assert.equal(parentTicket.testing, 'in_testing');
    assert.equal(parentTicket.subtasks[0].url, child.url);
    assert.equal(parentTicket.url, parent.url);
    assert.ok((parentTicket.statusAgeMs ?? -1) >= 60_000);
    assert.ok(snapshot.tickets.some((ticket) => ticket.key === 'LAB-3'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    await rm(root, { recursive: true, force: true });
  }
});

test('status confirmations stay independent across provider scopes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-mapping-'));
  const statuses = [{ id: 'todo', name: 'Todo', category: 'new' }];
  try {
    await saveStatusMapping(root, 'https://example.atlassian.net/board/1', statuses, [{ id: 'todo', role: 'backlog' }]);
    await saveStatusMapping(root, 'https://linear.app/lab/linear/LAB', statuses, [{ id: 'todo', role: 'in_progress' }]);
    assert.equal((await getStatusMapping(root, 'https://example.atlassian.net/board/1', statuses)).statuses[0].role, 'backlog');
    assert.equal((await getStatusMapping(root, 'https://linear.app/lab/linear/LAB', statuses)).statuses[0].role, 'in_progress');
    const saved = JSON.parse(await readFile(path.join(root, 'data', 'ticket-status-mapping.json'), 'utf8')) as { version: number; scopes: object };
    assert.equal(saved.version, 2);
    assert.equal(Object.keys(saved.scopes).length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
