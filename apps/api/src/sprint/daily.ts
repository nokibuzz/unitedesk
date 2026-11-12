import type { JiraHistory } from './types.js';

function cleanWiki(value: string): string {
  return value.replace(/\{(?:panel|quote|code|noformat|color)(?::[^}]*)?\}/gi, '')
    .replace(/\[([^\]|]+)\|[^\]]+\]/g, '$1')
    .replace(/\[~([^\]]+)\]/g, '@$1')
    .replace(/\{\{([^}]+)\}\}/g, '$1')
    .replace(/^h[1-6]\.\s*/gm, '')
    .replace(/^(\*+|#)\s+/gm, '• ')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1');
}

export function descriptionFromJira(value: unknown): string {
  if (typeof value === 'string') return cleanWiki(value).trim().slice(0, 6000);
  if (!value || typeof value !== 'object') return '';
  const chunks: string[] = [];
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const item = node as { type?: string; text?: string; content?: unknown[] };
    if (item.type === 'hardBreak') { chunks.push('\n'); return; }
    if (typeof item.text === 'string') { chunks.push(item.text); return; }
    if (item.type === 'listItem') chunks.push('• ');
    for (const child of item.content ?? []) walk(child);
    if (['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(item.type ?? '')) chunks.push('\n');
  }
  walk(value);
  return chunks.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
}

export function addedToSprintAt(histories: JiraHistory[] | null | undefined, sprintName: string | undefined): string | null {
  if (!histories || !sprintName) return null;
  const needle = sprintName.trim().toLowerCase();
  const additions = histories.flatMap((history) => history.items.filter((item) => item.field?.toLowerCase() === 'sprint'
    && item.toString?.toLowerCase().includes(needle) && !item.fromString?.toLowerCase().includes(needle))
    .map(() => history.created)).filter((value) => Number.isFinite(Date.parse(value)));
  return additions.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

export function dailyWindowStart(now: number, zone: string, hour: number): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const read = (name: string) => Number(parts.find((item) => item.type === name)?.value);
  const yesterday = new Date(Date.UTC(read('year'), read('month') - 1, read('day') - 1));
  const desired = Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), hour);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  let utc = desired;
  for (let attempt = 0; attempt < 4; attempt++) {
    const zoned = formatter.formatToParts(new Date(utc));
    const part = (name: string) => Number(zoned.find((item) => item.type === name)?.value);
    const perceived = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    const next = utc + desired - perceived;
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc).toISOString();
}
