import { useEffect, useMemo, useState } from 'react';
import './documents.css';

interface Space { key: string; name: string; url: string }
interface Page { id: string; spaceKey: string; title: string; url: string; parentId: string | null }
interface Snapshot { source: 'confluence'; fetchedAt: string; spaces: Space[]; pages: Page[] }
interface Hit { id: string; title: string; spaceKey: string; spaceName: string; type: 'page' | 'blogpost'; excerpt: string | null; url: string }
interface SearchResponse { source: 'confluence'; query: string; results: Hit[]; searchUrl: string }
interface Content { source: 'confluence'; id: string; title: string; spaceKey: string; url: string; html: string; version: number; updatedAt: string | null }

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Documentation is unavailable');
  return body;
}

function PageTree({ space, pages, selectedId, onSelect }: { space: Space; pages: Page[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const ordered = useMemo(() => {
    const byParent = new Map<string | null, Page[]>();
    const ids = new Set(pages.map((page) => page.id));
    for (const page of pages) {
      const parent = page.parentId && ids.has(page.parentId) && page.parentId !== page.id ? page.parentId : null;
      byParent.set(parent, [...(byParent.get(parent) ?? []), page]);
    }
    for (const siblings of byParent.values()) siblings.sort((a, b) => a.title.localeCompare(b.title));
    const result: { page: Page; depth: number }[] = [];
    const seen = new Set<string>();
    function visit(parent: string | null, depth: number) {
      for (const page of byParent.get(parent) ?? []) {
        if (seen.has(page.id)) continue;
        seen.add(page.id);
        result.push({ page, depth });
        visit(page.id, depth + 1);
      }
    }
    visit(null, 0);
    for (const page of pages) if (!seen.has(page.id)) result.push({ page, depth: 0 });
    return result;
  }, [pages]);
  return <section className="docs-space" aria-label={space.name}>
    <div className="docs-space-heading"><span className="docs-space-glyph" aria-hidden="true">▦</span><span title={space.name}>{space.name}</span><span className="docs-space-count">{pages.length}</span></div>
    {ordered.map(({ page, depth }) => <button key={page.id} type="button" className={`docs-tree-page${selectedId === page.id ? ' active' : ''}`} style={{ paddingLeft: `${14 + Math.min(depth, 8) * 17}px` }} onClick={() => onSelect(page.id)} title={page.title} aria-current={selectedId === page.id ? 'page' : undefined}><span className="docs-page-glyph" aria-hidden="true">▤</span><span>{page.title}</span></button>)}
    {!pages.length ? <p className="docs-empty-space">No pages in this space.</p> : null}
  </section>;
}

export default function DocumentsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [contentError, setContentError] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);
    fetch('/api/documents', { signal: controller.signal }).then(readResponse<Snapshot>)
      .then((body) => { setSnapshot(body); setCatalogError(''); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : 'Could not load documents'); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setSearch(null); setSearchError(''); setSearchLoading(false); return; }
    const controller = new AbortController();
    setSearch(null);
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/documents/search?q=${encodeURIComponent(text)}`, { signal: controller.signal }).then(readResponse<SearchResponse>)
        .then((body) => { setSearch(body); setSearchError(''); })
        .catch((error: unknown) => { if (!controller.signal.aborted) { setSearch(null); setSearchError(error instanceof Error ? error.message : 'Search failed'); } })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (!selectedId) { setContent(null); return; }
    const controller = new AbortController();
    setContentLoading(true);
    setContent(null);
    fetch(`/api/documents/${encodeURIComponent(selectedId)}`, { signal: controller.signal }).then(readResponse<Content>)
      .then((body) => { setContent(body); setContentError(''); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setContentError(error instanceof Error ? error.message : 'Could not open the page'); })
      .finally(() => { if (!controller.signal.aborted) setContentLoading(false); });
    return () => controller.abort();
  }, [selectedId]);

  const searching = query.trim().length >= 2;
  const pagesBySpace = useMemo(() => {
    const map = new Map<string, Page[]>();
    for (const page of snapshot?.pages ?? []) map.set(page.spaceKey, [...(map.get(page.spaceKey) ?? []), page]);
    return map;
  }, [snapshot]);

  return <section className="documents-page" aria-labelledby="documents-heading">
    <div className="docs-intro"><div><div className="eyebrow"><span className="eyebrow-dot" /> Workspace / Knowledge</div><h1 id="documents-heading" className="docs-title">Knowledge<span>.</span></h1><p>Find answers across your documentation, then read them here or continue in Confluence.</p></div><div className="docs-source-pill"><span className="docs-source-dot" /> Confluence</div></div>
    <div className="docs-search-bar"><span aria-hidden="true" className="docs-search-icon">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and their contents" aria-label="Search documentation" maxLength={120} /><kbd>Search</kbd></div>
    <div className="docs-layout">
      <aside className="docs-sidebar" aria-label="Document tree"><div className="docs-sidebar-top"><div><strong>Spaces</strong><span>{snapshot?.spaces.length ?? 0} connected</span></div><button type="button" onClick={() => setRevision((value) => value + 1)} title="Refresh spaces and pages" aria-label="Refresh documents">↻</button></div>
        {catalogLoading ? <p className="docs-hint">Loading documentation…</p> : catalogError ? <p className="docs-error" role="alert">{catalogError}</p> : snapshot?.spaces.length ? snapshot.spaces.map((space) => <PageTree key={space.key} space={space} pages={pagesBySpace.get(space.key) ?? []} selectedId={selectedId} onSelect={setSelectedId} />) : <p className="docs-hint">No spaces found. Check your Confluence configuration.</p>}
      </aside>
      <div className={`docs-workspace${searching ? ' is-searching' : ''}`}>
        {searching ? <section className="docs-results" aria-label="Search results"><div className="docs-panel-heading"><div><strong>Results</strong><span>{searchLoading ? 'Searching Confluence…' : search ? `${search.results.length} most relevant` : ' '}</span></div>{search?.searchUrl ? <a href={search.searchUrl} target="_blank" rel="noopener noreferrer">See all ↗</a> : null}</div>
          {searchError ? <p className="docs-error" role="alert">{searchError}</p> : null}
          {!searchLoading && !searchError && search?.results.length === 0 ? <p className="docs-hint">No results found. Try another term.</p> : null}
          {search?.results.map((hit) => <button className={`docs-hit${selectedId === hit.id ? ' active' : ''}`} key={`${hit.type}-${hit.id}`} type="button" onClick={() => setSelectedId(hit.id)}><span className="docs-hit-type">{hit.spaceName} · {hit.type === 'blogpost' ? 'Blog' : 'Page'}</span><strong>{hit.title}</strong>{hit.excerpt ? <span className="docs-hit-excerpt">{hit.excerpt}</span> : null}</button>)}
        </section> : null}
        <article className="docs-reader" aria-live="polite">{contentLoading ? <div className="docs-reader-empty">Opening page…</div> : contentError ? <div className="docs-reader-empty docs-error" role="alert">{contentError}</div> : content ? <><div className="docs-reader-meta"><span>Confluence / {snapshot?.spaces.find((space) => space.key === content.spaceKey)?.name ?? content.spaceKey}</span><span>{content.updatedAt ? `Updated ${new Date(content.updatedAt).toLocaleDateString()}` : `Version ${content.version}`}</span></div><div className="docs-reader-header"><h2>{content.title}</h2><a href={content.url} target="_blank" rel="noopener noreferrer">Open in Confluence ↗</a></div><div className="docs-reader-body" dangerouslySetInnerHTML={{ __html: content.html }} /></> : <div className="docs-reader-empty"><span className="docs-empty-icon" aria-hidden="true">▤</span><h2>Choose a page to read</h2><p>Browse a space or search for the answer you need.</p></div>}</article>
      </div>
    </div>
  </section>;
}
