import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sanitizeHtml from 'sanitize-html';
import type { DocumentationAdapter, DocumentContent, DocumentPage, DocumentSearch, DocumentSearchHit, DocumentSnapshot, DocumentSpace } from './types.js';

interface RichText { plain_text?: string; text?: { content?: string; link?: { url?: string } | null }; href?: string | null; annotations?: { bold?: boolean; italic?: boolean; code?: boolean; underline?: boolean; strikethrough?: boolean } }
interface NotionPage { id: string; object: string; url: string; archived?: boolean; in_trash?: boolean; last_edited_time?: string; parent?: { type?: string; page_id?: string }; properties?: Record<string, { type?: string; title?: RichText[] }> }
interface NotionBlock { id: string; type: string; has_children?: boolean; [key: string]: unknown }
interface PageResult<T> { results: T[]; has_more: boolean; next_cursor: string | null }
interface Catalog { spaces: DocumentSpace[]; pages: DocumentPage[]; rows: NotionPage[] }
const CATALOG_CACHE_MS = 2 * 60_000;
const CONTENT_CACHE_MS = 5 * 60_000;
const MAX_PAGES = 100;
let catalogCache: { key: string; at: number; value: Catalog } | null = null;
const contentCache = new Map<string, { at: number; html: string; text: string }>();
let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

function settings() {
  const token = process.env.NOTION_API_KEY?.trim();
  const mock = process.env.NOTION_MODE?.trim() === 'mock';
  if (!token && !mock) throw new Error('Set NOTION_API_KEY for Notion documents');
  const raw = process.env.NOTION_API_URL?.trim() || 'https://api.notion.com';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('NOTION_API_URL must be an HTTPS base URL without credentials');
  const version = process.env.NOTION_API_VERSION?.trim() || '2026-03-11';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error('NOTION_API_VERSION must be YYYY-MM-DD');
  const key = createHash('sha256').update(JSON.stringify({ token, base: url.toString(), version, mock })).digest('hex');
  return { token, base: url.toString().replace(/\/$/, ''), version, key, mock };
}

async function mockRequest<T>(endpoint: string, method: 'GET' | 'POST'): Promise<T> {
  if (method === 'POST' && endpoint === '/search') {
    const rows = JSON.parse(await readFile(new URL('../../../../mock/notion/pages.json', import.meta.url), 'utf8')) as NotionPage[];
    return { results: rows, has_more: false, next_cursor: null } as T;
  }
  const match = /^\/blocks\/([^/]+)\/children\?/.exec(endpoint);
  if (method === 'GET' && match) {
    const blocks = JSON.parse(await readFile(new URL('../../../../mock/notion/blocks.json', import.meta.url), 'utf8')) as Record<string, NotionBlock[]>;
    return { results: blocks[match[1]] ?? [], has_more: false, next_cursor: null } as T;
  }
  throw new Error('Unsupported Notion mock request');
}

