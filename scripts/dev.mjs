import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const services = [
  { name: 'api', workspace: '@unitedesk/api' },
  { name: 'web', workspace: '@unitedesk/web' },
];
const children = services.map(({ name, workspace }) => {
  const child = spawn(npm, ['run', 'dev', '--workspace', workspace], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('error', (error) => {
    console.error(`[${name}] ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[${name}] stopped (${signal ?? code ?? 'unknown'})`);
    stop(code || 1);
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
