import { createHash } from 'node:crypto';
import path from 'node:path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { DocumentationAdapter, DocumentContent, DocumentPage, DocumentSearch, DocumentSearchHit, DocumentSnapshot, DocumentSpace } from './types.js';

interface Repository { full_name: string; default_branch: string; html_url: string; archived?: boolean }
interface Tree { tree: { path: string; type: string; sha: string; size?: number }[]; truncated?: boolean }
interface Blob { content: string; encoding: string; size: number }
interface FileRow { repo: Repository; path: string; sha: string; id: string; spaceKey: string; url: string; title: string }
interface Catalog { spaces: DocumentSpace[]; pages: DocumentPage[]; files: FileRow[] }
const CACHE_MS = 5 * 60_000;
const MAX_FILES = 100;
let catalogCache: { key: string; at: number; value: Catalog } | null = null;
const contentCache = new Map<string, { at: number; markdown: string }>();

function settings() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const raw = process.env.GITHUB_API_URL?.trim() || 'https://api.github.com';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('GITHUB_API_URL must be an HTTPS base URL without credentials');
  if (!token) throw new Error('Set GITHUB_TOKEN for GitHub Markdown documents');
  const repos = [...new Set((process.env.GITHUB_DOCS_REPOS || '').split(',').map((value) => value.trim()).filter(Boolean))];
  if (!repos.length || repos.length > 10 || repos.some((repo) => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))) throw new Error('GITHUB_DOCS_REPOS must list 1 to 10 owner/repo names');
  const roots = (process.env.GITHUB_DOCS_PATHS || 'docs/,README.md').split(',').map((value) => value.trim()).filter(Boolean);
  if (!roots.length || roots.some((value) => value.startsWith('/') || value.includes('..'))) throw new Error('GITHUB_DOCS_PATHS must contain repository-relative paths');
  const key = createHash('sha256').update(JSON.stringify({ base: url.toString(), repos, roots, token })).digest('hex');
  return { base: url.toString().replace(/\/$/, ''), token, repos, roots, key };
}

