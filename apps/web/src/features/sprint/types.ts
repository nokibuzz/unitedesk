export type Role = 'backlog' | 'in_progress' | 'ready_for_testing' | 'in_testing' | 'done' | 'blocked' | 'other';
export interface MappedStatus { id: string; name: string; category: string; role: Role }
export interface Mapping { confirmed: boolean; statuses: MappedStatus[] }
export interface Ticket {
  key: string;
  type: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: string;
  statusRole: Role;
  statusEnteredAt: string | null;
  statusAgeMs: number | null;
  createdAt: string | null;
  addedToSprintAt: string | null;
  doneAt: string | null;
  assignee: string | null;
  tester: string | null;
  testing: 'none' | 'ready' | 'in_testing' | 'finished';
  testingAgeMs: number | null;
  testingWaitingAgeMs: number | null;
  testingTask: { key: string; status: string; url: string } | null;
  subtasks: Array<{ key: string; summary: string; status: string; statusRole: Role; assignee: string | null; createdAt: string | null; url: string }>;
  linkedIssues: Array<{ key: string; summary: string; status: string; relationship: string; url: string }>;
  storyPoints: number | null;
  originalEstimateSeconds: number | null;
  timeSpentSeconds: number;
  updatedAt: string | null;
  url: string;
}
export interface Snapshot {
  source: 'mock' | 'jira' | 'linear';
  fetchedAt: string;
  statusMappingConfirmed: boolean;
  sprint: { id: number | string; name: string; goal: string | null; url: string } | null;
  tickets: Ticket[];
  daily: { timeZone: string; windowStart: string; ticketSeconds: number };
}
