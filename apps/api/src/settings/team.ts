import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface TeamSettings {
  dailyTimeZone: string;
  dailyCutoffHour: number;
  dailyTicketSeconds: number;
  jiraTestTaskName: string;
  gitlabStaleDays: number;
}
const filePath = (root: string) => path.join(root, 'data', 'team-settings.json');
function defaults(): TeamSettings {
  return {
    dailyTimeZone: process.env.DAILY_TIME_ZONE?.trim() || 'UTC',
    dailyCutoffHour: Number(process.env.DAILY_CUTOFF_HOUR ?? 10),
    dailyTicketSeconds: Number(process.env.DAILY_TICKET_SECONDS ?? 180),
    jiraTestTaskName: process.env.JIRA_TEST_TASK_NAME?.trim() || 'Test the solution',
    gitlabStaleDays: Number(process.env.GITLAB_STALE_DAYS ?? 2),
  };
}
export function validateTeamSettings(input: unknown): TeamSettings {
  if (!input || typeof input !== 'object') throw new Error('Team settings must be an object');
  const value = input as Record<string, unknown>;
  const dailyTimeZone = typeof value.dailyTimeZone === 'string' ? value.dailyTimeZone.trim() : '';
  try { new Intl.DateTimeFormat('en-US', { timeZone: dailyTimeZone }); }
  catch { throw new Error('Choose a valid IANA daily time zone'); }
  const dailyCutoffHour = value.dailyCutoffHour;
  const dailyTicketSeconds = value.dailyTicketSeconds;
  const jiraTestTaskName = typeof value.jiraTestTaskName === 'string' ? value.jiraTestTaskName.trim() : '';
  const gitlabStaleDays = value.gitlabStaleDays;
  if (!Number.isInteger(dailyCutoffHour) || Number(dailyCutoffHour) < 0 || Number(dailyCutoffHour) > 23) throw new Error('Daily cutoff hour must be between 0 and 23');
  if (!Number.isInteger(dailyTicketSeconds) || Number(dailyTicketSeconds) < 15 || Number(dailyTicketSeconds) > 900) throw new Error('Daily ticket time must be between 15 and 900 seconds');
  if (!jiraTestTaskName || jiraTestTaskName.length > 100) throw new Error('Jira test task name must be 1–100 characters');
  if (typeof gitlabStaleDays !== 'number' || !Number.isFinite(gitlabStaleDays) || gitlabStaleDays <= 0 || gitlabStaleDays > 365) throw new Error('MR aging threshold must be between 0 and 365 days');
  return { dailyTimeZone, dailyCutoffHour: Number(dailyCutoffHour), dailyTicketSeconds: Number(dailyTicketSeconds), jiraTestTaskName, gitlabStaleDays };
}
export async function getTeamSettings(root: string): Promise<TeamSettings> {
  try {
    const saved: unknown = JSON.parse(await readFile(filePath(root), 'utf8'));
    if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 || !('settings' in saved)) throw new Error('Unsupported team settings file');
    return validateTeamSettings(saved.settings);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return validateTeamSettings(defaults());
  }
}
export async function saveTeamSettings(root: string, input: unknown): Promise<TeamSettings> {
  const settings = validateTeamSettings(input);
  const target = filePath(root);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify({ version: 1, settings }, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, target);
  return settings;
}
