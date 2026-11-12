export interface JiraSprint {
  id: number;
  name: string;
  goal?: string | null;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { key?: string } };
    issuetype?: { name?: string; subtask?: boolean };
    assignee?: { displayName?: string } | null;
    subtasks?: JiraIssue[];
    timetracking?: { originalEstimateSeconds?: number; timeSpentSeconds?: number };
    timeoriginalestimate?: number | null;
    timespent?: number | null;
    updated?: string;
    [key: string]: unknown;
  };
}

export interface SprintTicket {
  key: string;
  type: string;
  summary: string;
  status: string;
  statusCategory: string;
  assignee: string | null;
  tester: string | null;
  testing: 'none' | 'ready' | 'in_testing' | 'finished';
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
}
