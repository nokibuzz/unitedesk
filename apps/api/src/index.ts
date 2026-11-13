import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getMergeRequests } from './merge-requests/service.js';
import { getDocuments } from './documents/service.js';
import { confirmStatusMapping, discoverStatusMapping, getActiveSprint } from './sprint/service.js';
import { getTeamSettings, saveTeamSettings } from './settings/team.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(currentDirectory, '../../..');
const envFile = path.join(projectDirectory, '.env');

if (existsSync(envFile)) loadEnvFile(envFile);

const app = express();
app.use(express.json({ limit: '32kb' }));
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST?.trim() || '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a number between 1 and 65535');
}

app.get('/api/health', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({ status: 'ok', service: 'unitedesk-api' });
});

app.get('/api/sprint/active', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try {
    response.json(await getActiveSprint(projectDirectory));
  } catch (error) {
    console.error('Active sprint request failed:', error);
    response.status(503).json({ error: error instanceof Error ? error.message : 'Active sprint is unavailable' });
  }
});

app.get('/api/merge-requests', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json(await getMergeRequests(projectDirectory, request.query.refresh === '1')); }
  catch (error) {
    console.error('Merge request list failed:', error);
    response.status(503).json({ error: error instanceof Error ? error.message : 'Merge requests are unavailable' });
  }
});

app.get('/api/documents', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json(await getDocuments()); }
  catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : 'Documents are unavailable' }); }
});

app.get(['/api/ticketing/status-mapping', '/api/jira/status-mapping'], async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json(await discoverStatusMapping(projectDirectory)); }
  catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : 'Status discovery failed' }); }
});

app.get('/api/settings/team', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json({ settings: await getTeamSettings(projectDirectory) }); }
  catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : 'Team settings are unavailable' }); }
});

app.put('/api/settings/team', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) {
    response.status(403).json({ error: 'Team settings can only be changed locally' });
    return;
  }
  try { response.json({ settings: await saveTeamSettings(projectDirectory, request.body?.settings) }); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid team settings' }); }
});

app.put(['/api/ticketing/status-mapping', '/api/jira/status-mapping'], async (request, response) => {
  response.set('Cache-Control', 'no-store');
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) {
    response.status(403).json({ error: 'Status mapping can only be confirmed locally' });
    return;
  }
  try { response.json(await confirmStatusMapping(projectDirectory, request.body?.statuses)); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid status mapping' }); }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

const webDirectory = path.resolve(currentDirectory, '../../web/dist');
const indexFile = path.join(webDirectory, 'index.html');

if (existsSync(indexFile)) {
  app.use(express.static(webDirectory));
  app.use((_request, response) => response.sendFile(indexFile));
}

app.listen(port, host, () => {
  console.log(`UniteDesk running at http://${host}:${port}`);
});
