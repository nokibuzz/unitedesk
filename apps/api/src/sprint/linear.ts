import type { SprintAdapter, SprintData } from './adapter.js';
import type { JiraHistory, JiraIssue, JiraStatus } from './types.js';

interface LinearState { id: string; name: string; type: string }
interface LinearCycle { id: string; number: number; name: string | null; startsAt: string; endsAt: string }
interface LinearIssue {
  id: string; identifier: string; title: string; description: string | null; url: string;
  createdAt: string; updatedAt: string; estimate: number | null;
  state: LinearState; assignee: { name: string } | null; parent: { id: string } | null;
}
interface Connection<T> { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.LINEAR_API_KEY?.trim();
  if (!key) throw new Error('Set LINEAR_API_KEY for local Linear access');
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Linear request failed (${response.status})`);
  const body = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (body.errors?.length || !body.data) throw new Error(`Linear request failed: ${body.errors?.map((error) => error.message).join('; ') || 'missing data'}`);
  return body.data;
}

const teamQuery = `query($team:String!){organization{urlKey} team(id:$team){key states{nodes{id name type}} cycles(first:30){nodes{id number name startsAt endsAt}}}}`;
const issuesQuery = `query($cycle:String!,$after:String){cycle(id:$cycle){issues(first:50,after:$after){nodes{id identifier title description url createdAt updatedAt estimate state{id name type} assignee{name} parent{id}} pageInfo{hasNextPage endCursor}}}}`;
const historyQuery = `query($issue:String!,$after:String){issue(id:$issue){stateHistory(first:100,after:$after){nodes{stateId startedAt state{name}} pageInfo{hasNextPage endCursor}}}}`;

function category(type: string): string {
  if (type === 'completed') return 'done';
  if (type === 'started') return 'indeterminate';
  if (type === 'backlog' || type === 'unstarted') return 'new';
  return 'unknown';
}

function toIssue(item: LinearIssue): JiraIssue {
  return {
    key: item.identifier, url: item.url,
    fields: {
      summary: item.title, description: item.description ?? '',
      status: { id: item.state.id, name: item.state.name, statusCategory: { key: category(item.state.type) } },
      issuetype: { name: item.parent ? 'Subissue' : 'Issue', subtask: !!item.parent },
      assignee: item.assignee ? { displayName: item.assignee.name } : null,
      subtasks: [], created: item.createdAt, updated: item.updatedAt,
      linearEstimate: item.estimate,
    },
  };
}

async function stateHistory(identifier: string): Promise<JiraHistory[]> {
  const result: JiraHistory[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const data: { issue: { stateHistory: Connection<{ stateId: string; startedAt: string; state: { name: string } | null }> } | null } = await graphql(historyQuery, { issue: identifier, after });
    if (!data.issue) throw new Error(`Linear issue ${identifier} disappeared while loading history`);
    const connection = data.issue.stateHistory;
    result.push(...connection.nodes.map((span) => ({ created: span.startedAt, items: [{ field: 'status', to: span.stateId, toString: span.state?.name ?? '' }] })));
    if (!connection.pageInfo.hasNextPage) return result.sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
    after = connection.pageInfo.endCursor;
    if (!after) throw new Error('Linear state history pagination did not advance');
  }
  throw new Error('Linear state history exceeded the page limit');
}

async function loadLinear(_root: string, _testTaskName: string, withHistories: boolean): Promise<SprintData> {
  const teamKey = process.env.LINEAR_TEAM?.trim();
  if (!teamKey) throw new Error('Set LINEAR_TEAM for local Linear access');
  const response: { organization: { urlKey: string }; team: { key: string; states: { nodes: LinearState[] }; cycles: { nodes: LinearCycle[] } } | null } = await graphql(teamQuery, { team: teamKey });
  if (!response.team) throw new Error(`Linear team ${teamKey} was not found`);
  const base = `https://linear.app/${encodeURIComponent(response.organization.urlKey)}`;
  const now = Date.now();
  const cycle = response.team.cycles.nodes.find((item) => Date.parse(item.startsAt) <= now && now < Date.parse(item.endsAt)) ?? null;
  const statuses: JiraStatus[] = response.team.states.nodes.map((state) => ({ id: state.id, name: state.name, category: category(state.type) }));
  const result: SprintData = { source: 'linear', base, board: response.team.key, sprint: cycle ? { id: cycle.id, name: cycle.name || `Cycle ${cycle.number}` } : null,
    sprintUrl: cycle ? `${base}/team/${encodeURIComponent(response.team.key)}/cycle/${cycle.number}` : `${base}/team/${encodeURIComponent(response.team.key)}/cycles`, issues: [], pointsField: 'linearEstimate', statuses, histories: {} };
  if (!cycle) return result;
  const rows: LinearIssue[] = [];
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const data: { cycle: { issues: Connection<LinearIssue> } | null } = await graphql(issuesQuery, { cycle: cycle.id, after });
    if (!data.cycle) throw new Error('Linear active cycle disappeared while loading issues');
    rows.push(...data.cycle.issues.nodes);
    if (!data.cycle.issues.pageInfo.hasNextPage) break;
    after = data.cycle.issues.pageInfo.endCursor;
    if (!after) throw new Error('Linear issue pagination did not advance');
    if (page === 99) throw new Error('Linear active cycle exceeded the page limit');
  }
  const byId = new Map(rows.map((item) => [item.id, toIssue(item)]));
  for (const item of rows) if (item.parent) {
    if (byId.has(item.parent.id)) byId.get(item.parent.id)!.fields.subtasks!.push(byId.get(item.id)!);
    else byId.get(item.id)!.fields.issuetype = { name: 'Subissue', subtask: false };
  }
  result.issues = rows.filter((item) => !item.parent || !byId.has(item.parent.id)).map((item) => byId.get(item.id)!);
  if (withHistories) for (let index = 0; index < rows.length; index += 5) {
    const batch = rows.slice(index, index + 5);
    const histories = await Promise.all(batch.map((item) => stateHistory(item.identifier).catch(() => null)));
    batch.forEach((item, offset) => { result.histories[item.identifier] = histories[offset]; });
  }
  return result;
}

export const linearAdapter: SprintAdapter = { source: 'linear', load: loadLinear };
