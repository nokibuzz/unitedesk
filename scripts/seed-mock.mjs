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
  issue('DEMO-101', 'Add search to the team workspace', 'Story', 'In Progress', 96, 'Alex Morgan', [task('DEMO-105', 'Implement search UI', 'In Progress', 70)], 28800, 10800, 5),
  issue('DEMO-102', 'Show current sprint tickets', 'Task', 'Development Done', 72, 'Sam Taylor', [task('DEMO-106', 'Test the solution', 'To Do', 20)], 14400, 7200, 3),
  issue('DEMO-103', 'Handle empty states consistently', 'Bug', 'In Testing', 80, 'Jordan Lee', [task('DEMO-107', 'Test the solution', 'In Testing', 28, 'Casey Quinn')], 7200, 3600, 2),
  issue('DEMO-104', 'Document the first team setup', 'Story', 'To Do', 48, null, [], 10800, 0, null),
];
const transition = (hoursAgo, from, to) => ({ created: at(hoursAgo), items: [{ field: 'status', fromString: from, toString: to }] });
const changelogs = {
  'DEMO-101': [transition(40, 'To Do', 'In Progress')],
  'DEMO-102': [transition(50, 'To Do', 'In Progress'), transition(22, 'In Progress', 'Development Done')],
  'DEMO-103': [transition(60, 'To Do', 'In Progress'), transition(18, 'In Progress', 'In Testing')],
  'DEMO-104': [],
  'DEMO-106': [],
  'DEMO-107': [transition(8, 'To Do', 'In Testing')],
};
await mkdir(folder, { recursive: true });
await Promise.all(Object.entries({ 'sprint.json': sprint, 'issues.json': issues, 'statuses.json': statuses, 'changelogs.json': changelogs }).map(([name, value]) =>
  writeFile(path.join(folder, name), `${JSON.stringify(value, null, 2)}\n`)));
console.log(`Created local mock data in ${folder}`);
