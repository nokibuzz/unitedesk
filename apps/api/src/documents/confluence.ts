import sanitizeHtml from 'sanitize-html';
import type { DocumentationAdapter, DocumentContent, DocumentPage, DocumentSearch, DocumentSearchHit, DocumentSnapshot, DocumentSpace } from './types.js';

interface SpaceRow { key: string; name: string; type: string; _links?: { webui?: string } }
interface PageRow { id: string; title: string; ancestors?: { id: string }[]; _links?: { webui?: string } }
interface Page<T> { results: T[]; _links?: { next?: string } }
interface SearchRow { content?: { id?: string; title?: string; type?: string; space?: { key?: string; name?: string }; _links?: { webui?: string } }; excerpt?: string; url?: string; title?: string; resultGlobalContainer?: { title?: string } }
interface ContentRow { id: string; title: string; space?: { key?: string }; version?: { number?: number; when?: string }; body?: { view?: { value?: string } }; _links?: { webui?: string } }

function settings() {
  const raw = process.env.CONFLUENCE_URL?.trim();
  const email = process.env.CONFLUENCE_EMAIL?.trim();
  const token = process.env.CONFLUENCE_API_TOKEN?.trim();
  if (!raw || !email || !token) throw new Error('Set CONFLUENCE_URL, CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN for Confluence access');
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('CONFLUENCE_URL must be an HTTP base URL without credentials');
  return { base: url.origin, email, token, selected: process.env.CONFLUENCE_SPACE_KEYS?.split(',').map((key) => key.trim()).filter(Boolean) ?? [] };
}

