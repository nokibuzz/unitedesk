import assert from 'node:assert/strict';
import test from 'node:test';
import { PokerStore } from './rooms.js';
import type { PokerTicket } from './types.js';

const ticket: PokerTicket = { key: 'DEMO-101', summary: 'Sample story', description: 'A story to estimate', status: 'To Do', assignee: null, storyPoints: 2, url: 'https://example.test/DEMO-101', source: 'mock' };

test('hidden votes stay private until the host reveals, then median and distribution are available', () => {
  const store = new PokerStore();
  const room = store.create('host', 'Sprint planning', 'Host');
  store.join(room.code, 'guest', 'Guest');
  store.setTicket(room.code, 'host', ticket);
  store.vote(room.code, 'host', { value: '3' });
  store.vote(room.code, 'guest', { value: '5' });
  const before = store.view(room.code, 'host');
  assert.equal(before.members.find((member) => member.id === 'guest')?.voted, true);
  assert.equal(before.members.find((member) => member.id === 'guest')?.vote, null);
  assert.equal(before.stats, null);
  assert.equal(store.view(room.code, 'guest').members.find((member) => member.id === 'host')?.vote, null);
  const after = store.reveal(room.code, 'host');
  assert.equal(after.stats?.median, '4');
  assert.equal(after.stats?.average, 4);
  assert.deepEqual(after.stats?.distribution.filter((item) => item.count), [{ value: '3', count: 1 }, { value: '5', count: 1 }]);
  assert.equal(store.view(room.code, 'guest').members.find((member) => member.id === 'host')?.vote?.value, '3');
  assert.throws(() => store.vote(room.code, 'guest', { value: '8' }), /new round/);
  assert.throws(() => store.setEstimate(room.code, 'guest', '4', false), /host/);
  assert.throws(() => store.setEstimate(room.code, 'host', '8', false), /voted value or the median/);
  const saved = store.setEstimate(room.code, 'host', '4', false);
  assert.equal(saved.estimate, '4');
  assert.equal(saved.published, false);
  assert.equal(saved.ticket?.storyPoints, 2);
  const next = store.nextRound(room.code, 'host');
  assert.equal(next.stats, null);
  assert.equal(next.estimate, null);
  assert.ok(next.members.every((member) => !member.voted));
});

test('only the host controls ticket, mode and reveal; advanced vote hours are validated', () => {
  const store = new PokerStore();
  const room = store.create('host', 'Planning', 'Host');
  store.join(room.code, 'guest', 'Guest');
  assert.throws(() => store.setTicket(room.code, 'guest', ticket), /host/);
  assert.throws(() => store.reveal(room.code, 'guest'), /host/);
  store.setTicket(room.code, 'host', ticket);
  store.setAdvanced(room.code, 'host', true);
  assert.throws(() => store.vote(room.code, 'guest', { value: '3', devHours: 1.3 }), /half-hour/);
  store.vote(room.code, 'guest', { value: '3', devHours: 2.5, qaHours: 1 });
  store.vote(room.code, 'host', { value: '?' });
  const result = store.reveal(room.code, 'host');
  assert.equal(result.stats?.median, '3');
  assert.equal(result.stats?.unknown, 1);
  assert.equal(result.stats?.devAverage, 2.5);
  assert.equal(result.stats?.qaAverage, 1);
  store.leave(room.code, 'host');
  assert.equal(store.view(room.code, 'guest').admin, true);
});
