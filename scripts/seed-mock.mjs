import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'mock', 'jira');
const status = (name, key) => ({ name, statusCategory: { key } });
const task = (key, summary, state, category, assignee = null) => ({
  key,
  fields: { summary, status: status(state, category), assignee: assignee ? { displayName: assignee } : null },
});

const sprint = { id: 101, name: 'Example Sprint 12', goal: 'Ship the team workspace foundation' };
const issues = [
  {
    key: 'DEMO-101',
    fields: {
      summary: 'Add search to the team workspace', issuetype: { name: 'Story', subtask: false },
      status: status('In Progress', 'indeterminate'), assignee: { displayName: 'Alex Morgan' },
      subtasks: [task('DEMO-105', 'Implement search UI', 'In Progress', 'indeterminate')],
      timetracking: { originalEstimateSeconds: 28800, timeSpentSeconds: 10800 },
      customfield_10016: 5, updated: '2026-11-12T09:30:00.000Z',
    },
  },
  {
    key: 'DEMO-102',
    fields: {
      summary: 'Show current sprint tickets', issuetype: { name: 'Task', subtask: false },
      status: status('Development Done', 'indeterminate'), assignee: { displayName: 'Sam Taylor' },
      subtasks: [task('DEMO-106', 'Test the solution', 'To Do', 'new')],
      timetracking: { originalEstimateSeconds: 14400, timeSpentSeconds: 7200 },
      customfield_10016: 3, updated: '2026-11-11T13:20:00.000Z',
    },
  },
  {
    key: 'DEMO-103',
    fields: {
      summary: 'Handle empty states consistently', issuetype: { name: 'Bug', subtask: false },
      status: status('In Testing', 'indeterminate'), assignee: { displayName: 'Jordan Lee' },
      subtasks: [task('DEMO-107', 'Test the solution', 'In Progress', 'indeterminate', 'Casey Quinn')],
      timetracking: { originalEstimateSeconds: 7200, timeSpentSeconds: 3600 },
      customfield_10016: 2, updated: '2026-11-12T10:45:00.000Z',
    },
  },
  {
    key: 'DEMO-104',
    fields: {
      summary: 'Document the first team setup', issuetype: { name: 'Story', subtask: false },
      status: status('To Do', 'new'), assignee: null, subtasks: [],
      timetracking: { originalEstimateSeconds: 10800, timeSpentSeconds: 0 },
      customfield_10016: null, updated: '2026-11-10T08:00:00.000Z',
    },
  },
];

await mkdir(folder, { recursive: true });
await Promise.all([
  writeFile(path.join(folder, 'sprint.json'), `${JSON.stringify(sprint, null, 2)}\n`),
  writeFile(path.join(folder, 'issues.json'), `${JSON.stringify(issues, null, 2)}\n`),
]);
console.log(`Created local mock data in ${folder}`);
