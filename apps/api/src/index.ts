import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { getActiveSprint } from './sprint/service.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(currentDirectory, '../../..');
const envFile = path.join(projectDirectory, '.env');

if (existsSync(envFile)) loadEnvFile(envFile);

const app = express();
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
