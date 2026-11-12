import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { JiraStatus, StatusMapping, StatusRole } from './types.js';

const roles: StatusRole[] = ['backlog', 'in_progress', 'ready_for_testing', 'in_testing', 'done', 'blocked', 'other'];
interface SavedMapping { version: number; scope: string; statuses: Array<{ id: string; role: StatusRole }> }
const mappingPath = (root: string) => path.join(root, 'data', 'jira-status-mapping.json');

function proposal(status: JiraStatus): StatusRole {
  const name = status.name.toLowerCase();
  if (/block|impediment|on hold/.test(name)) return 'blocked';
  if (/ready.*(test|qa)|test.*ready|dev(elopment)? done/.test(name)) return 'ready_for_testing';
  if (/in (test|qa)|testing|qa in progress/.test(name)) return 'in_testing';
  if (status.category === 'done' || /^(done|closed|resolved)$/.test(name)) return 'done';
  if (status.category === 'new' || /^(to do|backlog|open)$/.test(name)) return 'backlog';
  if (status.category === 'indeterminate' || /progress|develop|review/.test(name)) return 'in_progress';
  return 'other';
}

export async function getStatusMapping(root: string, scope: string, discovered: JiraStatus[]): Promise<StatusMapping> {
  const unique = [...new Map(discovered.map((status) => [status.id, status])).values()].sort((a, b) => a.name.localeCompare(b.name));
  let saved: SavedMapping | null = null;
  try {
    const parsed: unknown = JSON.parse(await readFile(mappingPath(root), 'utf8'));
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1 && 'scope' in parsed && typeof parsed.scope === 'string' && 'statuses' in parsed && Array.isArray(parsed.statuses)) {
      saved = parsed as SavedMapping;
    }
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const prior = saved?.scope === scope ? new Map(saved.statuses.filter((item) => item && typeof item.id === 'string' && roles.includes(item.role)).map((item) => [item.id, item.role])) : new Map<string, StatusRole>();
  const statuses = unique.map((status) => ({ ...status, role: prior.get(status.id) ?? proposal(status) }));
  return { confirmed: !!saved && saved.scope === scope && unique.every((status) => prior.has(status.id)), statuses };
}

export async function saveStatusMapping(root: string, scope: string, discovered: JiraStatus[], input: unknown): Promise<StatusMapping> {
  if (!Array.isArray(input) || input.length !== discovered.length) throw new Error('Provide one role for every discovered status');
  const selected = new Map<string, StatusRole>();
  for (const item of input) {
    if (!item || typeof item.id !== 'string' || !roles.includes(item.role) || selected.has(item.id)) throw new Error('Invalid or duplicate status mapping');
    selected.set(item.id, item.role);
  }
  if (discovered.some((status) => !selected.has(status.id))) throw new Error('Status mapping does not match the Jira board');
  const target = mappingPath(root);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify({ version: 1, scope, statuses: [...selected].map(([id, role]) => ({ id, role })) }, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, target);
  return getStatusMapping(root, scope, discovered);
}
