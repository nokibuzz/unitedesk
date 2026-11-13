import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getMergeRequests } from './merge-requests/service.js';
import { getDocumentPage, getDocuments, searchDocuments } from './documents/service.js';
import { confirmStatusMapping, discoverStatusMapping, getActiveSprint } from './sprint/service.js';
import { getTeamSettings, saveTeamSettings } from './settings/team.js';
import { getReviewConnection, publicReviewConnection, saveReviewConnection } from './settings/code-review.js';
import { getUsefulLinks, saveUsefulLinks } from './useful-links/service.js';
import { pokerRouter } from './poker/routes.js';
import { retroRouter } from './retro/routes.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(currentDirectory, '../../..');
const envFile = path.join(projectDirectory, '.env');

if (existsSync(envFile)) loadEnvFile(envFile);

const app = express();
app.use(express.json({ limit: '128kb' }));
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST?.trim() || '127.0.0.1';

app.use('/api/poker', pokerRouter(projectDirectory));
app.use('/api/retro', retroRouter(projectDirectory));

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

app.get('/api/documents/search', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json(await searchDocuments(String(request.query.q ?? ''))); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Document search is unavailable' }); }
});

app.get('/api/documents/:id', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json(await getDocumentPage(String(request.params.id))); }
  catch (error) { response.status(404).json({ error: error instanceof Error ? error.message : 'Document is unavailable' }); }
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

app.get('/api/settings/code-review', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json({ connection: publicReviewConnection(await getReviewConnection(projectDirectory)) }); }
  catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : 'Code review settings are unavailable' }); }
});

app.put('/api/settings/code-review', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) {
    response.status(403).json({ error: 'Code review settings can only be changed locally' });
    return;
  }
  try { response.json({ connection: await saveReviewConnection(projectDirectory, request.body?.connection) }); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid code review settings' }); }
});

app.get('/api/useful-links', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try { response.json({ links: await getUsefulLinks(projectDirectory) }); }
  catch (error) { response.status(503).json({ error: error instanceof Error ? error.message : 'Useful links are unavailable' }); }
});

app.put('/api/useful-links', async (request, response) => {
  response.set('Cache-Control', 'no-store');
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')) {
    response.status(403).json({ error: 'Useful links can only be changed locally' });
    return;
  }
  try { response.json({ links: await saveUsefulLinks(projectDirectory, request.body?.links) }); }
  catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : 'Invalid useful links' }); }
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
