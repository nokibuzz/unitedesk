export interface JiraSprint {
  id: number;
  name: string;
  goal?: string | null;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { id?: string; name?: string; statusCategory?: { key?: string } };
    issuetype?: { name?: string; subtask?: boolean };
    assignee?: { displayName?: string } | null;
    subtasks?: JiraIssue[];
    timetracking?: { originalEstimateSeconds?: number; timeSpentSeconds?: number };
    timeoriginalestimate?: number | null;
    timespent?: number | null;
    updated?: string;
    created?: string;
    [key: string]: unknown;
  };
}

export interface SprintTicket {
  key: string;
  type: string;
  summary: string;
  status: string;
  statusCategory: string;
  statusRole: StatusRole;
  statusEnteredAt: string | null;
  statusAgeMs: number | null;
  assignee: string | null;
  tester: string | null;
  testing: 'none' | 'ready' | 'in_testing' | 'finished';
  testingAgeMs: number | null;
  testingWaitingAgeMs: number | null;
  testingTask: { key: string; status: string; url: string } | null;
  subtasks: Array<{ key: string; summary: string; status: string; url: string }>;
  storyPoints: number | null;
  originalEstimateSeconds: number | null;
  timeSpentSeconds: number;
  updatedAt: string | null;
  url: string;
}

export interface SprintSnapshot {
  source: 'mock' | 'jira';
  fetchedAt: string;
  sprint: { id: number; name: string; goal: string | null; url: string } | null;
  tickets: SprintTicket[];
  statusMappingConfirmed: boolean;
}

export type StatusRole = 'backlog' | 'in_progress' | 'ready_for_testing' | 'in_testing' | 'done' | 'blocked' | 'other';
export interface JiraStatus { id: string; name: string; category: string }
export interface StatusMapping { confirmed: boolean; statuses: Array<JiraStatus & { role: StatusRole }> }
export interface JiraHistory { created: string; items: Array<{ field?: string; from?: string | null; fromString?: string | null; to?: string | null; toString?: string | null }> }
