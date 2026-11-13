import { confluenceAdapter } from './confluence.js';
import { githubDocumentsAdapter } from './github.js';
import { notionDocumentsAdapter } from './notion.js';
import type { DocumentationAdapter, DocumentContent, DocumentSearch, DocumentSnapshot, DocumentSource } from './types.js';

const adapters: Record<DocumentSource, DocumentationAdapter> = { confluence: confluenceAdapter, github: githubDocumentsAdapter, notion: notionDocumentsAdapter };

function selectedAdapters(): DocumentationAdapter[] {
  const names = (process.env.DOCUMENTATION_PROVIDERS || process.env.DOCUMENTATION_PROVIDER || 'confluence').split(',').map((name) => name.trim()).filter(Boolean);
  const unique = [...new Set(names)];
  if (!unique.length || unique.some((name) => !(name in adapters))) throw new Error('DOCUMENTATION_PROVIDERS must list confluence, github, and/or notion');
  return unique.map((name) => adapters[name as DocumentSource]);
}

function qualified(source: DocumentSource, id: string): string { return `${source}:${id}`; }

function sourceForId(id: string): { adapter: DocumentationAdapter; rawId: string } {
  const match = /^(confluence|github|notion):(.+)$/.exec(id);
  if (match) {
    const adapter = adapters[match[1] as DocumentSource];
    if (!selectedAdapters().includes(adapter)) throw new Error('Document provider is not enabled');
    return { adapter, rawId: match[2] };
  }
  const selected = selectedAdapters();
  if (selected.length === 1) return { adapter: selected[0], rawId: id };
  if (/^\d+$/.test(id) && selected.includes(confluenceAdapter)) return { adapter: confluenceAdapter, rawId: id };
  throw new Error('Document ID must include its provider');
}

export async function getDocuments(): Promise<DocumentSnapshot> {
  const selected = selectedAdapters();
  if (selected.length === 1) return selected[0].load();
  const settled = await Promise.allSettled(selected.map((adapter) => adapter.load()));
  const spaces: DocumentSnapshot['spaces'] = [];
  const pages: DocumentSnapshot['pages'] = [];
  const warnings: string[] = [];
  selected.forEach((adapter, index) => {
    const result = settled[index];
    if (result.status === 'rejected') { warnings.push(`${adapter.source} documentation is unavailable`); return; }
    warnings.push(...(result.value.warnings ?? []));
    spaces.push(...result.value.spaces.map((space) => ({ ...space, source: adapter.source, key: qualified(adapter.source, space.key) })));
    pages.push(...result.value.pages.map((page) => ({ ...page, source: adapter.source, id: qualified(adapter.source, page.id), spaceKey: qualified(adapter.source, page.spaceKey), parentId: page.parentId ? qualified(adapter.source, page.parentId) : null })));
  });
  if (!spaces.length && warnings.length === selected.length) throw new Error('No documentation provider is available');
  return { source: 'mixed', sources: [...new Set(spaces.map((space) => space.source).filter((source): source is DocumentSource => Boolean(source)))],
    fetchedAt: new Date().toISOString(), spaces, pages, warnings };
}

export async function searchDocuments(query: string): Promise<DocumentSearch> {
  const selected = selectedAdapters();
  if (selected.length === 1) return selected[0].search(query);
  const settled = await Promise.allSettled(selected.map((adapter) => adapter.search(query)));
  const groups: DocumentSearch['results'][] = [];
  const warnings: string[] = [];
  let searchUrl: string | null = null;
  selected.forEach((adapter, index) => {
    const result = settled[index];
    if (result.status === 'rejected') { warnings.push(`${adapter.source} search is unavailable`); return; }
    warnings.push(...(result.value.warnings ?? []));
    searchUrl ||= result.value.searchUrl;
    groups.push(result.value.results.map((hit) => ({ ...hit, source: adapter.source, id: qualified(adapter.source, hit.id), spaceKey: qualified(adapter.source, hit.spaceKey) })));
  });
  if (!groups.length) throw new Error('Document search is unavailable');
  const results: DocumentSearch['results'] = [];
  for (let index = 0; results.length < 60 && groups.some((group) => index < group.length); index++) {
    for (const group of groups) if (group[index]) results.push(group[index]);
  }
  return { source: 'mixed', query, results, searchUrl, warnings };
}

export async function getDocumentPage(id: string): Promise<DocumentContent> {
  const { adapter, rawId } = sourceForId(id);
  const page = await adapter.getPage(rawId);
  return id.startsWith(`${adapter.source}:`) ? { ...page, id, spaceKey: qualified(adapter.source, page.spaceKey) } : page;
}
