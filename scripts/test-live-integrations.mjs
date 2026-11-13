import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { getActiveSprint, discoverStatusMapping } from '../apps/api/dist/sprint/service.js';
import { getMergeRequests } from '../apps/api/dist/merge-requests/service.js';
import { getDocuments } from '../apps/api/dist/documents/service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (!existsSync(envFile)) throw new Error('Create a private .env before running live integration tests');
loadEnvFile(envFile);

async function check(name, run) {
  try { const summary = await run(); console.log(`PASS ${name}: ${summary}`); }
  catch { console.error(`FAIL ${name}: check local configuration and provider access`); process.exitCode = 1; }
}

for (const provider of ['jira', 'linear']) {
  await check(provider, async () => {
    process.env.TICKETING_PROVIDER = provider;
    const [snapshot, mapping] = await Promise.all([getActiveSprint(root), discoverStatusMapping(root)]);
    assert.equal(snapshot.source, provider);
    assert.ok(snapshot.sprint, 'no active sprint or cycle');
    assert.ok(snapshot.tickets.length > 0, 'no test tickets in the active sprint or cycle');
    assert.ok(snapshot.tickets.every((ticket) => ticket.url.startsWith('https://')), 'missing original ticket link');
    assert.ok(mapping.statuses.length > 0, 'no workflow statuses discovered');
    return `${snapshot.tickets.length} tickets, ${mapping.statuses.length} statuses`;
  });
}
for (const provider of ['gitlab', 'github']) {
  await check(provider, async () => {
    process.env.CODE_REVIEW_PROVIDER = provider;
    const snapshot = await getMergeRequests(root, true);
    assert.equal(snapshot.source, provider);
    assert.ok(snapshot.items.length > 0, 'no open test changes');
    assert.ok(snapshot.items.every((item) => item.url.startsWith('https://')), 'missing original change link');
    return `${snapshot.items.length} open changes`;
  });
}
await check('confluence', async () => {
  const snapshot = await getDocuments();
  assert.equal(snapshot.source, 'confluence');
  assert.ok(snapshot.spaces.length > 0, 'no accessible spaces');
  assert.ok(snapshot.pages.length > 0, 'no test pages');
  assert.ok(snapshot.pages.every((page) => page.url.startsWith('https://')), 'missing original page link');
  return `${snapshot.spaces.length} spaces, ${snapshot.pages.length} pages`;
});
