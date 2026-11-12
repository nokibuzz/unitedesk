import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getMergeRequests } from '../merge-requests/service.js';
import { getActiveSprint } from '../sprint/service.js';
import { getTeamSettings, saveTeamSettings, validateTeamSettings } from './team.js';

const chosen = { dailyTimeZone: 'Europe/Belgrade', dailyCutoffHour: 9, dailyTicketSeconds: 120, jiraTestTaskName: 'QA check', gitlabStaleDays: 5 };
test('team settings reject invalid values and persist valid choices', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-settings-'));
  try {
    assert.throws(() => validateTeamSettings({ ...chosen, dailyTimeZone: 'Invalid/Zone' }), /time zone/);
    assert.throws(() => validateTeamSettings({ ...chosen, gitlabStaleDays: -1 }), /aging threshold/);
    await saveTeamSettings(root, chosen);
    assert.deepEqual(await getTeamSettings(root), chosen);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('sprint and review views use the saved team configuration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unitedesk-settings-'));
  const previousJiraMode = process.env.JIRA_MODE;
  const previousGitLabMode = process.env.GITLAB_MODE;
  process.env.JIRA_MODE = 'mock';
  process.env.GITLAB_MODE = 'mock';
  const jiraFolder = path.join(root, 'mock', 'jira');
  const gitlabFolder = path.join(root, 'mock', 'gitlab');
  try {
    await Promise.all([mkdir(jiraFolder, { recursive: true }), mkdir(gitlabFolder, { recursive: true })]);
    await saveTeamSettings(root, chosen);
    const issue = { key: 'DEMO-1', fields: { summary: 'Try settings', status: { id: '2', name: 'In Progress', statusCategory: { key: 'indeterminate' } }, issuetype: { name: 'Task' }, subtasks: [{ key: 'DEMO-2', fields: { summary: 'QA check', status: { id: '2', name: 'In Progress', statusCategory: { key: 'indeterminate' } }, created: new Date().toISOString() } }] } };
    await Promise.all([
      writeFile(path.join(jiraFolder, 'sprint.json'), JSON.stringify({ id: 1, name: 'Sprint 1' })),
      writeFile(path.join(jiraFolder, 'issues.json'), JSON.stringify([issue])),
      writeFile(path.join(jiraFolder, 'statuses.json'), JSON.stringify([{ id: '2', name: 'In Progress', category: 'indeterminate' }])),
      writeFile(path.join(jiraFolder, 'changelogs.json'), JSON.stringify({ 'DEMO-1': [], 'DEMO-2': [] })),
      writeFile(path.join(gitlabFolder, 'merge-requests.json'), JSON.stringify({ viewer: { username: 'alex', name: 'Alex' }, group: 'team', items: [{ id: '1:1', iid: 1, projectId: 1, project: 'team/app', title: 'Test', author: { username: 'alex', name: 'Alex' }, reviewers: [], approvedBy: [], createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), approval: { approved: false, userCanApprove: false, userHasApproved: false } }] })),
    ]);
    const sprint = await getActiveSprint(root);
    assert.equal(sprint.daily.timeZone, chosen.dailyTimeZone);
    assert.equal(sprint.daily.ticketSeconds, chosen.dailyTicketSeconds);
    assert.equal(sprint.tickets[0].testing, 'in_testing');
    const reviews = await getMergeRequests(root);
    assert.equal(reviews.staleAfterDays, 5);
    assert.equal(reviews.items[0].aging, false);
  } finally {
    if (previousJiraMode === undefined) delete process.env.JIRA_MODE; else process.env.JIRA_MODE = previousJiraMode;
    if (previousGitLabMode === undefined) delete process.env.GITLAB_MODE; else process.env.GITLAB_MODE = previousGitLabMode;
    await rm(root, { recursive: true, force: true });
  }
});
