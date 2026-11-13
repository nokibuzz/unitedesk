import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { PokerError, pokerStore } from './rooms.js';
import { pokerTicket, pokerTickets, publishJiraPoints } from './tickets.js';

const COOKIE = 'unitedesk_poker_guest';
function guestId(request: Request): string | null {
  const match = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const value = match?.slice(COOKIE.length + 1) ?? '';
  return /^[a-f0-9-]{36}$/.test(value) ? value : null;
}
function requireGuest(request: Request): string { const id = guestId(request); if (!id) throw new PokerError(401, 'Enter a display name to join a room'); return id; }
function ensureGuest(request: Request, response: Response): string {
  const existing = guestId(request); if (existing) return existing;
  const id = randomUUID(); response.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: request.secure, path: '/api/poker', maxAge: 30 * 24 * 60 * 60 * 1000 }); return id;
}
function errorResponse(response: Response, error: unknown) { const status = error instanceof PokerError ? error.status : 503; response.status(status).json({ error: error instanceof Error ? error.message : 'Poker is unavailable' }); }
function run(response: Response, action: () => unknown | Promise<unknown>) { response.set('Cache-Control', 'no-store'); void Promise.resolve().then(action).then((body) => response.json(body)).catch((error: unknown) => errorResponse(response, error)); }

export function pokerRouter(root: string) {
  const router = Router();
  router.get('/rooms', (request, response) => run(response, () => ({ rooms: guestId(request) ? pokerStore.list(guestId(request)!) : [] })));
  router.post('/rooms', (request, response) => run(response, () => pokerStore.create(ensureGuest(request, response), String(request.body?.name ?? ''), String(request.body?.displayName ?? ''))));
  router.post('/rooms/:code/join', (request, response) => run(response, () => pokerStore.join(String(request.params.code), ensureGuest(request, response), String(request.body?.displayName ?? ''))));
  router.get('/rooms/:code', (request, response) => run(response, () => pokerStore.view(String(request.params.code), requireGuest(request))));
  router.post('/rooms/:code/leave', (request, response) => run(response, () => { pokerStore.leave(String(request.params.code), requireGuest(request)); return { ok: true }; }));
  router.delete('/rooms/:code', (request, response) => run(response, () => { pokerStore.delete(String(request.params.code), requireGuest(request)); return { ok: true }; }));
  router.get('/rooms/:code/events', (request, response) => {
    response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    try {
      const id = requireGuest(request); pokerStore.view(String(request.params.code), id); response.flushHeaders();
      const detach = pokerStore.subscribe(String(request.params.code), id, response);
      const ping = setInterval(() => response.write(': ping\n\n'), 20_000);
      response.on('close', () => { clearInterval(ping); detach(); });
    } catch (error) { if (response.headersSent) response.end(); else errorResponse(response, error); }
  });
  router.get('/tickets', (_request, response) => run(response, async () => ({ items: await pokerTickets(root, String(_request.query.q ?? '')) })));
  router.post('/rooms/:code/ticket', (request, response) => run(response, async () => pokerStore.setTicket(String(request.params.code), requireGuest(request), await pokerTicket(root, String(request.body?.key ?? '')))));
  router.delete('/rooms/:code/ticket', (request, response) => run(response, () => pokerStore.setTicket(String(request.params.code), requireGuest(request), null)));
  router.post('/rooms/:code/mode', (request, response) => run(response, () => pokerStore.setAdvanced(String(request.params.code), requireGuest(request), request.body?.advanced === true)));
  router.post('/rooms/:code/vote', (request, response) => run(response, () => pokerStore.vote(String(request.params.code), requireGuest(request), request.body ?? {})));
  router.delete('/rooms/:code/vote', (request, response) => run(response, () => pokerStore.clearVote(String(request.params.code), requireGuest(request))));
  router.post('/rooms/:code/reveal', (request, response) => run(response, () => pokerStore.reveal(String(request.params.code), requireGuest(request))));
  router.post('/rooms/:code/round', (request, response) => run(response, () => pokerStore.nextRound(String(request.params.code), requireGuest(request))));
  router.post('/rooms/:code/revisit', (request, response) => run(response, () => pokerStore.setRevisit(String(request.params.code), requireGuest(request), request.body?.revisit === true)));
  router.post('/rooms/:code/estimate', (request, response) => run(response, async () => {
    const code = String(request.params.code); const id = requireGuest(request); const value = String(request.body?.value ?? '');
    const ticket = pokerStore.eligibleEstimate(code, id, value);
    const publish = request.body?.publishToJira === true;
    if (publish) await publishJiraPoints(ticket, Number(value));
    return pokerStore.setEstimate(code, id, value, publish);
  }));
  return router;
}
