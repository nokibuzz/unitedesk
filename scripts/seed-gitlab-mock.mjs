import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'mock', 'gitlab');
const at = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const alex = { username: 'alex', name: 'Alex Morgan' };
const sam = { username: 'sam', name: 'Sam Taylor' };
const jordan = { username: 'jordan', name: 'Jordan Lee' };
const casey = { username: 'casey', name: 'Casey Quinn' };
const lee = { username: 'lee', name: 'Lee Rivera' };
const mr = (project, projectId, iid, title, author, reviewers, approvedBy, createdDaysAgo, pipelineStatus, approval, sourceBranch, targetBranch = 'main', draft = false) => ({
  id: `${projectId}:${iid}`, iid, projectId, project, title,
  url: `https://gitlab.example.com/${project}/-/merge_requests/${iid}`,
  author, reviewers, approvedBy, sourceBranch, targetBranch,
  createdAt: at(createdDaysAgo), updatedAt: at(Math.max(0, createdDaysAgo - 0.5)),
  draft, pipelineStatus, pipelineKnown: true, approval,
});
const items = [
  mr('team/workspace', 11, 24, 'DEMO-101 Add workspace search', alex, [sam, casey], [sam], 1.4, 'success', { approved: false, required: 2, left: 1, userCanApprove: false, userHasApproved: false }, 'feature/DEMO-101-search'),
  mr('team/workspace', 11, 25, 'DEMO-103 Improve empty states', jordan, [alex, sam], [], 3.2, 'running', { approved: false, required: 2, left: 2, userCanApprove: true, userHasApproved: false }, 'bugfix/DEMO-103-empty'),
  mr('team/api', 12, 12, 'DEMO-102 Expose sprint data', sam, [alex], [alex], 2.4, 'failed', { approved: false, required: 2, left: 1, userCanApprove: true, userHasApproved: true }, 'feature/DEMO-102-sprint'),
  mr('team/api', 12, 13, 'DEMO-104 Add setup guide endpoint', casey, [lee], [], 0.8, 'pending', { approved: false, required: 1, left: 1, userCanApprove: true, userHasApproved: false }, 'feature/DEMO-104-docs'),
  mr('team/workspace', 11, 26, 'Draft: Refine dashboard navigation', alex, [jordan], [], 0.2, null, { approved: false, required: 1, left: 1, userCanApprove: false, userHasApproved: false }, 'feature/navigation', 'main', true),
  mr('team/docs', 13, 4, 'Document local setup', lee, [sam], [], 5.1, 'success', { approved: false, required: 1, left: 1, userCanApprove: false, userHasApproved: false }, 'docs/local-setup'),
];
await mkdir(folder, { recursive: true });
await writeFile(path.join(folder, 'merge-requests.json'), `${JSON.stringify({ source: 'mock', group: 'team', viewer: alex, fetchedAt: at(0), staleAfterDays: 2, items }, null, 2)}\n`);
console.log(`Created local GitLab mock data in ${folder}`);
