import type { Ticket } from '../features/sprint/types';
import { POKER_CARDS, type PokerCard, type PokerRoom, type PokerTicket, type PokerVote } from '../features/poker/types';

interface Member { id: string; name: string; vote: PokerVote | null }
interface Room { code: string; name: string; members: Member[]; ticket: PokerTicket | null; advanced: boolean; revealed: boolean; estimate: string | null; revisit: boolean }
const rooms = new Map<string, Room>();
const you = 'browser-user';
const sampleVote = (value: PokerCard): PokerVote => ({ value, devHours: null, qaHours: null });
const error = (message: string, status = 400) => Response.json({ error: message }, { status });
const toTicket = (ticket: Ticket): PokerTicket => ({ key: ticket.key, summary: ticket.summary, description: ticket.description || '', status: ticket.status, assignee: ticket.assignee, storyPoints: ticket.storyPoints, url: ticket.url, source: 'mock' });
function stats(votes: PokerVote[]) {
  const numeric = votes.map((vote) => Number(vote.value)).filter(Number.isFinite).sort((a, b) => a - b);
  const average = numeric.length ? Math.round(numeric.reduce((sum, n) => sum + n, 0) / numeric.length * 10) / 10 : null;
  const median = numeric.length ? String(numeric.length % 2 ? numeric[Math.floor(numeric.length / 2)] : (numeric[numeric.length / 2 - 1] + numeric[numeric.length / 2]) / 2) : null;
  const avgHours = (key: 'devHours' | 'qaHours') => { const values = votes.map((vote) => vote[key]).filter((n): n is number => n !== null); return values.length ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length * 2) / 2 : null; };
  return { count: numeric.length, unknown: votes.filter((vote) => vote.value === '?').length, average, median,
    unanimous: votes.length >= 2 && votes.every((vote) => vote.value === votes[0].value),
    distribution: POKER_CARDS.map((value) => ({ value, count: votes.filter((vote) => vote.value === value).length })).filter((item) => item.count),
    devAverage: avgHours('devHours'), qaAverage: avgHours('qaHours') };
}
function view(room: Room): PokerRoom {
  return { code: room.code, name: room.name, you, admin: true, advanced: room.advanced, revealed: room.revealed, ticket: room.ticket, estimate: room.estimate, published: false, revisit: room.revisit,
    members: room.members.map((member) => ({ id: member.id, name: member.name, admin: member.id === you, online: true, voted: member.vote !== null, vote: room.revealed || member.id === you ? member.vote : null })),
    stats: room.revealed ? stats(room.members.flatMap((member) => member.vote ? [member.vote] : [])) : null };
}
function body(init?: RequestInit): Record<string, unknown> { try { return JSON.parse(String(init?.body || '{}')) as Record<string, unknown>; } catch { return {}; } }

export function demoPokerResponse(url: URL, init: RequestInit | undefined, tickets: Ticket[]): Response {
  const method = (init?.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/^\/api\/poker/, '');
  const values = body(init);
  if (path === '/tickets' && method === 'GET') {
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    return Response.json({ items: tickets.filter((ticket) => `${ticket.key} ${ticket.summary} ${ticket.description || ''}`.toLowerCase().includes(query)).map(toTicket) });
  }
  if (path === '/rooms' && method === 'GET') return Response.json({ rooms: [...rooms.values()].map((room) => ({ code: room.code, name: room.name, memberCount: room.members.length, host: true })) });
  if (path === '/rooms' && method === 'POST') {
    const name = String(values.name || '').trim(); const displayName = String(values.displayName || '').trim();
    if (!name || !displayName) return error('Enter a room and display name');
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    const room: Room = { code, name, members: [{ id: you, name: displayName, vote: null }, { id: 'sample-alex', name: 'Alex (sample)', vote: null }, { id: 'sample-sam', name: 'Sam (sample)', vote: null }], ticket: null, advanced: false, revealed: false, estimate: null, revisit: false };
    rooms.set(code, room); return Response.json(view(room));
  }
  const match = /^\/rooms\/([A-Z0-9]{6})(?:\/(.*))?$/.exec(path);
  if (!match) return error('Demo endpoint not found', 404);
  const room = rooms.get(match[1]); if (!room) return error('This browser-only room does not exist. Create one on the Poker page.', 404);
  const action = match[2] || '';
  if (!action && method === 'GET') return Response.json(view(room));
  if (action === 'join' && method === 'POST') { const name = String(values.displayName || '').trim(); if (!name) return error('Enter your display name'); room.members[0].name = name; return Response.json(view(room)); }
  if (action === 'leave' && method === 'POST') { rooms.delete(room.code); return Response.json({ ok: true }); }
  if (!action && method === 'DELETE') { rooms.delete(room.code); return Response.json({ ok: true }); }
  if (action === 'ticket') {
    if (method === 'DELETE') room.ticket = null;
    else if (method === 'POST') { const ticket = tickets.find((item) => item.key === values.key); if (!ticket) return error('Choose an active sprint ticket', 404); room.ticket = toTicket(ticket); }
    else return error('Unsupported action', 405);
    room.members.forEach((member) => { member.vote = null; }); room.revealed = false; room.estimate = null; room.revisit = false;
    return Response.json(view(room));
  }
  if (action === 'mode' && method === 'POST') { if (room.revealed || room.members.some((member) => member.vote)) return error('Start a new round before changing mode', 409); room.advanced = values.advanced === true; return Response.json(view(room)); }
  if (action === 'vote') {
    if (room.revealed) return error('Start a new round before voting', 409);
    if (method === 'DELETE') room.members[0].vote = null;
    else if (method === 'POST') {
      if (!POKER_CARDS.includes(values.value as PokerCard)) return error('Choose a valid card');
      const hours = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 80 && value * 2 === Math.round(value * 2) ? value : null;
      room.members[0].vote = { value: values.value as PokerCard, devHours: room.advanced ? hours(values.devHours) : null, qaHours: room.advanced ? hours(values.qaHours) : null };
      if (!room.members[1].vote) { room.members[1].vote = sampleVote('3'); room.members[2].vote = sampleVote('5'); }
    } else return error('Unsupported action', 405);
    return Response.json(view(room));
  }
  if (action === 'reveal' && method === 'POST') { if (!room.members.some((member) => member.vote)) return error('Wait for a vote', 409); room.revealed = true; return Response.json(view(room)); }
  if (action === 'round' && method === 'POST') { room.revealed = false; room.estimate = null; room.members.forEach((member) => { member.vote = null; }); return Response.json(view(room)); }
  if (action === 'revisit' && method === 'POST') { room.revisit = values.revisit === true; return Response.json(view(room)); }
  if (action === 'estimate' && method === 'POST') {
    if (values.publishToJira) return error('The public demo cannot change Jira', 403);
    if (!room.revealed || !room.ticket) return error('Reveal votes and select a ticket first', 409);
    const value = String(values.value || ''); const result = stats(room.members.flatMap((member) => member.vote ? [member.vote] : []));
    if (!result.distribution.some((item) => item.value === value) && result.median !== value) return error('Choose a voted score or the median');
    room.estimate = value; return Response.json(view(room));
  }
  return error('Demo endpoint not found', 404);
}
