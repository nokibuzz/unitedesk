import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { POKER_CARDS, type PokerCard, type PokerMemberView, type PokerRoomView, type PokerStats, type PokerTicket, type PokerVote } from './types.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
interface Member { id: string; name: string; online: boolean; connections: number }
interface Subscriber { id: string; res: Response }
interface Room {
  code: string; name: string; adminId: string; members: Map<string, Member>; votes: Map<string, PokerVote>;
  ticket: PokerTicket | null; advanced: boolean; revealed: boolean; estimate: string | null; published: boolean; revisit: boolean;
  updatedAt: number; subscribers: Set<Subscriber>;
}
export class PokerError extends Error { constructor(public status: number, message: string) { super(message); } }

export function pokerStats(votes: PokerVote[]): PokerStats {
  const numeric = votes.map((vote) => Number(vote.value)).filter(Number.isFinite).sort((a, b) => a - b);
  const count = numeric.length;
  const mean = count ? numeric.reduce((sum, value) => sum + value, 0) / count : null;
  const median = count ? String(count % 2 ? numeric[Math.floor(count / 2)] : (numeric[count / 2 - 1] + numeric[count / 2]) / 2) : null;
  const averageHours = (field: 'devHours' | 'qaHours') => { const values = votes.map((vote) => vote[field]).filter((value): value is number => value !== null); return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 2) / 2 : null; };
  return { count, unknown: votes.filter((vote) => vote.value === '?').length, average: mean === null ? null : Math.round(mean * 10) / 10,
    median, unanimous: votes.length >= 2 && votes.every((vote) => vote.value === votes[0].value),
    distribution: POKER_CARDS.map((value) => ({ value, count: votes.filter((vote) => vote.value === value).length })).filter((item) => item.count > 0),
    devAverage: averageHours('devHours'), qaAverage: averageHours('qaHours') };
}
function validHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 80 || Math.round(value * 2) !== value * 2) throw new PokerError(400, 'Dev and QA hours must be 0–80 in half-hour steps');
  return value;
}
function code(): string { return [...randomBytes(6)].map((byte) => ALPHABET[byte % ALPHABET.length]).join(''); }
export class PokerStore {
  private rooms = new Map<string, Room>();
  private sweep() { for (const room of this.rooms.values()) if (Date.now() - room.updatedAt > ROOM_TTL_MS) this.deleteInternal(room); }
  private deleteInternal(room: Room) { for (const sub of room.subscribers) { try { sub.res.write('event: gone\ndata: {}\n\n'); sub.res.end(); } catch { /* disconnected */ } } this.rooms.delete(room.code); }
  private room(raw: string): Room { this.sweep(); const room = this.rooms.get(raw.trim().toUpperCase()); if (!room) throw new PokerError(404, 'Room not found or expired'); return room; }
  private member(room: Room, id: string): Member { const member = room.members.get(id); if (!member) throw new PokerError(403, 'Join this room first'); return member; }
  private admin(room: Room, id: string) { this.member(room, id); if (room.adminId !== id) throw new PokerError(403, 'Only the host can do that'); }
  private touch(room: Room) { room.updatedAt = Date.now(); this.broadcast(room); }
  private broadcast(room: Room) { for (const sub of [...room.subscribers]) { try { sub.res.write(`data: ${JSON.stringify(this.viewRoom(room, sub.id))}\n\n`); } catch { room.subscribers.delete(sub); } } }
  private viewRoom(room: Room, id: string): PokerRoomView {
    const members: PokerMemberView[] = [...room.members.values()].map((member) => ({ id: member.id, name: member.name, admin: member.id === room.adminId, online: member.online,
      voted: room.votes.has(member.id), vote: room.revealed || member.id === id ? room.votes.get(member.id) ?? null : null }));
    return { code: room.code, name: room.name, you: id, admin: room.adminId === id, advanced: room.advanced, revealed: room.revealed,
      ticket: room.ticket, members, stats: room.revealed ? pokerStats([...room.votes.values()]) : null, estimate: room.estimate, published: room.published, revisit: room.revisit };
  }
  create(id: string, name: string, displayName: string): PokerRoomView {
    this.sweep(); if (this.rooms.size >= 100) throw new PokerError(429, 'Too many open rooms');
    if (!name.trim() || name.trim().length > 60) throw new PokerError(400, 'Room name must be 1–60 characters');
    if (!displayName.trim() || displayName.trim().length > 40) throw new PokerError(400, 'Display name must be 1–40 characters');
    let roomCode = code(); while (this.rooms.has(roomCode)) roomCode = code();
    const room: Room = { code: roomCode, name: name.trim(), adminId: id, members: new Map([[id, { id, name: displayName.trim(), online: false, connections: 0 }]]), votes: new Map(),
      ticket: null, advanced: false, revealed: false, estimate: null, published: false, revisit: false, updatedAt: Date.now(), subscribers: new Set() };
    this.rooms.set(room.code, room); return this.viewRoom(room, id);
  }
  list(id: string) { this.sweep(); return [...this.rooms.values()].filter((room) => room.members.has(id)).map((room) => ({ code: room.code, name: room.name, memberCount: room.members.size, host: room.adminId === id })); }
  join(raw: string, id: string, name: string): PokerRoomView {
    const room = this.room(raw); if (!name.trim() || name.trim().length > 40) throw new PokerError(400, 'Display name must be 1–40 characters');
    if (!room.members.has(id) && room.members.size >= 30) throw new PokerError(429, 'This room is full');
    const current = room.members.get(id); room.members.set(id, { id, name: name.trim(), online: current?.online ?? false, connections: current?.connections ?? 0 });
    this.touch(room); return this.viewRoom(room, id);
  }
  view(raw: string, id: string): PokerRoomView { const room = this.room(raw); this.member(room, id); return this.viewRoom(room, id); }
  leave(raw: string, id: string) {
    const room = this.room(raw); this.member(room, id); room.members.delete(id); room.votes.delete(id);
    for (const sub of [...room.subscribers]) if (sub.id === id) { sub.res.end(); room.subscribers.delete(sub); }
    if (!room.members.size) { this.deleteInternal(room); return; }
    if (room.adminId === id) room.adminId = room.members.keys().next().value!;
    this.touch(room);
  }
  delete(raw: string, id: string) { const room = this.room(raw); this.admin(room, id); this.deleteInternal(room); }
  subscribe(raw: string, id: string, res: Response): () => void {
    const room = this.room(raw); const member = this.member(room, id); member.connections++; member.online = true;
    const sub = { id, res }; room.subscribers.add(sub); this.broadcast(room);
    return () => { if (!room.subscribers.delete(sub)) return; member.connections = Math.max(0, member.connections - 1); member.online = member.connections > 0; this.broadcast(room); };
  }
  setTicket(raw: string, id: string, ticket: PokerTicket | null): PokerRoomView { const room = this.room(raw); this.admin(room, id); room.ticket = ticket; room.votes.clear(); room.revealed = false; room.estimate = null; room.published = false; room.revisit = false; this.touch(room); return this.viewRoom(room, id); }
  setAdvanced(raw: string, id: string, advanced: boolean): PokerRoomView { const room = this.room(raw); this.admin(room, id); if (room.revealed || room.votes.size) throw new PokerError(409, 'Start a new round before changing vote mode'); room.advanced = advanced; this.touch(room); return this.viewRoom(room, id); }
  vote(raw: string, id: string, input: { value?: unknown; devHours?: unknown; qaHours?: unknown }): PokerRoomView {
    const room = this.room(raw); this.member(room, id); if (room.revealed) throw new PokerError(409, 'Start a new round before voting');
    if (!POKER_CARDS.includes(input.value as PokerCard)) throw new PokerError(400, 'Choose a valid card');
    const value = input.value as PokerCard; const devHours = room.advanced && value !== '?' ? validHours(input.devHours) : null; const qaHours = room.advanced && value !== '?' ? validHours(input.qaHours) : null;
    room.votes.set(id, { value, devHours, qaHours }); this.touch(room); return this.viewRoom(room, id);
  }
  clearVote(raw: string, id: string): PokerRoomView { const room = this.room(raw); this.member(room, id); if (room.revealed) throw new PokerError(409, 'Start a new round before changing your vote'); room.votes.delete(id); this.touch(room); return this.viewRoom(room, id); }
  reveal(raw: string, id: string): PokerRoomView { const room = this.room(raw); this.admin(room, id); if (!room.votes.size) throw new PokerError(409, 'Wait for at least one vote'); room.revealed = true; this.touch(room); return this.viewRoom(room, id); }
  nextRound(raw: string, id: string): PokerRoomView { const room = this.room(raw); this.admin(room, id); room.votes.clear(); room.revealed = false; room.estimate = null; room.published = false; this.touch(room); return this.viewRoom(room, id); }
  eligibleEstimate(raw: string, id: string, value: string): PokerTicket {
    const room = this.room(raw); this.admin(room, id); if (!room.revealed || !room.ticket) throw new PokerError(409, 'Reveal votes and select a ticket first');
    const numeric = Number(value); if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) throw new PokerError(400, 'Choose a numeric estimate');
    const stats = pokerStats([...room.votes.values()]);
    if (!stats.distribution.some((item) => item.value !== '?' && Number(item.value) === numeric) && Number(stats.median) !== numeric) throw new PokerError(400, 'Choose a voted value or the median');
    return room.ticket;
  }
  setEstimate(raw: string, id: string, value: string, published: boolean): PokerRoomView { const room = this.room(raw); this.eligibleEstimate(raw, id, value); room.estimate = value; room.published = published; if (published && room.ticket) room.ticket = { ...room.ticket, storyPoints: Number(value) }; this.touch(room); return this.viewRoom(room, id); }
  setRevisit(raw: string, id: string, revisit: boolean): PokerRoomView { const room = this.room(raw); this.admin(room, id); room.revisit = revisit; this.touch(room); return this.viewRoom(room, id); }
}

export const pokerStore = new PokerStore();
