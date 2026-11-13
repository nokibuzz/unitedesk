import type { Snapshot, Ticket, Mapping } from '../features/sprint/types';
import type { MergeRequest, ReviewSnapshot } from '../features/reviews/types';
import type { TeamSettings } from '../features/settings/types';
import type { UsefulLink } from '../features/useful-links/types';
import { demoPokerResponse } from './poker';

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const DAY = 24;
const jiraUrl = (key: string) => `https://example.atlassian.net/browse/${key}`;
function ticket(key: string, summary: string, status: string, role: Ticket['statusRole'], assignee: string | null, extra: Partial<Ticket> = {}): Ticket {
  const hours = role === 'done' ? 3 : role === 'in_testing' ? 8 : role === 'ready_for_testing' ? 18 : role === 'in_progress' ? 27 : 40;
  return { key, type: 'Story', summary, description: `${summary}. This is sample work created for the public UniteDesk demo.`, status, statusCategory: role === 'done' ? 'done' : 'indeterminate', statusRole: role,
    statusEnteredAt: ago(hours), statusAgeMs: hours * 3_600_000, createdAt: ago(120), addedToSprintAt: null, doneAt: role === 'done' ? ago(3) : null,
    assignee, tester: null, testing: 'none', testingAgeMs: null, testingWaitingAgeMs: null, testingTask: null, subtasks: [], linkedIssues: [],
    storyPoints: 3, originalEstimateSeconds: 14_400, timeSpentSeconds: 7_200, updatedAt: ago(1), url: jiraUrl(key), ...extra };
}
const sprintTickets: Ticket[] = [
  ticket('DEMO-101', 'Add unified search across the workspace', 'In Progress', 'in_progress', 'Alex Morgan', { type: 'Story', storyPoints: 5, description: 'Help the team find a ticket, document, or useful link from one place. Include keyboard support and relevant results.', subtasks: [
    { key: 'DEMO-106', summary: 'Build the search interface', status: 'In Progress', statusRole: 'in_progress', assignee: 'Alex Morgan', createdAt: ago(30), url: jiraUrl('DEMO-106') },
    { key: 'DEMO-107', summary: 'Review keyboard navigation', status: 'To Do', statusRole: 'backlog', assignee: 'Sam Taylor', createdAt: ago(2), url: jiraUrl('DEMO-107') } ] }),
  ticket('DEMO-102', 'Show active sprint ticket ownership', 'Ready for Testing', 'ready_for_testing', 'Sam Taylor', { testing: 'ready', testingWaitingAgeMs: 12 * 3_600_000, testingTask: { key: 'DEMO-108', status: 'To Do', url: jiraUrl('DEMO-108') }, storyPoints: 3, description: 'Show assignees, estimates, statuses, and a direct path back to the source ticket.' }),
  ticket('DEMO-103', 'Make empty states clear and useful', 'In Testing', 'in_testing', 'Jordan Lee', { type: 'Bug', tester: 'Casey Quinn', testing: 'in_testing', testingAgeMs: 5 * 3_600_000, testingWaitingAgeMs: 18 * 3_600_000, testingTask: { key: 'DEMO-109', status: 'In Testing', url: jiraUrl('DEMO-109') }, storyPoints: 2 }),
  ticket('DEMO-104', 'Document onboarding for new teams', 'To Do', 'backlog', null, { type: 'Task', storyPoints: 2, timeSpentSeconds: 0, addedToSprintAt: ago(4) }),
  ticket('DEMO-105', 'Publish the first team setup guide', 'Done', 'done', 'Casey Quinn', { type: 'Task', storyPoints: 2, originalEstimateSeconds: 7_200, timeSpentSeconds: 7_200, description: 'Write a short setup guide for connecting ticketing, code review, and documentation.' }),
];
function sprint(): Snapshot { return { source: 'mock', fetchedAt: new Date().toISOString(), statusMappingConfirmed: true,
  sprint: { id: 12, name: 'Demo Sprint 12', goal: 'Make teamwork easier to see and discuss', url: '' }, tickets: sprintTickets,
  daily: { timeZone: 'UTC', windowStart: ago(DAY), ticketSeconds: 180 } }; }

