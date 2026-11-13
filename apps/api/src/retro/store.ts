import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import type { RetroAction, RetroCard, RetroColumn, RetroGroup, RetroMember, RetroPhase, RetroSessionView, RetroSettings, RetroSummary } from './types.js';

interface MemberRecord { id: string; name: string; finished: boolean }
interface GroupRecord { id: string; title: string; cardIds: string[]; notes: string }
interface SessionRecord {
  code: string; title: string; scheduledAt: string; createdAt: string; phase: RetroPhase; hostId: string;
  columns: RetroColumn[]; votesPerPerson: number; members: MemberRecord[]; cards: RetroCard[]; groups: GroupRecord[];
  votes: Record<string, Record<string, number>>; focusId: string | null;
}
interface Data { version: 1; settings: RetroSettings; sessions: SessionRecord[]; actions: RetroAction[] }
interface Subscriber { id: string; response: Response }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const defaults = (): RetroSettings => ({ columns: [
  { id: 'went-well', name: 'Went well', color: '#6f9f82' },
  { id: 'to-improve', name: 'To improve', color: '#d79b6f' },
  { id: 'ideas', name: 'Ideas', color: '#8d88ba' },
], votesPerPerson: 5 });
const code = () => [...randomBytes(8)].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
const trimmed = (value: unknown, max: number, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new RetroError(400, `${label} must be 1–${max} characters`);
  return value.trim();
};
export class RetroError extends Error { constructor(public status: number, message: string) { super(message); } }

export function validateRetroSettings(input: unknown): RetroSettings {
  if (!input || typeof input !== 'object') throw new RetroError(400, 'Retrospective settings must be an object');
  const value = input as Record<string, unknown>;
  if (!Array.isArray(value.columns) || value.columns.length < 2 || value.columns.length > 6) throw new RetroError(400, 'Choose between 2 and 6 columns');
  const columns = value.columns.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new RetroError(400, 'Invalid column');
    const column = raw as Record<string, unknown>;
    const id = trimmed(column.id, 40, 'Column ID');
    if (!/^[a-z0-9-]+$/.test(id)) throw new RetroError(400, 'Column IDs must use lowercase letters, numbers, and hyphens');
    const name = trimmed(column.name, 40, 'Column name');
    if (typeof column.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(column.color)) throw new RetroError(400, 'Choose a valid column color');
    return { id, name, color: column.color.toLowerCase() };
  });
  if (new Set(columns.map((column) => column.id)).size !== columns.length || new Set(columns.map((column) => column.name.toLowerCase())).size !== columns.length) throw new RetroError(400, 'Column names and IDs must be unique');
  const votesPerPerson = value.votesPerPerson;
  if (!Number.isInteger(votesPerPerson) || Number(votesPerPerson) < 1 || Number(votesPerPerson) > 20) throw new RetroError(400, 'Votes per person must be between 1 and 20');
  return { columns, votesPerPerson: Number(votesPerPerson) };
}

