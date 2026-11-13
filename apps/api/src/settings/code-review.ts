import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ReviewProvider = 'mock' | 'gitlab' | 'github';
export interface ReviewConnection {
  provider: ReviewProvider;
  gitlab: { url: string; group: string; token: string };
  github: { apiUrl: string; owner: string; repos: string; token: string };
}
export interface PublicReviewConnection {
  provider: ReviewProvider;
  gitlab: { url: string; group: string; hasToken: boolean };
  github: { apiUrl: string; owner: string; repos: string; hasToken: boolean };
}

const filePath = (root: string) => path.join(root, 'data', 'code-review-connection.json');
const stringValue = (value: unknown, label: string, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} is invalid`);
  return value.trim();
};
function baseUrl(raw: string, label: string, allowHttp: boolean): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${label} must be a valid URL`); }
  if (!['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be a ${allowHttp ? 'HTTP or HTTPS' : 'HTTPS'} base URL without credentials or query parameters`);
  }
  return url.href.replace(/\/+$/, '');
}
function defaults(): ReviewConnection {
  const provider = process.env.CODE_REVIEW_PROVIDER?.trim() || process.env.GITLAB_MODE?.trim() || 'mock';
  return {
    provider: ['mock', 'gitlab', 'github'].includes(provider) ? provider as ReviewProvider : 'mock',
    gitlab: { url: process.env.GITLAB_URL?.trim() || 'https://gitlab.com', group: process.env.GITLAB_GROUP?.trim() || '', token: process.env.GITLAB_TOKEN?.trim() || '' },
    github: { apiUrl: process.env.GITHUB_API_URL?.trim() || 'https://api.github.com', owner: process.env.GITHUB_OWNER?.trim() || '', repos: process.env.GITHUB_REPOS?.trim() || '', token: process.env.GITHUB_TOKEN?.trim() || '' },
  };
}
async function saved(root: string): Promise<Partial<ReviewConnection> | null> {
  try {
    const value: unknown = JSON.parse(await readFile(filePath(root), 'utf8'));
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('connection' in value)) throw new Error('Unsupported code review connection file');
    return value.connection as Partial<ReviewConnection>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}
export async function getReviewConnection(root: string): Promise<ReviewConnection> {
  const base = defaults();
  const local = await saved(root);
  return local ? { provider: local.provider ?? base.provider, gitlab: { ...base.gitlab, ...local.gitlab }, github: { ...base.github, ...local.github } } : base;
}
export function publicReviewConnection(value: ReviewConnection): PublicReviewConnection {
  return { provider: value.provider, gitlab: { url: value.gitlab.url, group: value.gitlab.group, hasToken: Boolean(value.gitlab.token) },
    github: { apiUrl: value.github.apiUrl, owner: value.github.owner, repos: value.github.repos, hasToken: Boolean(value.github.token) } };
}
export async function saveReviewConnection(root: string, input: unknown): Promise<PublicReviewConnection> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Connection settings must be an object');
  const value = input as Record<string, unknown>;
  if (!['mock', 'gitlab', 'github'].includes(String(value.provider))) throw new Error('Choose GitLab, GitHub, or mock data');
  const old = await getReviewConnection(root);
  const rawGitlab = value.gitlab && typeof value.gitlab === 'object' ? value.gitlab as Record<string, unknown> : {};
  const rawGithub = value.github && typeof value.github === 'object' ? value.github as Record<string, unknown> : {};
  const gitlabToken = rawGitlab.token === undefined || rawGitlab.token === '' ? old.gitlab.token : stringValue(rawGitlab.token, 'GitLab token', 2048);
  const githubToken = rawGithub.token === undefined || rawGithub.token === '' ? old.github.token : stringValue(rawGithub.token, 'GitHub token', 2048);
  if (/[\r\n]/.test(gitlabToken) || /[\r\n]/.test(githubToken)) throw new Error('Tokens cannot contain line breaks');
  const connection: ReviewConnection = {
    provider: value.provider as ReviewProvider,
    gitlab: { url: baseUrl(stringValue(rawGitlab.url ?? old.gitlab.url, 'GitLab URL', 2048), 'GitLab URL', true),
      group: stringValue(rawGitlab.group ?? old.gitlab.group, 'GitLab group', 300), token: gitlabToken },
    github: { apiUrl: baseUrl(stringValue(rawGithub.apiUrl ?? old.github.apiUrl, 'GitHub API URL', 2048), 'GitHub API URL', false),
      owner: stringValue(rawGithub.owner ?? old.github.owner, 'GitHub owner', 200),
      repos: stringValue(rawGithub.repos ?? old.github.repos, 'GitHub repositories', 2000), token: githubToken },
  };
  if (connection.provider === 'gitlab' && (!connection.gitlab.group || !connection.gitlab.token)) throw new Error('GitLab group and token are required');
  if (connection.provider === 'github' && !connection.github.token) throw new Error('GitHub token is required');
  const target = filePath(root);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify({ version: 1, connection }, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, target);
  return publicReviewConnection(connection);
}
