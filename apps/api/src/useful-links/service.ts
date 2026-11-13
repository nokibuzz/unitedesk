import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface UsefulLink {
  id: string;
  label: string;
  url: string;
  description: string;
  aliases: string[];
  iconUrl: string | null;
}

const filePath = (root: string) => path.join(root, 'data', 'useful-links.json');

function validUrl(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error(`${field} must be a valid HTTP or HTTPS URL`);
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error(`${field} must be a valid HTTP or HTTPS URL`); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error(`${field} must be an HTTP or HTTPS URL without embedded credentials`);
  }
  return url.href;
}

export function validateUsefulLinks(input: unknown): UsefulLink[] {
  if (!Array.isArray(input) || input.length > 100) throw new Error('Provide a list of up to 100 useful links');
  const ids = new Set<string>();
  return input.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Link ${index + 1} must be an object`);
    const value = item as Record<string, unknown>;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const label = typeof value.label === 'string' ? value.label.trim() : '';
    const description = typeof value.description === 'string' ? value.description.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error(`Link ${index + 1} needs a unique ID`);
    if (!label || label.length > 100) throw new Error(`Link ${index + 1} needs a name of up to 100 characters`);
    if (description.length > 240) throw new Error(`Link ${index + 1} description is too long`);
    if (!Array.isArray(value.aliases) || value.aliases.length > 12 || value.aliases.some((alias) => typeof alias !== 'string' || !alias.trim() || alias.trim().length > 60)) {
      throw new Error(`Link ${index + 1} supports up to 12 search terms`);
    }
    const aliases = [...new Set((value.aliases as string[]).map((alias) => alias.trim()))];
    const iconUrl = value.iconUrl === null || value.iconUrl === undefined || value.iconUrl === '' ? null : validUrl(value.iconUrl, 'Icon URL');
    ids.add(id);
    return { id, label, url: validUrl(value.url, 'Link URL'), description, aliases, iconUrl };
  });
}

export async function getUsefulLinks(root: string): Promise<UsefulLink[]> {
  try {
    const saved: unknown = JSON.parse(await readFile(filePath(root), 'utf8'));
    if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 || !('links' in saved)) throw new Error('Unsupported useful links file');
    return validateUsefulLinks(saved.links);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return [];
  }
}

export async function saveUsefulLinks(root: string, input: unknown): Promise<UsefulLink[]> {
  const links = validateUsefulLinks(input);
  const target = filePath(root);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify({ version: 1, links }, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, target);
  return links;
}
