import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { JiraIssue, JiraSprint, SprintSnapshot, SprintTicket } from './types.js';

function requiredUrl(raw: string | undefined): string {
  if (!raw) throw new Error('Set JIRA_URL to your Jira base URL');
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('JIRA_URL must be an HTTP URL');
  return url.toString().replace(/\/$/, '');
}

function boardId(): number {
  const fromId = Number(process.env.JIRA_BOARD_ID);
  if (Number.isInteger(fromId) && fromId > 0) return fromId;
  const raw = process.env.JIRA_BOARD_URL ?? '';
  const match = raw.match(/\/boards\/(\d+)/) ?? raw.match(/[?&]rapidView=(\d+)/);
  const id = Number(match?.[1]);
  if (!Number.isInteger(id) || id < 1) throw new Error('Set JIRA_BOARD_URL or JIRA_BOARD_ID');
  return id;
}

async function jiraGet<T>(base: string, endpoint: string, query?: Record<string, string>): Promise<T> {
  const email = process.env.JIRA_EMAIL?.trim();
  const token = process.env.JIRA_API_TOKEN?.trim();
  if (!email || !token) throw new Error('Set JIRA_EMAIL and JIRA_API_TOKEN for local Jira access');
  const url = new URL(endpoint, `${base}/`);
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Jira request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function liveData(): Promise<{ base: string; board: number; sprint: JiraSprint | null; issues: JiraIssue[]; pointsField: string | null }> {
  const boardUrl = process.env.JIRA_BOARD_URL?.trim();
  const inferredBase = boardUrl ? new URL(boardUrl).origin : undefined;
  const base = requiredUrl(process.env.JIRA_URL?.trim() || inferredBase);
  const board = boardId();
  const sprints = await jiraGet<{ values?: JiraSprint[] }>(base, `/rest/agile/1.0/board/${board}/sprint`, { state: 'active', maxResults: '50' });
  const sprint = sprints.values?.[0] ?? null;
  if (!sprint) return { base, board, sprint: null, issues: [], pointsField: null };
  let pointsField = process.env.JIRA_STORY_POINTS_FIELD?.trim() || null;
  if (!pointsField) {
    try {
      const config = await jiraGet<{ estimation?: { field?: { fieldId?: string } } }>(base, `/rest/agile/1.0/board/${board}/configuration`);
      pointsField = config.estimation?.field?.fieldId ?? null;
    } catch { /* Estimates remain unavailable if board configuration is restricted. */ }
  }
  const issues: JiraIssue[] = [];
  for (let startAt = 0; ; startAt += 50) {
    const fields = ['summary', 'status', 'issuetype', 'assignee', 'subtasks', 'timetracking', 'timeoriginalestimate', 'timespent', 'updated', ...(pointsField ? [pointsField] : [])];
    const page = await jiraGet<{ issues?: JiraIssue[]; total?: number }>(base, `/rest/agile/1.0/sprint/${sprint.id}/issue`, {
      startAt: String(startAt), maxResults: '50', fields: fields.join(','),
    });
    const batch = page.issues ?? [];
    issues.push(...batch);
    if (batch.length < 50 || issues.length >= (page.total ?? issues.length)) break;
  }
  return { base, board, sprint, issues, pointsField };
}

async function mockData(projectDirectory: string): Promise<{ base: string; board: number; sprint: JiraSprint | null; issues: JiraIssue[]; pointsField: string | null }> {
  const folder = path.join(projectDirectory, 'mock', 'jira');
  const [sprintRaw, issuesRaw] = await Promise.all([
    readFile(path.join(folder, 'sprint.json'), 'utf8'),
    readFile(path.join(folder, 'issues.json'), 'utf8'),
  ]);
  const sprint = JSON.parse(sprintRaw) as JiraSprint;
  const issues = JSON.parse(issuesRaw) as JiraIssue[];
  if (!Number.isInteger(sprint.id) || !Array.isArray(issues)) throw new Error('Invalid mock Jira data');
  return { base: 'https://example.atlassian.net', board: 1, sprint, issues, pointsField: 'customfield_10016' };
}

function normalizeTicket(issue: JiraIssue, base: string, pointsField: string | null): SprintTicket {
  const fields = issue.fields;
  const subtasks = Array.isArray(fields.subtasks) ? fields.subtasks : [];
  const testName = (process.env.JIRA_TEST_TASK_NAME || 'Test the solution').trim().toLowerCase();
  const test = subtasks.find((item) => item.fields?.summary?.trim().toLowerCase() === testName);
  const category = test?.fields.status?.statusCategory?.key?.toLowerCase();
  const testing = !test ? 'none' : category === 'done' ? 'finished' : category === 'indeterminate' ? 'in_testing' : 'ready';
  const rawPoints = pointsField ? fields[pointsField] : null;
  const points = Number(rawPoints);
  return {
    key: issue.key,
    type: fields.issuetype?.name || 'Issue',
    summary: fields.summary || issue.key,
    status: fields.status?.name || 'Unknown',
    statusCategory: fields.status?.statusCategory?.key || 'unknown',
    assignee: fields.assignee?.displayName || null,
    tester: test?.fields.assignee?.displayName || null,
    testing,
    testingTask: test ? { key: test.key, status: test.fields.status?.name || 'Unknown', url: `${base}/browse/${encodeURIComponent(test.key)}` } : null,
    subtasks: subtasks.map((item) => ({ key: item.key, summary: item.fields?.summary || item.key, status: item.fields?.status?.name || 'Unknown', url: `${base}/browse/${encodeURIComponent(item.key)}` })),
    storyPoints: rawPoints == null || !Number.isFinite(points) ? null : points,
    originalEstimateSeconds: fields.timetracking?.originalEstimateSeconds ?? fields.timeoriginalestimate ?? null,
    timeSpentSeconds: fields.timetracking?.timeSpentSeconds ?? fields.timespent ?? 0,
    updatedAt: fields.updated || null,
    url: `${base}/browse/${encodeURIComponent(issue.key)}`,
  };
}

export async function getActiveSprint(projectDirectory: string): Promise<SprintSnapshot> {
  const mode = process.env.JIRA_MODE?.trim() || 'mock';
  if (mode !== 'jira' && mode !== 'mock') throw new Error('JIRA_MODE must be mock or jira');
  const source = mode;
  let data;
  try {
    data = source === 'jira' ? await liveData() : await mockData(projectDirectory);
  } catch (error) {
    if (source === 'mock' && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Mock data is missing. Run npm run mock:seed');
    }
    throw error;
  }
  return {
    source,
    fetchedAt: new Date().toISOString(),
    sprint: data.sprint ? { id: data.sprint.id, name: data.sprint.name, goal: data.sprint.goal || null, url: `${data.base}/secure/RapidBoard.jspa?rapidView=${data.board}` } : null,
    tickets: data.issues.filter((issue) => issue.key && issue.fields && !issue.fields.issuetype?.subtask).map((issue) => normalizeTicket(issue, data.base, data.pointsField)),
  };
}
