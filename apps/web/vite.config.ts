import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectDirectory, '');
  const apiPort = Number(env.PORT || process.env.PORT || 3001);

  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error('PORT must be a number between 1 and 65535');
  }

  return {
    plugins: [react()],
    base: mode === 'demo' ? '/unitedesk/' : '/',
    server: {
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});
