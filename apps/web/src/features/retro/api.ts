import { apiFetch } from '../../app/api';
import type { RetroAction, RetroPhase, RetroSession, RetroSettings, RetroSummary } from './types';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await apiFetch(`/api/retro${path}`, { method, credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Retrospective request failed (${response.status})`);
  return data;
}
const at = (code: string) => `/sessions/${encodeURIComponent(code)}`;
export const getSettings = () => request<RetroSettings>('/settings');
export const saveSettings = (settings: RetroSettings) => request<RetroSettings>('/settings', 'PUT', settings);
export const listSessions = () => request<{ sessions: RetroSummary[] }>('/sessions');
export const createSession = (title: string, scheduledAt: string, displayName: string) => request<RetroSession>('/sessions', 'POST', { title, scheduledAt, displayName });
export const joinSession = (code: string, displayName: string) => request<RetroSession>(`${at(code)}/join`, 'POST', { displayName });
export const getSession = (code: string) => request<RetroSession>(at(code));
export const addCard = (code: string, columnId: string, text: string) => request<RetroSession>(`${at(code)}/cards`, 'POST', { columnId, text });
export const removeCard = (code: string, cardId: string) => request<RetroSession>(`${at(code)}/cards/${encodeURIComponent(cardId)}`, 'DELETE');
export const setFinished = (code: string, finished: boolean) => request<RetroSession>(`${at(code)}/finish`, 'POST', { finished });
export const advance = (code: string, phase: RetroPhase) => request<RetroSession>(`${at(code)}/phase`, 'POST', { phase });
export const mergeGroups = (code: string, groupIds: string[], title: string) => request<RetroSession>(`${at(code)}/groups`, 'POST', { groupIds, title });
export const splitGroup = (code: string, groupId: string) => request<RetroSession>(`${at(code)}/groups/${encodeURIComponent(groupId)}/split`, 'POST');
export const saveNotes = (code: string, groupId: string, notes: string) => request<RetroSession>(`${at(code)}/groups/${encodeURIComponent(groupId)}/notes`, 'POST', { notes });
export const focusGroup = (code: string, groupId: string) => request<RetroSession>(`${at(code)}/focus`, 'POST', { groupId });
export const setVote = (code: string, groupId: string, count: number) => request<RetroSession>(`${at(code)}/votes`, 'POST', { groupId, count });
export const addAction = (code: string, groupId: string, text: string, assigneeId: string | null, dueDate: string | null) => request<RetroSession>(`${at(code)}/actions`, 'POST', { groupId, text, assigneeId, dueDate });
export const listActions = () => request<{ actions: RetroAction[] }>('/actions');
export const completeAction = (id: string) => request<RetroAction>(`/actions/${encodeURIComponent(id)}/complete`, 'POST');
export const reportUrl = (code: string) => `/api/retro${at(code)}/report.pdf`;
