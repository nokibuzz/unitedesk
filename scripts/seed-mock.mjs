import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'mock', 'jira');
const statuses = [
  { id: '1', name: 'To Do', category: 'new' },
  { id: '2', name: 'In Progress', category: 'indeterminate' },
  { id: '3', name: 'Development Done', category: 'indeterminate' },
  { id: '4', name: 'In Testing', category: 'indeterminate' },
  { id: '5', name: 'Done', category: 'done' },
];
const state = (name) => {
  const found = statuses.find((item) => item.name === name);
  return { id: found.id, name, statusCategory: { key: found.category } };
};
const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const task = (key, summary, status, created, assignee = null) => ({
  key, fields: { summary, status: state(status), created: at(created), assignee: assignee ? { displayName: assignee } : null },
});
const issue = (key, summary, type, status, created, assignee, subtasks, estimate, spent, points) => ({
  key, fields: { summary, issuetype: { name: type, subtask: false }, status: state(status), created: at(created),
    assignee: assignee ? { displayName: assignee } : null, subtasks,
    timetracking: { originalEstimateSeconds: estimate, timeSpentSeconds: spent }, customfield_10016: points, updated: at(1) },
});
const sprint = { id: 101, name: 'Example Sprint 12', goal: 'Ship the team workspace foundation' };
const issues = [
  issue('DEMO-101', 'Add search to the team workspace', 'Story', 'In Progress', 96, 'Alex Morgan', [task('DEMO-105', 'Implement search UI', 'In Progress', 70, 'Alex Morgan'), task('DEMO-109', 'Review search accessibility', 'To Do', 1, 'Sam Taylor')], 28800, 10800, 5),
  issue('DEMO-102', 'Show current sprint tickets', 'Task', 'Development Done', 72, 'Sam Taylor', [task('DEMO-106', 'Test the solution', 'To Do', 20)], 14400, 7200, 3),
  issue('DEMO-103', 'Handle empty states consistently', 'Bug', 'In Testing', 80, 'Jordan Lee', [task('DEMO-107', 'Test the solution', 'In Testing', 28, 'Casey Quinn')], 7200, 3600, 2),
  issue('DEMO-104', 'Document the first team setup', 'Story', 'To Do', 48, null, [], 10800, 0, null),
  issue('DEMO-108', 'Complete the sprint setup guide', 'Task', 'Done', 40, 'Casey Quinn', [], 7200, 7200, 2),
];
issues[0].fields.description = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Make the team workspace searchable across active sprint tickets.' }] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Search by key, title, and assignee.' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep the results keyboard accessible.' }] }] }] },
] };
issues[1].fields.description = 'Show each ticket with its status, owner, testing task, and estimate.\n\n• Keep a link back to Jira.';
issues[2].fields.description = 'Ensure the board explains empty lists clearly for both developers and testers.';
issues[3].fields.description = 'Write the setup steps for a new team.';
issues[4].fields.description = 'Finish and review the first sprint setup guide.';
issues[1].fields.issuelinks = [{ type: { name: 'relates to' }, outwardIssue: { key: 'DEMO-110', fields: { summary: 'Prepare release notes', status: state('To Do') } } }];
const transition = (hoursAgo, from, to) => ({ created: at(hoursAgo), items: [{ field: 'status', fromString: from, toString: to }] });
const sprintAdded = (hoursAgo) => ({ created: at(hoursAgo), items: [{ field: 'Sprint', fromString: 'Example Sprint 11', toString: 'Example Sprint 11, Example Sprint 12' }] });
const changelogs = {
  'DEMO-101': [transition(40, 'To Do', 'In Progress')],
  'DEMO-102': [transition(50, 'To Do', 'In Progress'), transition(22, 'In Progress', 'Development Done'), sprintAdded(3)],
  'DEMO-103': [transition(60, 'To Do', 'In Progress'), transition(18, 'In Progress', 'In Testing')],
  'DEMO-104': [],
  'DEMO-108': [transition(18, 'To Do', 'In Progress'), transition(2, 'In Progress', 'Done')],
  'DEMO-106': [],
  'DEMO-107': [transition(8, 'To Do', 'In Testing')],
};
await mkdir(folder, { recursive: true });
await Promise.all(Object.entries({ 'sprint.json': sprint, 'issues.json': issues, 'statuses.json': statuses, 'changelogs.json': changelogs }).map(([name, value]) =>
  writeFile(path.join(folder, name), `${JSON.stringify(value, null, 2)}\n`)));
console.log(`Created local mock data in ${folder}`);
