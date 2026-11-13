import { apiFetch } from '../../app/api';
import type { PokerRoom, PokerRoomSummary, PokerTicket } from './types';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await apiFetch(`/api/poker${path}`, { method, credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Poker request failed (${response.status})`);
  return data;
}
export const listRooms = () => request<{ rooms: PokerRoomSummary[] }>('/rooms');
export const createRoom = (name: string, displayName: string) => request<PokerRoom>('/rooms', 'POST', { name, displayName });
export const joinRoom = (code: string, displayName: string) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/join`, 'POST', { displayName });
export const getRoom = (code: string) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}`);
export const leaveRoom = (code: string) => request<{ ok: boolean }>(`/rooms/${encodeURIComponent(code)}/leave`, 'POST');
export const deleteRoom = (code: string) => request<{ ok: boolean }>(`/rooms/${encodeURIComponent(code)}`, 'DELETE');
export const listTickets = (query: string) => request<{ items: PokerTicket[] }>(`/tickets?q=${encodeURIComponent(query)}`);
export const selectTicket = (code: string, key: string) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/ticket`, 'POST', { key });
export const clearTicket = (code: string) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/ticket`, 'DELETE');
export const setMode = (code: string, advanced: boolean) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/mode`, 'POST', { advanced });
export const castVote = (code: string, value: string, devHours: number | null, qaHours: number | null) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/vote`, 'POST', { value, devHours, qaHours });
export const clearVote = (code: string) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/vote`, 'DELETE');
export const reveal = (code: string) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/reveal`, 'POST');
export const nextRound = (code: string) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/round`, 'POST');
export const setRevisit = (code: string, revisit: boolean) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/revisit`, 'POST', { revisit });
export const setEstimate = (code: string, value: string, publishToJira: boolean) => request<PokerRoom>(`/rooms/${encodeURIComponent(code)}/estimate`, 'POST', { value, publishToJira });