async function confluenceGet<T>(base: string, email: string, token: string, endpoint: string): Promise<T> {
  const response = await fetch(new URL(endpoint, `${base}/`), {
    headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Confluence request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function allPages<T>(base: string, email: string, token: string, endpoint: string, maxPages = 100): Promise<T[]> {
  const rows: T[] = [];
  let next: string | null = endpoint;
  for (let page = 0; next && page < maxPages; page++) {
    const data: Page<T> = await confluenceGet(base, email, token, next);
    if (!Array.isArray(data.results)) throw new Error('Unexpected Confluence list response');
    rows.push(...data.results);
    if (data._links?.next) {
      const link = data._links.next;
      next = /^https?:\/\//.test(link) ? link : new URL(link.startsWith('/wiki/') ? link : `/wiki/${link.replace(/^\//, '')}`, base).toString();
      if (new URL(next).origin !== new URL(base).origin) throw new Error('Confluence pagination left the configured site');
    } else next = null;
    if (next && page === maxPages - 1) throw new Error('Confluence list exceeded the page limit');
  }
  return rows;
}

function webUrl(base: string, path: string | undefined): string {
  if (!path) return `${base}/wiki`;
  const target = /^https?:\/\//i.test(path) ? path : path.startsWith('/wiki/') ? path : `/wiki${path.startsWith('/') ? path : `/${path}`}`;
  const resolved = new URL(target, base);
  return resolved.origin === new URL(base).origin && ['http:', 'https:'].includes(resolved.protocol) ? resolved.toString() : `${base}/wiki`;
}

async function loadConfluence(): Promise<DocumentSnapshot> {
  const { base, email, token, selected } = settings();
  const available = await allPages<SpaceRow>(base, email, token, '/wiki/rest/api/space?limit=100');
  const rows = available.filter((space) => selected.length ? selected.includes(space.key) : space.type === 'global');
  if (selected.length && rows.length !== selected.length) throw new Error('A selected Confluence space was not found or is inaccessible');
  const spaces: DocumentSpace[] = rows.map((space) => ({ key: space.key, name: space.name, url: webUrl(base, space._links?.webui) }));
  const pages: DocumentPage[] = [];
  for (const space of rows) {
    const endpoint = `/wiki/rest/api/content?type=page&spaceKey=${encodeURIComponent(space.key)}&expand=ancestors&limit=100`;
    const content = await allPages<PageRow>(base, email, token, endpoint, 10);
    pages.push(...content.map((page) => ({ id: page.id, spaceKey: space.key, title: page.title, url: webUrl(base, page._links?.webui), parentId: page.ancestors?.at(-1)?.id ?? null })));
  }
  return { source: 'confluence', fetchedAt: new Date().toISOString(), spaces, pages };
}

function cqlPhrase(value: string): string { return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }

async function searchConfluence(query: string): Promise<DocumentSearch> {
  const { base, email, token, selected } = settings();
  const text = query.trim();
  if (text.length < 2 || text.length > 120) throw new Error('Search for 2 to 120 characters');
  const searchUrl = new URL('/wiki/search', base);
  searchUrl.searchParams.set('text', text);
  const scope = selected.length ? ` AND space IN (${selected.map(cqlPhrase).join(',')})` : '';
  const cql = `siteSearch ~ ${cqlPhrase(text)} AND type IN (page,blogpost)${scope}`;
  const endpoint = new URL('/wiki/rest/api/search', base);
  endpoint.searchParams.set('cql', cql);
  endpoint.searchParams.set('limit', '25');
  endpoint.searchParams.set('excerpt', 'highlight');
  endpoint.searchParams.set('expand', 'content.space');
  const payload = await confluenceGet<Page<SearchRow>>(base, email, token, endpoint.toString());
  if (!Array.isArray(payload.results)) throw new Error('Unexpected Confluence search response');
  const results: DocumentSearchHit[] = [];
  for (const row of payload.results) {
    const item = row.content;
    const spaceKey = item?.space?.key;
    if (!item?.id || !item.title || !spaceKey || (item.type !== 'page' && item.type !== 'blogpost')) continue;
    if (!selected.length && spaceKey.startsWith('~')) continue;
    const excerpt = row.excerpt ? sanitizeHtml(row.excerpt.replaceAll('@@@hl@@@', '').replaceAll('@@@endhl@@@', ''), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim() : '';
    results.push({ id: item.id, title: item.title, spaceKey, spaceName: item.space?.name || row.resultGlobalContainer?.title || spaceKey,
      type: item.type, excerpt: excerpt || null, url: webUrl(base, item._links?.webui || row.url) });
  }
  return { source: 'confluence', query: text, results, searchUrl: searchUrl.toString() };
}

async function getConfluencePage(id: string): Promise<DocumentContent> {
  if (!/^\d{1,20}$/.test(id)) throw new Error('Invalid Confluence page ID');
  const { base, email, token, selected } = settings();
  const row = await confluenceGet<ContentRow>(base, email, token, `/wiki/rest/api/content/${id}?expand=body.view,space,version`);
  const spaceKey = row.space?.key;
  if (!spaceKey || (selected.length ? !selected.includes(spaceKey) : spaceKey.startsWith('~'))) throw new Error('This Confluence page is outside the selected spaces');
  const original = row.body?.view?.value;
  if (typeof original !== 'string') throw new Error('Confluence did not return a readable page body');
  const html = sanitizeHtml(original, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'code'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'] },
    transformTags: { a: (_tag, attributes) => {
      const plain = { tagName: 'span', attribs: {} as Record<string, string> };
      const href = attributes.href;
      if (!href) return plain;
      try {
        const normalized = href.startsWith('/') && !href.startsWith('/wiki/') ? `/wiki${href}` : href;
        const resolved = new URL(normalized, `${base}/wiki/`);
        return ['http:', 'https:'].includes(resolved.protocol) ? { tagName: 'a', attribs: { href: resolved.toString(), target: '_blank', rel: 'noopener noreferrer' } } : plain;
      } catch { return plain; }
    } },
  });
  return { source: 'confluence', id: row.id, title: row.title, spaceKey, url: webUrl(base, row._links?.webui), html,
    version: row.version?.number ?? 0, updatedAt: row.version?.when ?? null };
}

export const confluenceAdapter: DocumentationAdapter = { source: 'confluence', load: loadConfluence, search: searchConfluence, getPage: getConfluencePage };