const alex = { username: 'alex', name: 'Alex Morgan' };
const sam = { username: 'sam', name: 'Sam Taylor' };
const jordan = { username: 'jordan', name: 'Jordan Lee' };
const casey = { username: 'casey', name: 'Casey Quinn' };
function review(id: number, title: string, author: typeof alex, reviewers: typeof alex[], days: number, status: string | null, extra: Partial<MergeRequest> = {}): MergeRequest {
  const mine = author.username === alex.username;
  const waitingForMe = !mine && reviewers.some((person) => person.username === alex.username);
  return { id: `demo:${id}`, iid: id, projectId: 1, project: id % 2 ? 'demo/workspace' : 'demo/api', title, url: 'https://github.com/nokibuzz/unitedesk/pulls',
    author, reviewers, approvedBy: [], sourceBranch: `feature/demo-${id}`, targetBranch: 'main', createdAt: ago(days * DAY), updatedAt: ago(Math.max(1, days * DAY - 5)),
    draft: false, pipelineStatus: status, pipelineKnown: true, approval: { approved: false, required: 1, left: 1, userCanApprove: waitingForMe, userHasApproved: false },
    mine, waitingForMe, aging: days >= 2, ...extra };
}
function reviews(): ReviewSnapshot { return { source: 'mock', fetchedAt: new Date().toISOString(), group: 'demo', viewer: alex, staleAfterDays: 2, items: [
  review(24, 'DEMO-101 Add workspace search', alex, [sam, casey], 1.4, 'success'),
  review(25, 'DEMO-103 Improve empty states', jordan, [alex, sam], 3.2, 'running'),
  review(26, 'DEMO-102 Expose sprint ownership', sam, [alex], 2.4, 'failed'),
  review(27, 'DEMO-104 Write onboarding guide', casey, [sam], 0.8, 'pending'),
  review(28, 'Draft: Refine dashboard navigation', alex, [jordan], 0.2, null, { draft: true }),
] }; }

const documents = [
  { id: 'confluence:guide', source: 'confluence' as const, spaceKey: 'confluence:TEAM', spaceName: 'Team handbook', title: 'How we run a sprint', url: '', parentId: null, html: '<h2>How we run a sprint</h2><p>Start with a clear goal, keep ownership visible, and review work in progress together.</p><ul><li>Choose a small sprint goal.</li><li>Review development and testing queues daily.</li><li>Capture follow-ups in the source tracker.</li></ul>' },
  { id: 'confluence:release', source: 'confluence' as const, spaceKey: 'confluence:TEAM', spaceName: 'Team handbook', title: 'Release checklist', url: '', parentId: 'confluence:guide', html: '<h2>Release checklist</h2><p>Check open reviews, testing tickets, and deployment notes before a release.</p>' },
  { id: 'github:readme', source: 'github' as const, spaceKey: 'github:unitedesk', spaceName: 'UniteDesk repository', title: 'README.md', url: 'https://github.com/nokibuzz/unitedesk/blob/main/README.md', parentId: null, html: '<h2>UniteDesk</h2><p>An open source workspace that brings sprint work, code reviews, and documentation together.</p>' },
  { id: 'notion:notes', source: 'notion' as const, spaceKey: 'notion:planning', spaceName: 'Planning notes', title: 'Team planning notes', url: '', parentId: null, html: '<h2>Team planning notes</h2><p>Keep decisions, owners, and next steps in one easy-to-find place.</p>' },
];
const mapping: Mapping = { confirmed: true, statuses: [
  { id: 'todo', name: 'To Do', category: 'new', role: 'backlog' }, { id: 'progress', name: 'In Progress', category: 'indeterminate', role: 'in_progress' },
  { id: 'ready', name: 'Ready for Testing', category: 'indeterminate', role: 'ready_for_testing' }, { id: 'testing', name: 'In Testing', category: 'indeterminate', role: 'in_testing' },
  { id: 'done', name: 'Done', category: 'done', role: 'done' },
] };
const team: TeamSettings = { dailyTimeZone: 'UTC', dailyCutoffHour: 10, dailyTicketSeconds: 180, jiraTestTaskName: 'Test the solution', gitlabStaleDays: 2 };
const links: UsefulLink[] = [
  { id: 'repo', label: 'UniteDesk on GitHub', url: 'https://github.com/nokibuzz/unitedesk', description: 'Source code and project updates', aliases: ['code', 'repository'], iconUrl: null },
  { id: 'gitlab', label: 'GitLab', url: 'https://gitlab.com', description: 'Code review platform', aliases: ['merge requests', 'code'], iconUrl: null },
  { id: 'logs', label: 'VictoriaMetrics', url: 'https://victoriametrics.com', description: 'Logs and observability', aliases: ['Victoria Logs', 'search logs'], iconUrl: null },
  { id: 'guide', label: 'GitHub documentation', url: 'https://docs.github.com', description: 'Guides and reference', aliases: ['docs', 'help'], iconUrl: null },
];

