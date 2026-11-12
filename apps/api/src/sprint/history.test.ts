import assert from 'node:assert/strict';
import test from 'node:test';
import { elapsedSince, enteredAt, testingElapsed, waitingForTestElapsed } from './history.js';
import type { JiraHistory } from './types.js';

const changes: JiraHistory[] = [
  { created: '2026-01-02T10:00:00.000Z', items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
  { created: '2026-01-03T12:00:00.000Z', items: [{ field: 'status', fromString: 'In Progress', toString: 'In Testing' }] },
  { created: '2026-01-04T15:00:00.000Z', items: [{ field: 'status', fromString: 'In Testing', toString: 'Done' }] },
];
const roleFor = (status: string) => ({ 'To Do': 'backlog', 'In Progress': 'in_progress', 'In Testing': 'in_testing', Done: 'done' })[status] ?? 'other';

test('current status age starts at the last matching transition, not issue update', () => {
  const now = Date.parse('2026-01-05T15:00:00.000Z');
  assert.equal(enteredAt('Done', '2026-01-01T09:00:00.000Z', changes), '2026-01-04T15:00:00.000Z');
  assert.equal(elapsedSince(enteredAt('Done', '2026-01-01T09:00:00.000Z', changes), now), 24 * 3_600_000);
  assert.equal(enteredAt('In Progress', '2026-01-01T09:00:00.000Z', changes), null);
});

test('testing durations stop at the transition to testing and done', () => {
  const start = '2026-01-01T09:00:00.000Z';
  const now = Date.parse('2026-01-05T15:00:00.000Z');
  assert.equal(waitingForTestElapsed(start, changes, roleFor, now), 51 * 3_600_000);
  assert.equal(testingElapsed(start, changes, roleFor, now), 27 * 3_600_000);
});

test('missing history does not manufacture a testing start', () => {
  assert.equal(testingElapsed('2026-01-01T09:00:00.000Z', [], roleFor, Date.now()), null);
  assert.equal(enteredAt('To Do', '2026-01-01T09:00:00.000Z', []), '2026-01-01T09:00:00.000Z');
});

test('testing time excludes intervals after a ticket leaves testing', () => {
  const repeated: JiraHistory[] = [
    { created: '2026-01-01T10:00:00.000Z', items: [{ field: 'status', fromString: 'To Do', toString: 'In Testing' }] },
    { created: '2026-01-01T11:00:00.000Z', items: [{ field: 'status', fromString: 'In Testing', toString: 'In Progress' }] },
    { created: '2026-01-01T13:00:00.000Z', items: [{ field: 'status', fromString: 'In Progress', toString: 'In Testing' }] },
  ];
  assert.equal(testingElapsed('2026-01-01T09:00:00.000Z', repeated, roleFor, Date.parse('2026-01-01T15:00:00.000Z')), 3 * 3_600_000);
});