async function pace<T>(action: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 350;
    return action();
  });
  requestQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function notionRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const config = settings();
  if (config.mock) return mockRequest<T>(endpoint, method);
  return pace(async () => {
    const response = await fetch(`${config.base}/v1${endpoint}`, { method,
      headers: { Authorization: `Bearer ${config.token}`, 'Notion-Version': config.version, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Notion documentation request failed (${response.status})`);
    return response.json() as Promise<T>;
  });
}

function richPlain(items: RichText[] | undefined): string { return (items ?? []).map((item) => item.plain_text ?? item.text?.content ?? '').join(''); }
function pageTitle(page: NotionPage): string {
  const title = Object.values(page.properties ?? {}).find((property) => property.type === 'title' || Array.isArray(property.title));
  return richPlain(title?.title).trim() || 'Untitled';
}
function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }
function richHtml(items: RichText[] | undefined): string {
  return (items ?? []).map((item) => {
    let html = escapeHtml(item.plain_text ?? item.text?.content ?? '');
    const a = item.annotations;
    if (a?.code) html = `<code>${html}</code>`;
    if (a?.bold) html = `<strong>${html}</strong>`;
    if (a?.italic) html = `<em>${html}</em>`;
    if (a?.underline) html = `<u>${html}</u>`;
    if (a?.strikethrough) html = `<s>${html}</s>`;
    const href = safeUrl(item.href ?? item.text?.link?.url);
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${html}</a>` : html;
  }).join('');
}

function blockBody(block: NotionBlock): Record<string, unknown> {
  const data = block[block.type];
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
}
function richFrom(value: unknown): RichText[] { return Array.isArray(value) ? value as RichText[] : []; }
function renderBlock(block: NotionBlock, children: string): string {
  const data = blockBody(block);
  const html = richHtml(richFrom(data.rich_text));
  switch (block.type) {
    case 'paragraph': return `<p>${html}</p>${children}`;
    case 'heading_1': return `<h1>${html}</h1>${children}`;
    case 'heading_2': return `<h2>${html}</h2>${children}`;
    case 'heading_3': return `<h3>${html}</h3>${children}`;
    case 'bulleted_list_item': return `<ul><li>${html}${children}</li></ul>`;
    case 'numbered_list_item': return `<ol><li>${html}${children}</li></ol>`;
    case 'to_do': return `<p>${data.checked ? '☑' : '☐'} ${html}</p>${children}`;
    case 'quote': return `<blockquote>${html}${children}</blockquote>`;
    case 'code': return `<pre><code>${html}</code></pre>${children}`;
    case 'callout': return `<blockquote>${html}${children}</blockquote>`;
    case 'divider': return `<hr />${children}`;
    case 'child_page': return `<p>▤ ${escapeHtml(String(data.title || 'Child page'))}</p>`;
    case 'bookmark': case 'embed': case 'link_preview': {
      const url = safeUrl(typeof data.url === 'string' ? data.url : undefined);
      return `${url ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>` : ''}${children}`;
    }
    default: return html ? `<p>${html}</p>${children}` : children;
  }
}

async function listChildren(id: string): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ page_size: '100' });
    if (cursor) query.set('start_cursor', cursor);
    const response: PageResult<NotionBlock> = await notionRequest(`/blocks/${encodeURIComponent(id)}/children?${query}`);
    if (!Array.isArray(response.results)) throw new Error('Unexpected Notion block response');
    blocks.push(...response.results);
    if (!response.has_more) return blocks;
    cursor = response.next_cursor;
    if (!cursor) break;
  }
  throw new Error('Notion page has too many blocks for the current reader');
}

async function renderChildren(id: string, depth = 0): Promise<string> {
  if (depth > 5) return '<p>More nested content is available in Notion.</p>';
  let html = '';
  for (const block of await listChildren(id)) {
    const children = block.has_children && block.type !== 'child_page' ? await renderChildren(block.id, depth + 1) : '';
    html += renderBlock(block, children);
  }
  return html;
}

async function catalog(): Promise<Catalog> {
  const config = settings();
  if (catalogCache?.key === config.key && Date.now() - catalogCache.at < CATALOG_CACHE_MS) return catalogCache.value;
  const rows: NotionPage[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const body: Record<string, unknown> = { page_size: 100, filter: { property: 'object', value: 'page' }, sort: { direction: 'descending', timestamp: 'last_edited_time' } };
    if (cursor) body.start_cursor = cursor;
    const response: PageResult<NotionPage> = await notionRequest('/search', 'POST', body);
    if (!Array.isArray(response.results)) throw new Error('Unexpected Notion search response');
    rows.push(...response.results.filter((item) => item.object === 'page' && !item.archived && !item.in_trash));
    if (rows.length > MAX_PAGES) throw new Error(`Notion has more than ${MAX_PAGES} accessible pages; share a smaller workspace with the integration`);
    if (!response.has_more) break;
    cursor = response.next_cursor;
    if (!cursor) throw new Error('Notion pagination did not include a cursor');
    if (page === 4) throw new Error('Notion page list exceeded the page limit');
  }
  const ids = new Set(rows.map((page) => page.id));
  const pages: DocumentPage[] = rows.map((page) => ({ id: page.id, spaceKey: 'workspace', title: pageTitle(page), url: page.url,
    parentId: page.parent?.type === 'page_id' && page.parent.page_id && ids.has(page.parent.page_id) ? page.parent.page_id : null }));
  if (config.mock) for (const page of pages) page.url = '';
  const spaces: DocumentSpace[] = [{ key: 'workspace', name: config.mock ? 'Notion sample' : 'Notion', url: config.mock ? '' : 'https://www.notion.so' }];
  const value = { spaces, pages, rows };
  catalogCache = { key: config.key, at: Date.now(), value };
  return value;
}

async function content(page: NotionPage): Promise<{ html: string; text: string }> {
  const key = `${settings().key}:${page.id}:${page.last_edited_time ?? ''}`;
  const cached = contentCache.get(key);
  if (cached && Date.now() - cached.at < CONTENT_CACHE_MS) return cached;
  const raw = await renderChildren(page.id);
  const html = sanitizeHtml(raw, { allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'h3', 'hr', 'pre', 'code', 'u', 's'],
    allowedAttributes: { a: ['href', 'target', 'rel'] } });
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  const value = { at: Date.now(), html, text };
  contentCache.set(key, value);
  return value;
}

async function loadNotion(): Promise<DocumentSnapshot> {
  const data = await catalog();
  return { source: 'notion', fetchedAt: new Date().toISOString(), spaces: data.spaces, pages: data.pages,
    warnings: settings().mock ? ['Notion sample data — live access is not configured'] : [] };
}

async function searchNotion(query: string): Promise<DocumentSearch> {
  const text = query.trim();
  if (text.length < 2 || text.length > 120) throw new Error('Search for 2 to 120 characters');
  const data = await catalog();
  const term = text.toLocaleLowerCase();
  const matches: { hit: DocumentSearchHit; score: number }[] = [];
  for (const page of data.rows) {
    const title = pageTitle(page);
    const body = await content(page);
    const titleIndex = title.toLocaleLowerCase().indexOf(term);
    const bodyIndex = body.text.toLocaleLowerCase().indexOf(term);
    if (titleIndex < 0 && bodyIndex < 0) continue;
    matches.push({ score: (titleIndex >= 0 ? 100 : 0) + (bodyIndex >= 0 ? 20 : 0), hit: { id: page.id, title, spaceKey: 'workspace', spaceName: 'Notion', type: 'page',
      excerpt: bodyIndex >= 0 ? body.text.slice(Math.max(0, bodyIndex - 75), bodyIndex + text.length + 130).trim() : null, url: settings().mock ? '' : page.url } });
  }
  matches.sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title));
  return { source: 'notion', query: text, results: matches.slice(0, 25).map((row) => row.hit), searchUrl: null,
    warnings: settings().mock ? ['Notion sample data — live access is not configured'] : [] };
}

async function getNotionPage(id: string): Promise<DocumentContent> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id)) throw new Error('Invalid Notion page ID');
  const page = (await catalog()).rows.find((item) => item.id === id);
  if (!page) throw new Error('Notion page is outside the integration access');
  const body = await content(page);
  return { source: 'notion', id, title: pageTitle(page), spaceKey: 'workspace', url: settings().mock ? '' : page.url,
    html: body.html, version: 0, updatedAt: page.last_edited_time ?? null };
}

export const notionDocumentsAdapter: DocumentationAdapter = { source: 'notion', load: loadNotion, search: searchNotion, getPage: getNotionPage };