export class RetroStore {
  private data: Data;
  private file: string;
  private streams = new Map<string, Set<Subscriber>>();
  private connections = new Map<string, Map<string, number>>();
  constructor(root: string) {
    this.file = path.join(root, 'data', 'retrospectives.json');
    this.data = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) as Data : { version: 1, settings: defaults(), sessions: [], actions: [] };
    if (this.data.version !== 1 || !Array.isArray(this.data.sessions) || !Array.isArray(this.data.actions)) throw new Error('Unsupported retrospective data file');
    this.data.settings = validateRetroSettings(this.data.settings);
  }
  private save() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, this.file);
  }
  private session(raw: string): SessionRecord { const session = this.data.sessions.find((item) => item.code === raw.trim().toUpperCase()); if (!session) throw new RetroError(404, 'Retrospective not found'); return session; }
  private member(session: SessionRecord, id: string): MemberRecord { const member = session.members.find((item) => item.id === id); if (!member) throw new RetroError(403, 'Join this retrospective first'); return member; }
  private host(session: SessionRecord, id: string) { this.member(session, id); if (session.hostId !== id) throw new RetroError(403, 'Only the facilitator can do that'); }
  private phase(session: SessionRecord, expected: RetroPhase) { if (session.phase !== expected) throw new RetroError(409, `This action is only available during ${expected}`); }
  private online(session: SessionRecord, id: string) { return (this.connections.get(session.code)?.get(id) ?? 0) > 0; }
  private ready(session: SessionRecord): boolean {
    if (Date.parse(session.scheduledAt) > Date.now()) return false;
    const host = session.members.find((item) => item.id === session.hostId);
    return Boolean(host?.finished) && session.members.filter((member) => this.online(session, member.id)).every((member) => member.finished);
  }
  private totals(session: SessionRecord): Record<string, number> {
    const result: Record<string, number> = {};
    for (const vote of Object.values(session.votes)) for (const [id, count] of Object.entries(vote)) result[id] = (result[id] ?? 0) + count;
    return result;
  }
  private viewSession(session: SessionRecord, id: string): RetroSessionView {
    const member = this.member(session, id);
    const revealed = session.phase !== 'collect';
    const showTotals = session.phase === 'discuss' || session.phase === 'closed';
    const totals = showTotals ? this.totals(session) : {};
    const myVotes = session.votes[id] ?? {};
    const members: RetroMember[] = session.members.map((item) => ({ ...item, online: this.online(session, item.id), host: item.id === session.hostId }));
    const groups: RetroGroup[] = revealed ? session.groups.map((group) => ({ ...group, cardIds: [...group.cardIds], votes: totals[group.id] ?? 0 })) : [];
    return { code: session.code, title: session.title, scheduledAt: session.scheduledAt, createdAt: session.createdAt, phase: session.phase, you: id, host: session.hostId === id,
      columns: session.columns, votesPerPerson: session.votesPerPerson, members, cards: revealed ? session.cards : session.cards.filter((card) => card.authorId === id), groups,
      votesUsed: Object.values(myVotes).reduce((sum, count) => sum + count, 0), myVotes, focusId: session.focusId, readyToPresent: this.ready(session),
      actions: this.data.actions.filter((action) => action.sessionCode === session.code) };
  }
  private broadcast(session: SessionRecord) {
    for (const sub of this.streams.get(session.code) ?? []) {
      try { sub.response.write(`data: ${JSON.stringify(this.viewSession(session, sub.id))}\n\n`); } catch { this.streams.get(session.code)?.delete(sub); }
    }
  }
  settings(): RetroSettings { return structuredClone(this.data.settings); }
  saveSettings(input: unknown): RetroSettings { this.data.settings = validateRetroSettings(input); this.save(); return this.settings(); }
  list(id: string): RetroSummary[] { return this.data.sessions.filter((session) => session.members.some((member) => member.id === id)).map((session) => ({ code: session.code, title: session.title, scheduledAt: session.scheduledAt, phase: session.phase, memberCount: session.members.length, host: session.hostId === id })).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)); }
  create(id: string, titleInput: unknown, dateInput: unknown, nameInput: unknown): RetroSessionView {
    const title = trimmed(titleInput, 100, 'Title'); const name = trimmed(nameInput, 40, 'Display name');
    if (typeof dateInput !== 'string' || !Number.isFinite(Date.parse(dateInput))) throw new RetroError(400, 'Choose a valid scheduled date');
    const scheduledAt = new Date(dateInput).toISOString();
    let sessionCode = code(); while (this.data.sessions.some((item) => item.code === sessionCode)) sessionCode = code();
    const session: SessionRecord = { code: sessionCode, title, scheduledAt, createdAt: new Date().toISOString(), phase: 'collect', hostId: id, columns: structuredClone(this.data.settings.columns), votesPerPerson: this.data.settings.votesPerPerson,
      members: [{ id, name, finished: false }], cards: [], groups: [], votes: {}, focusId: null };
    this.data.sessions.push(session); this.save(); return this.viewSession(session, id);
  }
  join(raw: string, id: string, nameInput: unknown): RetroSessionView {
    const session = this.session(raw); const name = trimmed(nameInput, 40, 'Display name');
    let member = session.members.find((item) => item.id === id);
    if (!member && session.members.length >= 50) throw new RetroError(429, 'This retrospective is full');
    if (!member) { member = { id, name, finished: false }; session.members.push(member); }
    else member.name = name;
    this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  view(raw: string, id: string): RetroSessionView { return this.viewSession(this.session(raw), id); }
  subscribe(raw: string, id: string, response: Response): () => void {
    const session = this.session(raw); this.member(session, id);
    let current = this.connections.get(session.code); if (!current) { current = new Map(); this.connections.set(session.code, current); }
    current.set(id, (current.get(id) ?? 0) + 1);
    let subs = this.streams.get(session.code); if (!subs) { subs = new Set(); this.streams.set(session.code, subs); }
    const sub = { id, response }; subs.add(sub); this.broadcast(session);
    return () => { subs?.delete(sub); const left = Math.max(0, (current?.get(id) ?? 1) - 1); if (left) current?.set(id, left); else current?.delete(id); this.broadcast(session); };
  }
  addCard(raw: string, id: string, columnId: unknown, textInput: unknown): RetroSessionView {
    const session = this.session(raw); const member = this.member(session, id); this.phase(session, 'collect');
    if (member.finished) throw new RetroError(409, 'Resume editing before adding a card');
    if (!session.columns.some((column) => column.id === columnId)) throw new RetroError(400, 'Choose a valid column');
    const text = trimmed(textInput, 1000, 'Card');
    if (session.cards.length >= 500) throw new RetroError(429, 'Card limit reached');
    const card: RetroCard = { id: randomUUID(), columnId: String(columnId), text, authorId: id, createdAt: new Date().toISOString() };
    session.cards.push(card); session.groups.push({ id: randomUUID(), title: text.slice(0, 80), cardIds: [card.id], notes: '' }); this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  removeCard(raw: string, id: string, cardId: string): RetroSessionView {
    const session = this.session(raw); const member = this.member(session, id); this.phase(session, 'collect');
    if (member.finished) throw new RetroError(409, 'Resume editing before removing a card');
    const card = session.cards.find((item) => item.id === cardId); if (!card || card.authorId !== id) throw new RetroError(403, 'You can remove only your own cards');
    session.cards = session.cards.filter((item) => item.id !== cardId);
    session.groups.forEach((group) => { group.cardIds = group.cardIds.filter((item) => item !== cardId); });
    session.groups = session.groups.filter((group) => group.cardIds.length);
    this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  finish(raw: string, id: string, finished: boolean): RetroSessionView {
    const session = this.session(raw); const member = this.member(session, id); this.phase(session, 'collect'); member.finished = finished;
    this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  advance(raw: string, id: string, next: RetroPhase): RetroSessionView {
    const session = this.session(raw); this.host(session, id);
    const allowed: Record<RetroPhase, RetroPhase | null> = { collect: 'present', present: 'vote', vote: 'discuss', discuss: 'closed', closed: null };
    if (allowed[session.phase] !== next) throw new RetroError(409, 'Follow the retrospective stages in order');
    if (next === 'present' && !this.ready(session)) throw new RetroError(409, 'Wait for the scheduled date and for everyone present to finish');
    if (next === 'vote' && !session.groups.length) throw new RetroError(409, 'Add cards before voting');
    session.phase = next; session.focusId = session.groups[0]?.id ?? null;
    this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  merge(raw: string, id: string, groupIds: unknown, titleInput: unknown): RetroSessionView {
    const session = this.session(raw); this.host(session, id); this.phase(session, 'present');
    if (!Array.isArray(groupIds) || groupIds.length < 2 || new Set(groupIds).size !== groupIds.length) throw new RetroError(400, 'Select at least two different groups');
    const selected = groupIds.map((groupId) => session.groups.find((group) => group.id === groupId));
    if (selected.some((group) => !group)) throw new RetroError(404, 'Group not found');
    const title = trimmed(titleInput, 80, 'Group title');
    const group: GroupRecord = { id: randomUUID(), title, cardIds: selected.flatMap((item) => item!.cardIds), notes: '' };
    session.groups = [...session.groups.filter((item) => !groupIds.includes(item.id)), group]; session.focusId = group.id;
    this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  split(raw: string, id: string, groupId: string): RetroSessionView {
    const session = this.session(raw); this.host(session, id); this.phase(session, 'present');
    const group = session.groups.find((item) => item.id === groupId); if (!group || group.cardIds.length < 2) throw new RetroError(400, 'Choose a grouped set of cards');
    session.groups = [...session.groups.filter((item) => item.id !== groupId), ...group.cardIds.map((cardId) => ({ id: randomUUID(), title: session.cards.find((card) => card.id === cardId)?.text.slice(0, 80) ?? 'Card', cardIds: [cardId], notes: '' }))];
    session.focusId = session.groups[0]?.id ?? null; this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  focus(raw: string, id: string, groupId: string): RetroSessionView {
    const session = this.session(raw); this.host(session, id);
    if (session.phase !== 'present' && session.phase !== 'discuss') throw new RetroError(409, 'Presentation is not active');
    if (!session.groups.some((group) => group.id === groupId)) throw new RetroError(404, 'Group not found');
    session.focusId = groupId; this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  notes(raw: string, id: string, groupId: string, notesInput: unknown): RetroSessionView {
    const session = this.session(raw); this.host(session, id); this.phase(session, 'discuss');
    const group = session.groups.find((item) => item.id === groupId); if (!group) throw new RetroError(404, 'Group not found');
    if (typeof notesInput !== 'string' || notesInput.length > 2000) throw new RetroError(400, 'Discussion notes must be at most 2000 characters');
    group.notes = notesInput.trim(); this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  vote(raw: string, id: string, groupId: string, count: unknown): RetroSessionView {
    const session = this.session(raw); this.member(session, id); this.phase(session, 'vote');
    if (!session.groups.some((group) => group.id === groupId)) throw new RetroError(404, 'Group not found');
    if (!Number.isInteger(count) || Number(count) < 0 || Number(count) > session.votesPerPerson) throw new RetroError(400, 'Choose a valid vote count');
    const mine = session.votes[id] ?? {};
    const used = Object.entries(mine).reduce((sum, [key, value]) => sum + (key === groupId ? 0 : value), 0);
    if (used + Number(count) > session.votesPerPerson) throw new RetroError(400, `You have ${session.votesPerPerson} votes in total`);
    if (count) mine[groupId] = Number(count); else delete mine[groupId];
    session.votes[id] = mine; this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  addAction(raw: string, id: string, groupId: string, textInput: unknown, assigneeId: unknown, dueDate: unknown): RetroSessionView {
    const session = this.session(raw); this.member(session, id); this.phase(session, 'discuss');
    if (!session.groups.some((group) => group.id === groupId)) throw new RetroError(404, 'Group not found');
    const text = trimmed(textInput, 500, 'Action item');
    const assignee = assigneeId ? session.members.find((item) => item.id === assigneeId) : null;
    if (assigneeId && !assignee) throw new RetroError(400, 'Choose a participant as owner');
    if (dueDate !== null && dueDate !== undefined && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)))) throw new RetroError(400, 'Choose a valid due date');
    const action: RetroAction = { id: randomUUID(), sessionCode: session.code, groupId, text, assigneeId: assignee?.id ?? null, assigneeName: assignee?.name ?? null,
      dueDate: dueDate || null, createdAt: new Date().toISOString(), completedAt: null };
    this.data.actions.push(action); this.save(); this.broadcast(session); return this.viewSession(session, id);
  }
  openActions(id: string): RetroAction[] {
    if (!id) throw new RetroError(401, 'Join a retrospective first');
    return this.data.actions.filter((action) => !action.completedAt).map((action) => ({ ...action }));
  }
  completeAction(id: string, actionId: string): RetroAction {
    if (!id) throw new RetroError(401, 'Join a retrospective first');
    const action = this.data.actions.find((item) => item.id === actionId); if (!action) throw new RetroError(404, 'Action item not found');
    if (action.completedAt) throw new RetroError(409, 'Action item is already complete');
    action.completedAt = new Date().toISOString(); this.save(); this.broadcast(this.session(action.sessionCode)); return { ...action };
  }
  report(raw: string, id: string): { session: RetroSessionView; actions: RetroAction[] } {
    const session = this.session(raw); this.member(session, id); this.phase(session, 'closed');
    return { session: this.viewSession(session, id), actions: this.data.actions.filter((action) => action.sessionCode === session.code) };
  }
}
