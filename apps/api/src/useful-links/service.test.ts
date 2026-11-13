import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getUsefulLinks, saveUsefulLinks, validateUsefulLinks } from './service.js';

const link = { id: 'deploy-sps', label: 'SPS deploy', url: 'https://example.test/sps/si1', description: 'Service deployment', aliases: ['GitLab', 'SPS', 'SI1'], iconUrl: null };

test('useful links persist in the ignored local data directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-links-'));
  try {
    assert.deepEqual(await getUsefulLinks(root), []);
    assert.deepEqual(await saveUsefulLinks(root, [link]), [link]);
    assert.deepEqual(await getUsefulLinks(root), [link]);
    const file = path.join(root, 'data', 'useful-links.json');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 1);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('useful links reject unsafe URLs, embedded credentials, and duplicate IDs', () => {
  assert.throws(() => validateUsefulLinks([{ ...link, url: 'javascript:alert(1)' }]), /HTTP or HTTPS/);
  assert.throws(() => validateUsefulLinks([{ ...link, url: 'https://user:secret@example.test/' }]), /embedded credentials/);
  assert.throws(() => validateUsefulLinks([{ ...link, iconUrl: 'data:image/png;base64,abc' }]), /HTTP or HTTPS/);
  assert.throws(() => validateUsefulLinks([link, link]), /unique ID/);
});
