import type { DocumentationAdapter, DocumentPage, DocumentSnapshot, DocumentSpace } from './types.js';

interface SpaceRow { key: string; name: string; type: string; _links?: { webui?: string } }
interface PageRow { id: string; title: string; _links?: { webui?: string } }
interface Page<T> { results: T[]; _links?: { next?: string } }

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
  return path ? new URL(`/wiki${path.startsWith('/') ? path : `/${path}`}`, base).toString() : `${base}/wiki`;
}

async function loadConfluence(): Promise<DocumentSnapshot> {
  const { base, email, token, selected } = settings();
  const available = await allPages<SpaceRow>(base, email, token, '/wiki/rest/api/space?limit=100');
  const rows = available.filter((space) => selected.length ? selected.includes(space.key) : space.type === 'global');
  if (selected.length && rows.length !== selected.length) throw new Error('A selected Confluence space was not found or is inaccessible');
  const spaces: DocumentSpace[] = rows.map((space) => ({ key: space.key, name: space.name, url: webUrl(base, space._links?.webui) }));
  const pages: DocumentPage[] = [];
  for (const space of rows) {
    const endpoint = `/wiki/rest/api/content?type=page&spaceKey=${encodeURIComponent(space.key)}&limit=100`;
    const content = await allPages<PageRow>(base, email, token, endpoint, 10);
    pages.push(...content.map((page) => ({ id: page.id, spaceKey: space.key, title: page.title, url: webUrl(base, page._links?.webui) })));
  }
  return { source: 'confluence', fetchedAt: new Date().toISOString(), spaces, pages };
}

export const confluenceAdapter: DocumentationAdapter = { source: 'confluence', load: loadConfluence };
