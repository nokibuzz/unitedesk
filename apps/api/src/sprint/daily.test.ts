import assert from 'node:assert/strict';
import test from 'node:test';
import { addedToSprintAt, dailyWindowStart, descriptionFromJira } from './daily.js';

test('daily window uses the configured time zone across daylight saving changes', () => {
  assert.equal(dailyWindowStart(Date.parse('2026-01-15T12:00:00Z'), 'Europe/Belgrade', 10), '2026-01-14T09:00:00.000Z');
  assert.equal(dailyWindowStart(Date.parse('2026-07-15T12:00:00Z'), 'Europe/Belgrade', 10), '2026-07-14T08:00:00.000Z');
  assert.equal(dailyWindowStart(Date.parse('2026-01-15T12:00:00Z'), 'UTC', 10), '2026-01-14T10:00:00.000Z');
});

test('Jira ADF and wiki descriptions become readable plain text', () => {
  const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First line' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] }] };
  assert.equal(descriptionFromJira(adf), 'First line\nSecond line');
  assert.equal(descriptionFromJira('h2. Setup\n* Check [the ticket|https://example.com]'), 'Setup\n• Check the ticket');
});

test('added to sprint requires a transition into the current sprint', () => {
  const history = [{ created: '2026-01-14T11:00:00Z', items: [{ field: 'Sprint', fromString: 'Sprint 11', toString: 'Sprint 11, Sprint 12' }] }];
  assert.equal(addedToSprintAt(history, 'Sprint 12'), '2026-01-14T11:00:00Z');
  assert.equal(addedToSprintAt(history, 'Sprint 11'), null);
  assert.equal(addedToSprintAt(null, 'Sprint 12'), null);
});
