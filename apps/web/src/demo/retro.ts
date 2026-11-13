import type { RetroAction, RetroCard, RetroColumn, RetroGroup, RetroPhase, RetroSession, RetroSettings } from '../features/retro/types';

interface Member { id: string; name: string; finished: boolean }
interface Group { id: string; title: string; cardIds: string[]; notes: string }
interface Session { code: string; title: string; scheduledAt: string; createdAt: string; phase: RetroPhase; columns: RetroColumn[]; votesPerPerson: number; members: Member[]; cards: RetroCard[]; groups: Group[]; votes: Record<string, Record<string, number>>; focusId: string | null }
let settings: RetroSettings = { columns: [{ id: 'went-well', name: 'Went well', color: '#6f9f82' }, { id: 'to-improve', name: 'To improve', color: '#d79b6f' }, { id: 'ideas', name: 'Ideas', color: '#8d88ba' }], votesPerPerson: 5 };
const sessions = new Map<string, Session>();
const actions: RetroAction[] = [];
const you = 'browser-user';
const sampleAlex = 'sample-alex'; const sampleSam = 'sample-sam';
const fail = (message: string, status = 400) => Response.json({ error: message }, { status });
const body = (init?: RequestInit): Record<string, unknown> => { try { return JSON.parse(String(init?.body || '{}')) as Record<string, unknown>; } catch { return {}; } };
const id = () => crypto.randomUUID();
function view(session: Session): RetroSession {
  const myVotes = session.votes[you] || {};
  const totals: Record<string, number> = {};
  if (session.phase === 'discuss' || session.phase === 'closed') for (const votes of Object.values(session.votes)) for (const [groupId, count] of Object.entries(votes)) totals[groupId] = (totals[groupId] || 0) + count;
  const groups: RetroGroup[] = session.phase === 'collect' ? [] : session.groups.map((group) => ({ ...group, votes: totals[group.id] || 0 }));
  return { code: session.code, title: session.title, scheduledAt: session.scheduledAt, createdAt: session.createdAt, phase: session.phase, you, host: true,
    columns: session.columns, votesPerPerson: session.votesPerPerson, members: session.members.map((member) => ({ ...member, online: true, host: member.id === you })),
    cards: session.phase === 'collect' ? session.cards.filter((card) => card.authorId === you) : session.cards,
    groups, votesUsed: Object.values(myVotes).reduce((sum, count) => sum + count, 0), myVotes, focusId: session.focusId,
    readyToPresent: Date.parse(session.scheduledAt) <= Date.now() && session.members.every((member) => member.finished),
    actions: actions.filter((action) => action.sessionCode === session.code) };
}
function sampleCards(session: Session) {
  const examples = [
    { columnId: session.columns[0].id, text: 'The daily board made handoffs much clearer.', authorId: sampleAlex },
    { columnId: session.columns[Math.min(1, session.columns.length - 1)].id, text: 'Reviews sometimes waited too long for an owner.', authorId: sampleSam },
    { columnId: session.columns[session.columns.length - 1].id, text: 'Add a short checklist before a ticket enters testing.', authorId: sampleAlex },
  ];
  for (const item of examples) { const card: RetroCard = { id: id(), ...item, createdAt: new Date().toISOString() }; session.cards.push(card); session.groups.push({ id: id(), title: item.text, cardIds: [card.id], notes: '' }); }
}
export function demoRetroResponse(url: URL, init?: RequestInit): Response {
  const method = (init?.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/^\/api\/retro/, '');
  const input = body(init);
  if (path === '/settings') {
    if (method === 'GET') return Response.json(settings);
    if (method === 'PUT') { const columns = input.columns as RetroColumn[]; const votes = Number(input.votesPerPerson); if (!Array.isArray(columns) || columns.length < 2 || columns.length > 6 || !Number.isInteger(votes) || votes < 1 || votes > 20 || columns.some((column) => !column.name?.trim())) return fail('Choose 2–6 named columns and 1–20 votes'); settings = { columns, votesPerPerson: votes }; return Response.json(settings); }
  }
  if (path === '/sessions' && method === 'GET') return Response.json({ sessions: [...sessions.values()].map((session) => ({ code: session.code, title: session.title, scheduledAt: session.scheduledAt, phase: session.phase, memberCount: session.members.length, host: true })) });
  if (path === '/sessions' && method === 'POST') {
    const title = String(input.title || '').trim(); const name = String(input.displayName || '').trim(); const date = String(input.scheduledAt || '');
    if (!title || !name || !Number.isFinite(Date.parse(date))) return fail('Enter a title, date, and display name');
    const code = id().replace(/-/g, '').slice(0, 8).toUpperCase();
    const session: Session = { code, title, scheduledAt: new Date(date).toISOString(), createdAt: new Date().toISOString(), phase: 'collect', columns: structuredClone(settings.columns), votesPerPerson: settings.votesPerPerson,
      members: [{ id: you, name, finished: false }, { id: sampleAlex, name: 'Alex (sample)', finished: true }, { id: sampleSam, name: 'Sam (sample)', finished: true }], cards: [], groups: [], votes: {}, focusId: null };
    sampleCards(session); sessions.set(code, session); return Response.json(view(session));
  }
  if (path === '/actions' && method === 'GET') return Response.json({ actions: actions.filter((action) => !action.completedAt) });
  const actionMatch = /^\/actions\/([a-f0-9-]+)\/complete$/.exec(path);
  if (actionMatch && method === 'POST') { const action = actions.find((item) => item.id === actionMatch[1]); if (!action) return fail('Action item not found', 404); action.completedAt = new Date().toISOString(); return Response.json(action); }
  const match = /^\/sessions\/([A-Z0-9]{8})(?:\/(.*))?$/.exec(path);
  if (!match) return fail('Demo endpoint not found', 404);
  const session = sessions.get(match[1]); if (!session) return fail('This browser-only retrospective does not exist. Create one on the Retrospective page.', 404);
  const part = match[2] || '';
  if (!part && method === 'GET') return Response.json(view(session));
  if (part === 'join' && method === 'POST') { const name = String(input.displayName || '').trim(); if (!name) return fail('Enter your display name'); session.members[0].name = name; return Response.json(view(session)); }
  if (part === 'cards' && method === 'POST') {
    if (session.phase !== 'collect' || session.members[0].finished) return fail('Card collection is closed', 409);
    const text = String(input.text || '').trim(); if (!text || !session.columns.some((column) => column.id === input.columnId)) return fail('Choose a column and enter a card');
    const card: RetroCard = { id: id(), columnId: String(input.columnId), text, authorId: you, createdAt: new Date().toISOString() };
    session.cards.push(card); session.groups.push({ id: id(), title: text.slice(0, 80), cardIds: [card.id], notes: '' }); return Response.json(view(session));
  }
  const cardMatch = /^cards\/([a-f0-9-]+)$/.exec(part);
  if (cardMatch && method === 'DELETE') { const card = session.cards.find((item) => item.id === cardMatch[1]); if (!card || card.authorId !== you || session.phase !== 'collect') return fail('You can remove only your cards during collection', 403); session.cards = session.cards.filter((item) => item.id !== card.id); session.groups = session.groups.filter((group) => !group.cardIds.includes(card.id)); return Response.json(view(session)); }
  if (part === 'finish' && method === 'POST') { if (session.phase !== 'collect') return fail('Collection is closed', 409); session.members[0].finished = input.finished === true; return Response.json(view(session)); }
  if (part === 'phase' && method === 'POST') {
    const next = String(input.phase) as RetroPhase; const allowed: Record<RetroPhase, RetroPhase | null> = { collect: 'present', present: 'vote', vote: 'discuss', discuss: 'closed', closed: null };
    if (allowed[session.phase] !== next) return fail('Follow the stages in order', 409);
    if (next === 'present' && !view(session).readyToPresent) return fail('Wait for the scheduled date and everyone present to finish', 409);
    if (next === 'vote' && !session.groups.length) return fail('Add cards before voting', 409);
    session.phase = next; session.focusId = session.groups[0]?.id || null;
    if (next === 'vote') { session.votes[sampleAlex] = { [session.groups[0].id]: 1 }; session.votes[sampleSam] = { [session.groups[Math.min(1, session.groups.length - 1)].id]: 1 }; }
    return Response.json(view(session));
  }
  if (part === 'groups' && method === 'POST') {
    if (session.phase !== 'present') return fail('Grouping is only available in presentation', 409);
    const ids = input.groupIds as string[]; if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length) return fail('Choose two or more groups');
    const chosen = ids.map((groupId) => session.groups.find((group) => group.id === groupId)); if (chosen.some((group) => !group)) return fail('Group not found', 404);
    const group: Group = { id: id(), title: String(input.title || 'Grouped topic').trim().slice(0, 80), cardIds: chosen.flatMap((item) => item!.cardIds), notes: '' };
    session.groups = [...session.groups.filter((item) => !ids.includes(item.id)), group]; session.focusId = group.id; return Response.json(view(session));
  }
  const split = /^groups\/([a-f0-9-]+)\/split$/.exec(part);
  if (split && method === 'POST') { if (session.phase !== 'present') return fail('Grouping is closed', 409); const group = session.groups.find((item) => item.id === split[1]); if (!group || group.cardIds.length < 2) return fail('Choose a grouped topic'); session.groups = [...session.groups.filter((item) => item.id !== group.id), ...group.cardIds.map((cardId) => ({ id: id(), title: session.cards.find((card) => card.id === cardId)?.text.slice(0, 80) || 'Card', cardIds: [cardId], notes: '' }))]; session.focusId = session.groups[0]?.id || null; return Response.json(view(session)); }
  const notes = /^groups\/([a-f0-9-]+)\/notes$/.exec(part);
  if (notes && method === 'POST') { if (session.phase !== 'discuss') return fail('Discussion is closed', 409); const group = session.groups.find((item) => item.id === notes[1]); if (!group) return fail('Group not found', 404); group.notes = String(input.notes || '').trim().slice(0, 2000); return Response.json(view(session)); }
  if (part === 'focus' && method === 'POST') { if (session.phase !== 'present' && session.phase !== 'discuss') return fail('Presentation is not active', 409); if (!session.groups.some((group) => group.id === input.groupId)) return fail('Group not found', 404); session.focusId = String(input.groupId); return Response.json(view(session)); }
  if (part === 'votes' && method === 'POST') { if (session.phase !== 'vote') return fail('Voting is closed', 409); const groupId = String(input.groupId); const count = Number(input.count); if (!session.groups.some((group) => group.id === groupId) || !Number.isInteger(count) || count < 0 || count > session.votesPerPerson) return fail('Choose a valid vote count'); const mine = session.votes[you] || {}; const other = Object.entries(mine).reduce((sum, [key, value]) => sum + (key === groupId ? 0 : value), 0); if (other + count > session.votesPerPerson) return fail('You have used your vote budget'); if (count) mine[groupId] = count; else delete mine[groupId]; session.votes[you] = mine; return Response.json(view(session)); }
  if (part === 'actions' && method === 'POST') { if (session.phase !== 'discuss') return fail('Discussion is closed', 409); const groupId = String(input.groupId); const text = String(input.text || '').trim(); if (!session.groups.some((group) => group.id === groupId) || !text) return fail('Choose a topic and enter an action item'); const owner = session.members.find((item) => item.id === input.assigneeId); const action: RetroAction = { id: id(), sessionCode: session.code, groupId, text, assigneeId: owner?.id || null, assigneeName: owner?.name || null, dueDate: input.dueDate ? String(input.dueDate) : null, createdAt: new Date().toISOString(), completedAt: null }; actions.push(action); return Response.json(view(session)); }
  return fail('Demo endpoint not found', 404);
}
