import type { JiraHistory, JiraIssue, JiraSprint, JiraStatus } from './types.js';

export type TicketSource = 'mock' | 'jira' | 'linear';

export interface SprintData {
  source: TicketSource;
  base: string;
  board: string | number;
  sprint: JiraSprint | null;
  sprintUrl: string | null;
  issues: JiraIssue[];
  pointsField: string | null;
  statuses: JiraStatus[];
  histories: Record<string, JiraHistory[] | null>;
}

export interface SprintAdapter {
  source: TicketSource;
  load(root: string, testTaskName: string, withHistories: boolean): Promise<SprintData>;
}
