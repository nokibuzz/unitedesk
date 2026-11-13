import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { decorateItems } from './model.js';
import { getTeamSettings } from '../settings/team.js';
import { githubAdapter } from './github.js';
import type { ReviewAdapter } from './adapter.js';
import type { GitLabPerson, MergeRequest, ReviewSnapshot } from './types.js';

interface GitLabMr {
  iid: number; project_id: number; title: string; web_url: string; created_at: string; updated_at: string;
  source_branch: string; target_branch: string; author?: { username?: string; name?: string };
  reviewers?: Array<{ username?: string; name?: string }>;
  head_pipeline?: { status?: string } | null; pipeline?: { status?: string } | null;
  draft?: boolean; work_in_progress?: boolean;
}
interface ApprovalResponse {
  approved?: boolean; approvals_required?: number; approvals_left?: number;
  approved_by?: Array<{ user?: { username?: string; name?: string } }>;
  user_can_approve?: boolean; user_has_approved?: boolean;
}
const person = (raw?: { username?: string; name?: string }): GitLabPerson => ({ username: raw?.username?.trim() || 'unknown', name: raw?.name?.trim() || raw?.username?.trim() || 'Unknown' });
const nullableInt = (value: unknown): number | null => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
const nullableBool = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;

function settings() {
  const urlRaw = process.env.GITLAB_URL?.trim();
  const group = process.env.GITLAB_GROUP?.trim();
  const token = process.env.GITLAB_TOKEN?.trim();
  if (!urlRaw || !group || !token) throw new Error('Set GITLAB_URL, GITLAB_GROUP and GITLAB_TOKEN for GitLab access');
  const url = new URL(urlRaw);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('GITLAB_URL must be an HTTP URL');
  if (url.username || url.password || url.search || url.hash) throw new Error('GITLAB_URL must be a base URL without credentials or query parameters');
  return { base: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, group, token };
}
async function gitlabGet<T>(base: string, token: string, endpoint: string): Promise<{ body: T; nextPage: string | null }> {
  const url = new URL(`${base}${endpoint}`);
  const response = await fetch(url, { headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitLab request failed (${response.status})`);
  return { body: await response.json() as T, nextPage: response.headers.get('x-next-page') };
}
function projectFromUrl(raw: string, base: string): string {
  try {
    const basePath = new URL(base).pathname.replace(/\/$/, '');
    let pathname = new URL(raw).pathname;
    if (basePath && pathname.startsWith(`${basePath}/`)) pathname = pathname.slice(basePath.length);
    const index = pathname.indexOf('/-/merge_requests/');
    return index > 1 ? decodeURIComponent(pathname.slice(1, index)) : '';
  } catch { return ''; }
}
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await fn(items[index]); }
  }));
  return result;
}
async function liveSnapshot(staleAfterDays: number): Promise<ReviewSnapshot> {
  const { base, group, token } = settings();
  const viewer = person((await gitlabGet<{ username?: string; name?: string }>(base, token, '/api/v4/user')).body);
  if (viewer.username === 'unknown') throw new Error('GitLab did not return a current username');
  const rows: GitLabMr[] = [];
  let page = 1;
  while (page <= 100) {
    const response = await gitlabGet<GitLabMr[]>(base, token, `/api/v4/groups/${encodeURIComponent(group)}/merge_requests?state=opened&scope=all&per_page=100&page=${page}`);
    if (!Array.isArray(response.body)) throw new Error('Unexpected GitLab merge request response');
    rows.push(...response.body);
    if (response.nextPage) { const next = Number(response.nextPage); if (!Number.isInteger(next) || next <= page) throw new Error('Invalid GitLab pagination'); page = next; continue; }
    if (response.body.length < 100) break;
    page++;
  }
  if (page > 100) throw new Error('GitLab group has more merge request pages than the current limit');
  const items = await mapPool(rows, 6, async (row): Promise<MergeRequest> => {
    const endpoint = `/api/v4/projects/${row.project_id}/merge_requests/${row.iid}`;
    const approvalRequest = gitlabGet<ApprovalResponse>(base, token, `${endpoint}/approvals`).then((result) => result.body).catch(() => null);
    let status = row.head_pipeline?.status ?? row.pipeline?.status ?? null;
    let pipelineKnown = row.head_pipeline !== undefined || row.pipeline !== undefined;
    if (!pipelineKnown) {
      try {
        const detail = (await gitlabGet<GitLabMr>(base, token, endpoint)).body;
        status = detail.head_pipeline?.status ?? detail.pipeline?.status ?? null;
        pipelineKnown = true;
      } catch { /* Show unavailable when GitLab omits pipeline detail. */ }
    }
    const approval = await approvalRequest;
    return {
      id: `${row.project_id}:${row.iid}`, iid: row.iid, projectId: row.project_id,
      project: projectFromUrl(row.web_url, base) || String(row.project_id), title: row.title, url: row.web_url,
      author: person(row.author), reviewers: (row.reviewers ?? []).map(person),
      approvedBy: (approval?.approved_by ?? []).map((entry) => person(entry.user)),
      sourceBranch: row.source_branch, targetBranch: row.target_branch,
      createdAt: row.created_at, updatedAt: row.updated_at,
      draft: Boolean(row.draft ?? row.work_in_progress ?? /^draft:/i.test(row.title)),
      pipelineStatus: status, pipelineKnown,
      approval: { approved: nullableBool(approval?.approved), required: nullableInt(approval?.approvals_required), left: nullableInt(approval?.approvals_left), userCanApprove: nullableBool(approval?.user_can_approve), userHasApproved: nullableBool(approval?.user_has_approved) },
    };
  });
  const fetchedAt = new Date().toISOString();
  return { source: 'gitlab', fetchedAt, group, viewer, staleAfterDays, items: decorateItems(items, viewer, staleAfterDays, Date.parse(fetchedAt)) };
}
async function mockSnapshot(root: string, staleAfterDays: number): Promise<ReviewSnapshot> {
  let data: Omit<ReviewSnapshot, 'items'> & { items: MergeRequest[] };
  try { data = JSON.parse(await readFile(path.join(root, 'mock', 'gitlab', 'merge-requests.json'), 'utf8')) as typeof data; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('GitLab mock data is missing. Run npm run mock:seed'); throw error; }
  if (!Array.isArray(data.items) || !data.viewer?.username) throw new Error('Invalid GitLab mock data');
  const fetchedAt = new Date().toISOString();
  return { ...data, source: 'mock', fetchedAt, staleAfterDays, items: decorateItems(data.items, data.viewer, staleAfterDays, Date.parse(fetchedAt)) };
}
let cache: { key: string; expires: number; promise: Promise<ReviewSnapshot> } | null = null;
export async function getMergeRequests(root: string, refresh = false): Promise<ReviewSnapshot> {
  const mode = process.env.CODE_REVIEW_PROVIDER?.trim() || process.env.GITLAB_MODE?.trim() || 'mock';
  const adapters: Record<string, ReviewAdapter> = {
    gitlab: { source: 'gitlab', load: (_root, days) => liveSnapshot(days) },
    mock: { source: 'mock', load: (directory, days) => mockSnapshot(directory, days) },
    github: githubAdapter,
  };
  const adapter = adapters[mode];
  if (!adapter) throw new Error('CODE_REVIEW_PROVIDER must be mock, gitlab or github');
  const { gitlabStaleDays } = await getTeamSettings(root);
  if (mode === 'mock') return adapter.load(root, gitlabStaleDays);
  const key = [mode, process.env.GITLAB_URL, process.env.GITLAB_GROUP, process.env.GITLAB_TOKEN,
    process.env.GITHUB_API_URL, process.env.GITHUB_OWNER, process.env.GITHUB_REPOS, process.env.GITHUB_TOKEN, gitlabStaleDays].join('|');
  const ttl = Number(process.env.GITLAB_CACHE_TTL_MS ?? 30_000);
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > 3_600_000) throw new Error('GITLAB_CACHE_TTL_MS must be between 0 and 3600000');
  if (!refresh && cache?.key === key && Date.now() < cache.expires) return cache.promise;
  const promise = adapter.load(root, gitlabStaleDays);
  cache = { key, expires: Date.now() + ttl, promise };
  try { return await promise; }
  catch (error) { if (cache?.promise === promise) cache = null; throw error; }
}
