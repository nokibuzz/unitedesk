import assert from 'node:assert/strict';
import test from 'node:test';
import { publishJiraPoints } from './tickets.js';
import type { PokerTicket } from './types.js';

test('Jira estimate publishing uses the configured story point field and rejects non-Jira tickets', async () => {
  const ticket: PokerTicket = { key: 'PLAN-123', summary: 'Plan work', description: '', status: 'To Do', assignee: null, storyPoints: 2, url: 'https://jira.example.test/browse/PLAN-123', source: 'jira' };
  const variables = ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_STORY_POINTS_FIELD'] as const;
  const original = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  try {
    process.env.JIRA_URL = 'https://jira.example.test';
    process.env.JIRA_EMAIL = 'test@example.test';
    process.env.JIRA_API_TOKEN = 'test-token';
    process.env.JIRA_STORY_POINTS_FIELD = 'customfield_10016';
    globalThis.fetch = async (input, init) => { calls.push({ url: String(input), method: init?.method || 'GET', body: JSON.parse(String(init?.body)) }); return new Response(null, { status: 204 }); };
    await assert.rejects(publishJiraPoints({ ...ticket, source: 'mock' }, 5), /Only a live Jira ticket/);
    await publishJiraPoints(ticket, 5);
    assert.deepEqual(calls, [{ url: 'https://jira.example.test/rest/api/3/issue/PLAN-123', method: 'PUT', body: { fields: { customfield_10016: 5 } } }]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of variables) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});