export async function demoResponse(input: string, init?: RequestInit): Promise<Response> {
  if (init?.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  const url = new URL(input, 'https://demo.unitedesk.invalid');
  if (url.pathname.startsWith('/api/poker/')) return demoPokerResponse(url, init, sprintTickets);
  if ((init?.method ?? 'GET').toUpperCase() !== 'GET') return Response.json({ error: 'The public demo is read-only. Run UniteDesk locally to change settings.' }, { status: 403 });
  const pathname = url.pathname;
  if (pathname === '/api/sprint/active') return Response.json(sprint());
  if (pathname === '/api/merge-requests') return Response.json(reviews());
  if (pathname === '/api/settings/team') return Response.json({ settings: team });
  if (pathname === '/api/ticketing/status-mapping') return Response.json(mapping);
  if (pathname === '/api/settings/code-review') return Response.json({ connection: { provider: 'mock', gitlab: { url: 'https://gitlab.com', group: '', hasToken: false }, github: { apiUrl: 'https://api.github.com', owner: '', repos: '', hasToken: false } } });
  if (pathname === '/api/useful-links') return Response.json({ links });
  if (pathname === '/api/documents') return Response.json({ source: 'mixed', sources: ['confluence', 'github', 'notion'], fetchedAt: new Date().toISOString(), warnings: [],
    spaces: [{ key: 'confluence:TEAM', name: 'Team handbook', url: '', source: 'confluence' }, { key: 'github:unitedesk', name: 'UniteDesk repository', url: 'https://github.com/nokibuzz/unitedesk', source: 'github' }, { key: 'notion:planning', name: 'Planning notes', url: '', source: 'notion' }],
    pages: documents.map(({ id, source, spaceKey, title, url: pageUrl, parentId }) => ({ id, source, spaceKey, title, url: pageUrl, parentId, kind: 'page' })) });
  if (pathname === '/api/documents/search') {
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    return Response.json({ source: 'mixed', query, searchUrl: null, warnings: [], results: documents.filter((page) => `${page.title} ${page.html} ${page.spaceName}`.toLowerCase().includes(query)).map((page) => ({ id: page.id, title: page.title, spaceKey: page.spaceKey, spaceName: page.spaceName, type: 'page', excerpt: page.html.replace(/<[^>]+>/g, ' ').slice(0, 150), url: page.url, source: page.source })) });
  }
  if (pathname.startsWith('/api/documents/')) {
    const page = documents.find((item) => item.id === decodeURIComponent(pathname.slice('/api/documents/'.length)));
    return page ? Response.json({ source: page.source, id: page.id, title: page.title, spaceKey: page.spaceKey, url: page.url, html: page.html, version: 1, updatedAt: ago(48) }) : Response.json({ error: 'Sample document not found' }, { status: 404 });
  }
  return Response.json({ error: 'Demo endpoint not found' }, { status: 404 });
}