async function githubGet<T>(base: string, token: string, endpoint: string): Promise<T> {
  const response = await fetch(`${base}${endpoint}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub documentation request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function encoded(value: string): string { return value.split('/').map(encodeURIComponent).join('/'); }
function matches(pathname: string, roots: string[]): boolean { return roots.some((root) => pathname === root || pathname.startsWith(root.endsWith('/') ? root : `${root}/`)); }
function title(pathname: string): string { return path.basename(pathname).replace(/\.md$/i, '').replace(/[-_]/g, ' '); }
function fileId(repo: string, pathname: string): string { return `file.${Buffer.from(JSON.stringify([repo, pathname])).toString('base64url')}`; }
function folderId(repo: string, pathname: string): string { return `folder.${Buffer.from(JSON.stringify([repo, pathname])).toString('base64url')}`; }
function parseFileId(id: string): [string, string] {
  if (!/^file\.[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid GitHub document ID');
  try {
    const data: unknown = JSON.parse(Buffer.from(id.slice(5), 'base64url').toString('utf8'));
    if (Array.isArray(data) && data.length === 2 && data.every((value) => typeof value === 'string')) return data as [string, string];
  } catch { /* invalid identifier */ }
  throw new Error('Invalid GitHub document ID');
}

async function catalog(): Promise<Catalog> {
  const config = settings();
  if (catalogCache?.key === config.key && Date.now() - catalogCache.at < CACHE_MS) return catalogCache.value;
  const spaces: DocumentSpace[] = [];
  const pages: DocumentPage[] = [];
  const files: FileRow[] = [];
  for (const name of config.repos) {
    const prefix = `/repos/${encoded(name)}`;
    const repo = await githubGet<Repository>(config.base, config.token, prefix);
    if (repo.archived || repo.full_name.toLowerCase() !== name.toLowerCase()) throw new Error('A GitHub documentation repository is archived or inaccessible');
    const branch = encodeURIComponent(repo.default_branch);
    const tree = await githubGet<Tree>(config.base, config.token, `${prefix}/git/trees/${branch}?recursive=1`);
    if (tree.truncated) throw new Error('GitHub documentation tree is too large; choose a smaller repository');
    const selected = tree.tree.filter((row) => row.type === 'blob' && /\.md$/i.test(row.path) && matches(row.path, config.roots) && (row.size ?? 0) <= 1_000_000);
    if (files.length + selected.length > MAX_FILES) throw new Error(`GitHub documentation exceeds ${MAX_FILES} Markdown files; narrow GITHUB_DOCS_PATHS`);
    spaces.push({ key: repo.full_name, name: repo.full_name, url: repo.html_url });
    const folders = new Set<string>();
    for (const row of selected) {
      const parts = row.path.split('/');
      for (let count = 1; count < parts.length; count++) folders.add(parts.slice(0, count).join('/'));
      const id = fileId(repo.full_name, row.path);
      const url = `${repo.html_url}/blob/${encoded(repo.default_branch)}/${encoded(row.path)}`;
      pages.push({ id, spaceKey: repo.full_name, title: title(row.path), url, parentId: parts.length > 1 ? folderId(repo.full_name, parts.slice(0, -1).join('/')) : null });
      files.push({ repo, path: row.path, sha: row.sha, id, spaceKey: repo.full_name, url, title: title(row.path) });
    }
    for (const folder of folders) {
      const parent = path.posix.dirname(folder);
      pages.push({ id: folderId(repo.full_name, folder), spaceKey: repo.full_name, title: path.posix.basename(folder), url: `${repo.html_url}/tree/${encoded(repo.default_branch)}/${encoded(folder)}`,
        parentId: parent === '.' ? null : folderId(repo.full_name, parent), kind: 'folder' });
    }
  }
  const value = { spaces, pages, files };
  catalogCache = { key: config.key, at: Date.now(), value };
  return value;
}

async function markdown(file: FileRow): Promise<string> {
  const config = settings();
  const key = `${config.key}:${file.repo.full_name}:${file.sha}`;
  const cached = contentCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.markdown;
  const blob = await githubGet<Blob>(config.base, config.token, `/repos/${encoded(file.repo.full_name)}/git/blobs/${encodeURIComponent(file.sha)}`);
  if (blob.encoding !== 'base64' || blob.size > 1_000_000) throw new Error('GitHub Markdown file is too large or has an unsupported encoding');
  const value = Buffer.from(blob.content.replace(/\s/g, ''), 'base64').toString('utf8');
  contentCache.set(key, { at: Date.now(), markdown: value });
  return value;
}

function render(file: FileRow, text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  const base = `${file.repo.html_url}/blob/${encoded(file.repo.default_branch)}/${encoded(path.posix.dirname(file.path))}/`;
  return sanitizeHtml(raw, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'code'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'] },
    transformTags: { a: (_tag, attributes) => {
      const fallback = { tagName: 'span', attribs: {} as Record<string, string> };
      if (!attributes.href) return fallback;
      try {
        const target = new URL(attributes.href, base);
        return ['https:', 'http:'].includes(target.protocol) ? { tagName: 'a', attribs: { href: target.toString(), target: '_blank', rel: 'noopener noreferrer' } } : fallback;
      } catch { return fallback; }
    } },
  });
}

async function loadGitHubDocuments(): Promise<DocumentSnapshot> {
  const data = await catalog();
  return { source: 'github', fetchedAt: new Date().toISOString(), spaces: data.spaces, pages: data.pages };
}

async function searchGitHubDocuments(query: string): Promise<DocumentSearch> {
  const text = query.trim();
  if (text.length < 2 || text.length > 120) throw new Error('Search for 2 to 120 characters');
  const data = await catalog();
  const term = text.toLocaleLowerCase();
  const results: { hit: DocumentSearchHit; score: number }[] = [];
  for (let start = 0; start < data.files.length; start += 4) {
    const batch = await Promise.all(data.files.slice(start, start + 4).map(async (file) => ({ file, body: await markdown(file) })));
    for (const { file, body } of batch) {
      const plain = sanitizeHtml(marked.parse(body, { async: false }) as string, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ');
      const titleIndex = file.title.toLocaleLowerCase().indexOf(term);
      const bodyIndex = plain.toLocaleLowerCase().indexOf(term);
      if (titleIndex < 0 && bodyIndex < 0) continue;
      const excerpt = bodyIndex >= 0 ? plain.slice(Math.max(0, bodyIndex - 75), bodyIndex + text.length + 130).trim() : null;
      results.push({ score: (titleIndex >= 0 ? 100 : 0) + (bodyIndex >= 0 ? 20 : 0), hit: { id: file.id, title: file.title, spaceKey: file.spaceKey, spaceName: file.repo.full_name, type: 'page', excerpt, url: file.url } });
    }
  }
  results.sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title));
  return { source: 'github', query: text, results: results.slice(0, 25).map((row) => row.hit), searchUrl: null };
}

async function getGitHubDocument(id: string): Promise<DocumentContent> {
  const [repo, pathname] = parseFileId(id);
  const file = (await catalog()).files.find((row) => row.repo.full_name === repo && row.path === pathname);
  if (!file) throw new Error('GitHub Markdown page is outside the configured repositories');
  return { source: 'github', id, title: file.title, spaceKey: file.spaceKey, url: file.url, html: render(file, await markdown(file)), version: 0, updatedAt: null };
}

export const githubDocumentsAdapter: DocumentationAdapter = { source: 'github', load: loadGitHubDocuments, search: searchGitHubDocuments, getPage: getGitHubDocument };
