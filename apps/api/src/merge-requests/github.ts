import { decorateItems } from './model.js';
import type { ReviewAdapter } from './adapter.js';
import type { ReviewConnection } from '../settings/code-review.js';
import type { GitLabPerson, MergeRequest, ReviewSnapshot } from './types.js';

interface GitHubPerson { login: string; name?: string | null }
interface GitHubRepo { id: number; name: string; full_name: string; owner: GitHubPerson; archived?: boolean }
interface GitHubPull {
  number: number; title: string; html_url: string; created_at: string; updated_at: string; draft: boolean;
  user: GitHubPerson; requested_reviewers?: GitHubPerson[];
  head: { ref: string; sha: string }; base: { ref: string };
}
interface GitHubReview { user: GitHubPerson | null; state: string; submitted_at: string | null }
interface GitHubStatus { state: string; total_count: number }
interface GitHubChecks { check_runs: Array<{ status: string; conclusion: string | null }> }

function githubSettings(connection: ReviewConnection) {
  const token = connection.github.token;
  if (!token) throw new Error('Set GITHUB_TOKEN for local GitHub access');
  const raw = connection.github.apiUrl;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('GITHUB_API_URL must be an HTTPS base URL without credentials');
  return { base: url.toString().replace(/\/$/, ''), token, owner: connection.github.owner || null,
    selected: connection.github.repos.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean) };
}

async function githubGet<T>(base: string, token: string, endpoint: string): Promise<{ body: T; next: boolean }> {
  const response = await fetch(new URL(`${base}${endpoint}`), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return { body: await response.json() as T, next: /<[^>]+>;\s*rel="next"/.test(response.headers.get('link') ?? '') };
}

async function pages<T>(base: string, token: string, endpoint: string): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const response = await githubGet<T[]>(base, token, `${endpoint}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(response.body)) throw new Error('Unexpected GitHub list response');
    result.push(...response.body);
    if (!response.next) return result;
  }
  throw new Error('GitHub list exceeded the page limit');
}

function person(raw: GitHubPerson): GitLabPerson { return { username: raw.login, name: raw.name?.trim() || raw.login }; }
function approvalFromReviews(reviews: GitHubReview[]): GitLabPerson[] {
  const latest = new Map<string, GitHubReview>();
  for (const review of reviews.sort((a, b) => Date.parse(a.submitted_at ?? '') - Date.parse(b.submitted_at ?? ''))) {
    if (review.user) latest.set(review.user.login.toLowerCase(), review);
  }
  return [...latest.values()].filter((review) => review.state === 'APPROVED' && review.user).map((review) => person(review.user!));
}
function pipeline(status: GitHubStatus | null, checks: GitHubChecks | null): { status: string | null; known: boolean } {
  if (!status && !checks) return { status: null, known: false };
  const runs = checks?.check_runs ?? [];
  if (runs.some((run) => ['failure', 'timed_out', 'action_required'].includes(run.conclusion ?? ''))) return { status: 'failed', known: true };
  if (runs.some((run) => run.status !== 'completed')) return { status: 'running', known: true };
  if (runs.length) return { status: runs.every((run) => run.conclusion === 'success' || run.conclusion === 'skipped' || run.conclusion === 'neutral') ? 'success' : 'failed', known: true };
  if (status?.total_count) return { status: status.state === 'failure' || status.state === 'error' ? 'failed' : status.state === 'success' ? 'success' : 'pending', known: true };
  return { status: null, known: true };
}

async function loadGitHub(_root: string, staleAfterDays: number, connection: ReviewConnection): Promise<ReviewSnapshot> {
  const { base, token, owner: configuredOwner, selected } = githubSettings(connection);
  const viewerRaw = (await githubGet<GitHubPerson>(base, token, '/user')).body;
  if (!viewerRaw.login) throw new Error('GitHub did not return a current username');
  const viewer = person(viewerRaw);
  const owner = configuredOwner || viewer.username;
  const discovered = await pages<GitHubRepo>(base, token, '/user/repos?affiliation=owner,organization_member,collaborator');
  const repos = discovered.filter((repo) => repo.owner.login.toLowerCase() === owner.toLowerCase() && !repo.archived &&
    (!selected.length || selected.includes(repo.name.toLowerCase()) || selected.includes(repo.full_name.toLowerCase())));
  if (selected.length && repos.length !== selected.length) throw new Error('A selected GitHub repository was not found or is inaccessible');
  const rows = (await Promise.all(repos.map(async (repo) => ({ repo, pulls: await pages<GitHubPull>(base, token, `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/pulls?state=open`) })))).flatMap(({ repo, pulls }) => pulls.map((pull) => ({ repo, pull })));
  const items: MergeRequest[] = [];
  for (let index = 0; index < rows.length; index += 5) {
    const batch = rows.slice(index, index + 5);
    const mapped = await Promise.all(batch.map(async ({ repo, pull }): Promise<MergeRequest> => {
      const prefix = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
      const [reviews, status, checks] = await Promise.all([
        pages<GitHubReview>(base, token, `${prefix}/pulls/${pull.number}/reviews`).catch(() => null),
        githubGet<GitHubStatus>(base, token, `${prefix}/commits/${encodeURIComponent(pull.head.sha)}/status`).then((result) => result.body).catch(() => null),
        githubGet<GitHubChecks>(base, token, `${prefix}/commits/${encodeURIComponent(pull.head.sha)}/check-runs?per_page=100`).then((result) => result.body).catch(() => null),
      ]);
      const approvedBy = reviews ? approvalFromReviews(reviews) : [];
      const ci = pipeline(status, checks);
      return {
        id: `github:${repo.full_name}:${pull.number}`, iid: pull.number, projectId: repo.id, project: repo.full_name,
        title: pull.title, url: pull.html_url, author: person(pull.user), reviewers: (pull.requested_reviewers ?? []).map(person), approvedBy,
        sourceBranch: pull.head.ref, targetBranch: pull.base.ref, createdAt: pull.created_at, updatedAt: pull.updated_at,
        draft: pull.draft, pipelineStatus: ci.status, pipelineKnown: ci.known,
        approval: { approved: reviews ? approvedBy.length > 0 : null, required: null, left: null,
          userCanApprove: reviews ? pull.user.login.toLowerCase() !== viewer.username.toLowerCase() : null,
          userHasApproved: reviews ? approvedBy.some((user) => user.username.toLowerCase() === viewer.username.toLowerCase()) : null },
      };
    }));
    items.push(...mapped);
  }
  const fetchedAt = new Date().toISOString();
  return { source: 'github', fetchedAt, group: owner, viewer, staleAfterDays, items: decorateItems(items, viewer, staleAfterDays, Date.parse(fetchedAt)) };
}

export const githubAdapter: ReviewAdapter = { source: 'github', load: loadGitHub };
