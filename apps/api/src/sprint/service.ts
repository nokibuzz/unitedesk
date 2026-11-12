import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { addedToSprintAt, dailyWindowStart, descriptionFromJira } from './daily.js';
import { elapsedSince, enteredAt, testingElapsed, waitingForTestElapsed } from './history.js';
import { getStatusMapping, saveStatusMapping } from './mapping.js';
import type { JiraHistory, JiraIssue, JiraSprint, JiraStatus, SprintSnapshot, SprintTicket, StatusMapping } from './types.js';

type Data = { base: string; board: number; sprint: JiraSprint | null; issues: JiraIssue[]; pointsField: string | null; statuses: JiraStatus[]; histories: Record<string, JiraHistory[] | null> };

function requiredUrl(raw: string | undefined): string {
  if (!raw) throw new Error('Set JIRA_URL to your Jira base URL');
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('JIRA_URL must be an HTTP URL');
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
  const response = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Jira request failed (${response.status})`);
  return response.json() as Promise<T>;
}
function observedStatuses(issues: JiraIssue[]): JiraStatus[] {
  const statuses = issues.flatMap((issue) => [issue, ...(issue.fields.subtasks ?? [])]).map((issue) => issue.fields?.status).filter((status) => status?.name);
  return [...new Map(statuses.map((status) => [status!.id ?? status!.name!, { id: status!.id ?? status!.name!, name: status!.name!, category: status!.statusCategory?.key ?? 'unknown' }])).values()];
}
async function changelog(base: string, key: string): Promise<JiraHistory[]> {
  const histories: JiraHistory[] = [];
  for (let startAt = 0; ; startAt += 100) {
    const page = await jiraGet<{ values?: JiraHistory[]; total?: number }>(base, `/rest/api/3/issue/${encodeURIComponent(key)}/changelog`, { startAt: String(startAt), maxResults: '100' });
    const batch = page.values ?? [];
    histories.push(...batch);
    if (!batch.length || histories.length >= (page.total ?? histories.length)) break;
  }
  return histories;
}
async function liveData(withHistories: boolean): Promise<Data> {
  const boardUrl = process.env.JIRA_BOARD_URL?.trim();
  const base = requiredUrl(process.env.JIRA_URL?.trim() || (boardUrl ? new URL(boardUrl).origin : undefined));
  const board = boardId();
  const config = await jiraGet<{ estimation?: { field?: { fieldId?: string } }; columnConfig?: { columns?: Array<{ statuses?: Array<{ id: string }> }> } }>(base, `/rest/agile/1.0/board/${board}/configuration`).catch(() => ({ estimation: undefined, columnConfig: undefined }));
  const pointsField = process.env.JIRA_STORY_POINTS_FIELD?.trim() || config.estimation?.field?.fieldId || null;
  const boardStatusIds = new Set(config.columnConfig?.columns?.flatMap((column) => column.statuses?.map((status) => status.id) ?? []) ?? []);
  const [sprints, allStatuses] = await Promise.all([
    jiraGet<{ values?: JiraSprint[] }>(base, `/rest/agile/1.0/board/${board}/sprint`, { state: 'active', maxResults: '50' }),
    jiraGet<Array<{ id: string; name: string; statusCategory?: { key?: string } }>>(base, '/rest/api/3/status').catch(() => []),
  ]);
  const sprint = sprints.values?.[0] ?? null;
  const issues: JiraIssue[] = [];
  if (sprint) for (let startAt = 0; ; startAt += 50) {
    const fields = ['summary', 'description', 'status', 'issuetype', 'assignee', 'subtasks', 'issuelinks', 'timetracking', 'timeoriginalestimate', 'timespent', 'updated', 'created', ...(pointsField ? [pointsField] : [])];
    const page = await jiraGet<{ issues?: JiraIssue[]; total?: number }>(base, `/rest/agile/1.0/sprint/${sprint.id}/issue`, { startAt: String(startAt), maxResults: '50', fields: fields.join(',') });
    const batch = page.issues ?? [];
    issues.push(...batch);
    if (batch.length < 50 || issues.length >= (page.total ?? issues.length)) break;
  }
  const statuses = [...new Map([
    ...allStatuses.filter((status) => boardStatusIds.has(status.id)).map((status) => ({ id: status.id, name: status.name, category: status.statusCategory?.key ?? 'unknown' })),
    ...observedStatuses(issues),
  ].map((status) => [status.id, status])).values()];
  const testName = (process.env.JIRA_TEST_TASK_NAME || 'Test the solution').trim().toLowerCase();
  const keys = issues.flatMap((issue) => [issue.key, ...(issue.fields.subtasks ?? []).filter((item) => item.fields?.summary?.trim().toLowerCase() === testName).map((item) => item.key)]);
  const histories: Data['histories'] = {};
  for (let index = 0; withHistories && index < keys.length; index += 5) {
    const results = await Promise.all(keys.slice(index, index + 5).map((key) => changelog(base, key).catch(() => null)));
    keys.slice(index, index + 5).forEach((key, offset) => { histories[key] = results[offset]; });
  }
  const childTasks = issues.flatMap((issue) => issue.fields.subtasks ?? []);
  for (let index = 0; withHistories && index < childTasks.length; index += 5) {
    const batch = childTasks.slice(index, index + 5);
    const details = await Promise.all(batch.map((item) => jiraGet<{ fields: { created?: string; assignee?: { displayName?: string } | null } }>(base, `/rest/api/3/issue/${encodeURIComponent(item.key)}`, { fields: 'created,assignee' }).catch(() => null)));
    batch.forEach((item, offset) => { item.fields.created = details[offset]?.fields.created; item.fields.assignee = details[offset]?.fields.assignee ?? item.fields.assignee; });
  }
  return { base, board, sprint, issues, pointsField, statuses, histories };
}
async function mockData(root: string): Promise<Data> {
  const folder = path.join(root, 'mock', 'jira');
  const [sprintRaw, issuesRaw, statusesRaw, historiesRaw] = await Promise.all(['sprint.json', 'issues.json', 'statuses.json', 'changelogs.json'].map((file) => readFile(path.join(folder, file), 'utf8')));
  const sprint = JSON.parse(sprintRaw) as JiraSprint;
  const issues = JSON.parse(issuesRaw) as JiraIssue[];
  if (!Number.isInteger(sprint.id) || !Array.isArray(issues)) throw new Error('Invalid mock Jira data');
  return { base: 'https://example.atlassian.net', board: 1, sprint, issues, pointsField: 'customfield_10016', statuses: JSON.parse(statusesRaw), histories: JSON.parse(historiesRaw) };
}
async function loadData(root: string, withHistories = true): Promise<Data> {
  const mode = process.env.JIRA_MODE?.trim() || 'mock';
  if (mode !== 'jira' && mode !== 'mock') throw new Error('JIRA_MODE must be mock or jira');
  try { return mode === 'jira' ? await liveData(withHistories) : await mockData(root); }
  catch (error) {
    if (mode === 'mock' && (error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('Mock data is missing or outdated. Run npm run mock:seed');
    throw error;
  }
}
function scope(data: Data): string { return `${data.base}/board/${data.board}`; }
export async function discoverStatusMapping(root: string): Promise<StatusMapping> {
  const data = await loadData(root, false);
  return getStatusMapping(root, scope(data), data.statuses);
}
export async function confirmStatusMapping(root: string, statuses: unknown): Promise<StatusMapping> {
  const data = await loadData(root, false);
  return saveStatusMapping(root, scope(data), data.statuses, statuses);
}
function normalizeTicket(issue: JiraIssue, data: Data, mapping: StatusMapping, now: number): SprintTicket {
  const fields = issue.fields;
  const subtasks = Array.isArray(fields.subtasks) ? fields.subtasks : [];
  const testName = (process.env.JIRA_TEST_TASK_NAME || 'Test the solution').trim().toLowerCase();
  const test = subtasks.find((item) => item.fields?.summary?.trim().toLowerCase() === testName);
  const roleById = new Map(mapping.statuses.map((item) => [item.id, item.role]));
  const roleByName = new Map(mapping.statuses.map((item) => [item.name, item.role]));
  const roleFor = (name: string) => roleByName.get(name) ?? 'other';
  const testRoleFor = (name: string) => {
    const role = roleFor(name);
    return role === 'in_progress' ? 'in_testing' : role;
  };
  const status = fields.status?.name || 'Unknown';
  const statusRole = roleById.get(fields.status?.id ?? status) ?? roleFor(status);
  const testStatus = test?.fields.status?.name || 'Unknown';
  const mappedTestRole = test ? (roleById.get(test.fields.status?.id ?? testStatus) ?? roleFor(testStatus)) : 'other';
  const testRole = mappedTestRole === 'in_progress' ? 'in_testing' : mappedTestRole;
  const testing = !test ? 'none' : testRole === 'done' ? 'finished' : testRole === 'in_testing' ? 'in_testing' : 'ready';
  const rawPoints = data.pointsField ? fields[data.pointsField] : null;
  const points = Number(rawPoints);
  const issueHistory = data.histories[issue.key];
  const statusEnteredAt = issueHistory ? enteredAt(status, fields.created, issueHistory) : null;
  const doneAt = statusRole === 'done' && issueHistory?.some((history) => history.items.some((item) => item.field === 'status' && item.toString === status)) ? statusEnteredAt : null;
  const testHistory = test ? data.histories[test.key] : null;
  const testingAgeMs = test && testHistory && (testing === 'in_testing' || testing === 'finished') ? testingElapsed(test.fields.created, testHistory, testRoleFor, now) : null;
  const testingWaitingAgeMs = test && testHistory && (testing === 'ready' || testingAgeMs != null) ? waitingForTestElapsed(test.fields.created, testHistory, testRoleFor, now) : null;
  return {
    key: issue.key, type: fields.issuetype?.name || 'Issue', summary: fields.summary || issue.key, description: descriptionFromJira(fields.description),
    status, statusCategory: fields.status?.statusCategory?.key || 'unknown', statusRole, statusEnteredAt, statusAgeMs: elapsedSince(statusEnteredAt, now),
    createdAt: fields.created ?? null, addedToSprintAt: addedToSprintAt(issueHistory, data.sprint?.name), doneAt,
    assignee: fields.assignee?.displayName || null, tester: test?.fields.assignee?.displayName || null, testing, testingAgeMs, testingWaitingAgeMs,
    testingTask: test ? { key: test.key, status: testStatus, url: `${data.base}/browse/${encodeURIComponent(test.key)}` } : null,
    subtasks: subtasks.map((item) => ({ key: item.key, summary: item.fields?.summary || item.key, status: item.fields?.status?.name || 'Unknown', statusRole: roleById.get(item.fields?.status?.id ?? '') ?? roleFor(item.fields?.status?.name || ''), assignee: item.fields?.assignee?.displayName || null, createdAt: item.fields?.created ?? null, url: `${data.base}/browse/${encodeURIComponent(item.key)}` })),
    linkedIssues: (fields.issuelinks ?? []).flatMap((link) => {
      const related = link.outwardIssue?.key && link.outwardIssue.key !== issue.key ? link.outwardIssue : link.inwardIssue;
      return related?.key ? [{ key: related.key, summary: related.fields?.summary || related.key, status: related.fields?.status?.name || 'Unknown', relationship: link.type?.name || 'Linked', url: `${data.base}/browse/${encodeURIComponent(related.key)}` }] : [];
    }),
    storyPoints: rawPoints == null || !Number.isFinite(points) ? null : points,
    originalEstimateSeconds: fields.timetracking?.originalEstimateSeconds ?? fields.timeoriginalestimate ?? null,
    timeSpentSeconds: fields.timetracking?.timeSpentSeconds ?? fields.timespent ?? 0,
    updatedAt: fields.updated || null, url: `${data.base}/browse/${encodeURIComponent(issue.key)}`,
  };
}
export async function getActiveSprint(root: string): Promise<SprintSnapshot> {
  const data = await loadData(root);
  const mapping = await getStatusMapping(root, scope(data), data.statuses);
  const now = Date.now();
  const timeZone = process.env.DAILY_TIME_ZONE?.trim() || 'UTC';
  const cutoffHour = Number(process.env.DAILY_CUTOFF_HOUR ?? 10);
  const ticketSeconds = Number(process.env.DAILY_TICKET_SECONDS ?? 180);
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) throw new Error('DAILY_CUTOFF_HOUR must be between 0 and 23');
  if (!Number.isInteger(ticketSeconds) || ticketSeconds < 15 || ticketSeconds > 900) throw new Error('DAILY_TICKET_SECONDS must be between 15 and 900');
  try { new Intl.DateTimeFormat('en-US', { timeZone }); }
  catch { throw new Error('DAILY_TIME_ZONE must be a valid IANA time zone'); }
  return {
    source: process.env.JIRA_MODE?.trim() === 'jira' ? 'jira' : 'mock', fetchedAt: new Date(now).toISOString(), statusMappingConfirmed: mapping.confirmed,
    daily: { timeZone, windowStart: dailyWindowStart(now, timeZone, cutoffHour), ticketSeconds },
    sprint: data.sprint ? { id: data.sprint.id, name: data.sprint.name, goal: data.sprint.goal || null, url: `${data.base}/secure/RapidBoard.jspa?rapidView=${data.board}` } : null,
    tickets: data.issues.filter((issue) => issue.key && issue.fields && !issue.fields.issuetype?.subtask).map((issue) => normalizeTicket(issue, data, mapping, now)),
  };
}
