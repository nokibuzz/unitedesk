import { useEffect, useMemo, useState } from 'react';
import { filterMergeRequests, pipelineValue, type ApprovalFilter, type Sort, type View } from './filter';
import type { MergeRequest, Person, ReviewSnapshot } from './types';
import './reviews.css';

const PAGE_SIZE = 12;
function age(createdAt: string): string {
  const ms = Date.now() - Date.parse(createdAt);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : hours ? `${hours}h` : `${Math.floor(ms / 60_000)}m`;
}
function personLabel(person: Person): string { return person.name === person.username ? `@${person.username}` : `${person.name} (@${person.username})`; }
function approvalLabel(item: MergeRequest): string {
  if (item.approval.approved === null) return 'Approval unavailable';
  if (item.approval.approved) return 'Approved';
  if (item.approval.left != null) return `${item.approval.left} approval${item.approval.left === 1 ? '' : 's'} needed`;
  return 'Unapproved';
}
function pipelineLabel(status: string | null, known = true): string { return !known ? 'Unavailable' : status ? status.replaceAll('_', ' ') : 'No pipeline'; }
function options(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function MrCard({ item, mock }: { item: MergeRequest; mock: boolean }) {
  const pipelineTone = item.pipelineStatus === 'failed' ? 'danger' : item.pipelineStatus === 'success' ? 'success' : item.pipelineStatus === 'running' || item.pipelineStatus === 'pending' ? 'active' : 'neutral';
  const approvalTone = item.approval.approved ? 'success' : item.approval.approved === false ? 'pending' : 'neutral';
  return <article className="review-card">
    <div className="review-card-main"><div className="review-card-overline"><span>{item.project}</span><span>!{item.iid}</span>{item.draft ? <span className="review-badge" data-tone="neutral">Draft</span> : null}</div>
      <h2>{mock ? item.title : <a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a>}</h2>
      <p className="review-branches" title={`${item.sourceBranch} → ${item.targetBranch}`}><code>{item.sourceBranch}</code><span>→</span><code>{item.targetBranch}</code></p>
    </div>
    <div className="review-card-people"><span className="review-meta-label">Author</span><strong title={personLabel(item.author)}>{item.author.name}</strong><span className="review-meta-label">Reviewers</span><span title={item.reviewers.map(personLabel).join(', ')}>{item.reviewers.length ? item.reviewers.map((person) => person.name).join(', ') : 'None assigned'}</span></div>
    <div className="review-card-status"><div><span className="review-meta-label">Pipeline</span><span className="review-badge" data-tone={pipelineTone}>{pipelineLabel(item.pipelineStatus, item.pipelineKnown)}</span></div><div><span className="review-meta-label">Approval</span><span className="review-badge" data-tone={approvalTone}>{approvalLabel(item)}</span></div>{item.approvedBy.length ? <small title={item.approvedBy.map(personLabel).join(', ')}>Approved by {item.approvedBy.map((person) => person.name).join(', ')}</small> : null}</div>
    <div className="review-card-age"><span className="review-meta-label">Open for</span><strong>{age(item.createdAt)}</strong>{item.aging ? <span className="review-badge" data-tone="pending">Aging</span> : null}</div>
  </article>;
}

export default function ReviewQueuePage() {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const [author, setAuthor] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [project, setProject] = useState('');
  const [target, setTarget] = useState('');
  const [pipeline, setPipeline] = useState('');
  const [approval, setApproval] = useState<ApprovalFilter>('all');
  const [sort, setSort] = useState<Sort>('oldest');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/merge-requests${revision ? '?refresh=1' : ''}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json() as ReviewSnapshot & { error?: string }; if (!response.ok) throw new Error(body.error || 'Could not load merge requests'); return body; })
      .then((body) => { setSnapshot(body); setError(''); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load merge requests'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const items = snapshot?.items ?? [];
  const authors = useMemo(() => options(items.map((item) => item.author.username)), [items]);
  const reviewers = useMemo(() => options(items.flatMap((item) => item.reviewers.map((person) => person.username))), [items]);
  const projects = useMemo(() => options(items.map((item) => item.project)), [items]);
  const targets = useMemo(() => options(items.map((item) => item.targetBranch)), [items]);
  const pipelines = useMemo(() => options(items.map(pipelineValue)), [items]);
  const filtered = useMemo(() => filterMergeRequests(items, { view, search, author, reviewer, project, target, pipeline, approval, sort }), [items, view, author, reviewer, project, target, pipeline, approval, search, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const views: Array<{ id: View; label: string; count: number }> = [
    { id: 'all', label: 'All open', count: items.length },
    { id: 'mine', label: 'My merge requests', count: items.filter((item) => item.mine).length },
    { id: 'review', label: 'For my review', count: items.filter((item) => item.waitingForMe).length },
    { id: 'aging', label: 'Aging', count: items.filter((item) => item.aging).length },
  ];
  const activeFilters = [
    author && { label: `Author: @${author}`, clear: () => setAuthor('') },
    reviewer && { label: `Reviewer: @${reviewer}`, clear: () => setReviewer('') },
    project && { label: `Project: ${project}`, clear: () => setProject('') },
    target && { label: `Target: ${target}`, clear: () => setTarget('') },
    pipeline && { label: `Pipeline: ${pipelineLabel(pipeline === 'none' ? null : pipeline, pipeline !== 'unavailable')}`, clear: () => setPipeline('') },
    approval !== 'all' && { label: `Approval: ${{ needed: 'Unapproved', approved: 'Approved', unknown: 'Unavailable' }[approval]}`, clear: () => setApproval('all') },
    sort !== 'oldest' && { label: `Sort: ${sort === 'newest' ? 'Newest first' : 'Recently updated'}`, clear: () => setSort('oldest') },
  ].filter((filter): filter is { label: string; clear: () => void } => Boolean(filter));
  const hasFilters = Boolean(search) || activeFilters.length > 0;
  function resetFilters() { setSearch(''); setAuthor(''); setReviewer(''); setProject(''); setTarget(''); setPipeline(''); setApproval('all'); setSort('oldest'); setPage(1); }
  return <section className="reviews-page" aria-labelledby="reviews-heading">
    <div className="sprint-heading-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> Code / GitLab</div><h1 id="reviews-heading" className="sprint-title">Review Queue<span className="title-period">.</span></h1><p className="sprint-description">Open changes, reviews waiting on you, and the details that move work forward.</p></div><button className="refresh-button" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? 'Loading…' : 'Refresh'}</button></div>
    {error ? <div className="sprint-alert" role="alert">{error}</div> : null}
    {snapshot ? <>
      <div className="review-context"><div><span className="context-label">GitLab group</span><strong>{snapshot.group}</strong></div><div className="context-meta"><span className="source-badge">{snapshot.source === 'mock' ? 'Mock data' : 'Live GitLab'}</span><span>Viewing as @{snapshot.viewer.username}</span><span>Updated {new Date(snapshot.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span></div></div>
      <div className="review-views" role="group" aria-label="Merge request views">{views.map((item) => <button key={item.id} type="button" aria-pressed={view === item.id} className={view === item.id ? 'review-view active' : 'review-view'} onClick={() => { setView(item.id); setPage(1); }}><span>{item.label}</span><strong>{item.count}</strong></button>)}</div>
      <div className="review-toolbar">
        <label className="review-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.7" cy="8.7" r="5.7" stroke="currentColor" strokeWidth="1.7"/><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg><span className="sr-only">Search merge requests</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search merge requests, branches, projects…" /></label>
        <button className="review-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="review-advanced-filters" onClick={() => setFiltersOpen((open) => !open)}>Filters{activeFilters.length ? <span className="review-filter-count">{activeFilters.length}</span> : null}<span className="review-chevron" aria-hidden="true">⌄</span></button>
        {hasFilters ? <button className="review-clear-inline" type="button" onClick={resetFilters}>Clear all</button> : null}
      </div>
      {activeFilters.length ? <div className="review-active-filters" aria-label="Active filters">{activeFilters.map((filter) => <button key={filter.label} type="button" aria-label={`Remove ${filter.label}`} onClick={() => { filter.clear(); setPage(1); }}>{filter.label}<span aria-hidden="true">×</span></button>)}</div> : null}
      <div className="review-advanced" id="review-advanced-filters" hidden={!filtersOpen}>
        <div className="review-advanced-heading"><strong>Advanced filters</strong><span>Refine the queue by people, project, and review status.</span></div>
        <div className="review-filters">
        <label><span>Author</span><select value={author} onChange={(event) => { setAuthor(event.target.value); setPage(1); }}><option value="">Everyone</option>{authors.map((name) => <option key={name} value={name}>@{name}</option>)}</select></label>
        <label><span>Reviewer</span><select value={reviewer} onChange={(event) => { setReviewer(event.target.value); setPage(1); }}><option value="">Everyone</option>{reviewers.map((name) => <option key={name} value={name}>@{name}</option>)}</select></label>
        <label><span>Project</span><select value={project} onChange={(event) => { setProject(event.target.value); setPage(1); }}><option value="">All projects</option>{projects.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span>Target</span><select value={target} onChange={(event) => { setTarget(event.target.value); setPage(1); }}><option value="">All branches</option>{targets.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span>Pipeline</span><select value={pipeline} onChange={(event) => { setPipeline(event.target.value); setPage(1); }}><option value="">Any status</option>{pipelines.map((name) => <option key={name} value={name}>{pipelineLabel(name === 'none' ? null : name, name !== 'unavailable')}</option>)}</select></label>
        <label><span>Approval</span><select value={approval} onChange={(event) => { setApproval(event.target.value as ApprovalFilter); setPage(1); }}><option value="all">Any status</option><option value="needed">Unapproved</option><option value="approved">Approved</option><option value="unknown">Unavailable</option></select></label>
        <label><span>Sort</span><select value={sort} onChange={(event) => { setSort(event.target.value as Sort); setPage(1); }}><option value="oldest">Oldest first</option><option value="newest">Newest first</option><option value="updated">Recently updated</option></select></label>
        </div>
      </div>
      <div className="table-heading"><h2>{views.find((item) => item.id === view)?.label}</h2><span>{filtered.length} merge request{filtered.length === 1 ? '' : 's'} · Aging after {snapshot.staleAfterDays} calendar days</span></div>
      <div className="review-list">{visible.length ? visible.map((item) => <MrCard key={item.id} item={item} mock={snapshot.source === 'mock'} />) : <div className="empty-state">No merge requests match these filters.</div>}</div>
      {totalPages > 1 ? <div className="review-pagination"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>← Previous</button><span>Page {currentPage} of {totalPages}</span><button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next →</button></div> : null}
    </> : !loading && !error ? <div className="empty-state">No merge requests yet.</div> : null}
  </section>;
}
