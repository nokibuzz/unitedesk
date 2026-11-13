import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { retrospectivePdf } from './report.js';
import { RetroError, RetroStore } from './store.js';
import type { RetroPhase } from './types.js';

const COOKIE = 'unitedesk_retro_guest';
function guestId(request: Request): string | null {
  const match = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const value = match?.slice(COOKIE.length + 1) ?? '';
  return /^[a-f0-9-]{36}$/.test(value) ? value : null;
}
function requireGuest(request: Request): string { const id = guestId(request); if (!id) throw new RetroError(401, 'Enter your name to join a retrospective'); return id; }
function ensureGuest(request: Request, response: Response): string {
  const existing = guestId(request); if (existing) return existing;
  const id = randomUUID(); response.cookie(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: request.secure, path: '/api/retro', maxAge: 90 * 24 * 60 * 60 * 1000 }); return id;
}
function handleError(response: Response, reason: unknown) {
  response.status(reason instanceof RetroError ? reason.status : 500).json({ error: reason instanceof RetroError ? reason.message : 'Retrospective is unavailable' });
}
function run(response: Response, action: () => unknown | Promise<unknown>) {
  response.set('Cache-Control', 'no-store');
  void Promise.resolve().then(action).then((value) => response.json(value)).catch((reason: unknown) => handleError(response, reason));
}

export function retroRouter(root: string) {
  const store = new RetroStore(root);
  const router = Router();
  router.get('/settings', (_request, response) => run(response, () => store.settings()));
  router.put('/settings', (request, response) => run(response, () => store.saveSettings(request.body)));
  router.get('/sessions', (request, response) => run(response, () => ({ sessions: guestId(request) ? store.list(guestId(request)!) : [] })));
  router.post('/sessions', (request, response) => run(response, () => store.create(ensureGuest(request, response), request.body?.title, request.body?.scheduledAt, request.body?.displayName)));
  router.post('/sessions/:code/join', (request, response) => run(response, () => store.join(String(request.params.code), ensureGuest(request, response), request.body?.displayName)));
  router.get('/sessions/:code', (request, response) => run(response, () => store.view(String(request.params.code), requireGuest(request))));
  router.get('/sessions/:code/events', (request, response) => {
    response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    try {
      const id = requireGuest(request); store.view(String(request.params.code), id); response.flushHeaders();
      const detach = store.subscribe(String(request.params.code), id, response);
      const ping = setInterval(() => response.write(': ping\n\n'), 20_000);
      response.on('close', () => { clearInterval(ping); detach(); });
    } catch (reason) { if (response.headersSent) response.end(); else handleError(response, reason); }
  });
  router.post('/sessions/:code/cards', (request, response) => run(response, () => store.addCard(String(request.params.code), requireGuest(request), request.body?.columnId, request.body?.text)));
  router.delete('/sessions/:code/cards/:cardId', (request, response) => run(response, () => store.removeCard(String(request.params.code), requireGuest(request), String(request.params.cardId))));
  router.post('/sessions/:code/finish', (request, response) => run(response, () => store.finish(String(request.params.code), requireGuest(request), request.body?.finished === true)));
  router.post('/sessions/:code/phase', (request, response) => run(response, () => store.advance(String(request.params.code), requireGuest(request), String(request.body?.phase) as RetroPhase)));
  router.post('/sessions/:code/groups', (request, response) => run(response, () => store.merge(String(request.params.code), requireGuest(request), request.body?.groupIds, request.body?.title)));
  router.post('/sessions/:code/groups/:groupId/split', (request, response) => run(response, () => store.split(String(request.params.code), requireGuest(request), String(request.params.groupId))));
  router.post('/sessions/:code/groups/:groupId/notes', (request, response) => run(response, () => store.notes(String(request.params.code), requireGuest(request), String(request.params.groupId), request.body?.notes)));
  router.post('/sessions/:code/focus', (request, response) => run(response, () => store.focus(String(request.params.code), requireGuest(request), String(request.body?.groupId))));
  router.post('/sessions/:code/votes', (request, response) => run(response, () => store.vote(String(request.params.code), requireGuest(request), String(request.body?.groupId), request.body?.count)));
  router.post('/sessions/:code/actions', (request, response) => run(response, () => store.addAction(String(request.params.code), requireGuest(request), String(request.body?.groupId), request.body?.text, request.body?.assigneeId, request.body?.dueDate)));
  router.get('/actions', (request, response) => run(response, () => ({ actions: store.openActions(ensureGuest(request, response)) })));
  router.post('/actions/:id/complete', (request, response) => run(response, () => store.completeAction(requireGuest(request), String(request.params.id))));
  router.get('/sessions/:code/report.pdf', (request, response) => {
    response.set('Cache-Control', 'no-store');
    void Promise.resolve().then(async () => {
      const result = store.report(String(request.params.code), requireGuest(request));
      const bytes = await retrospectivePdf(result.session, result.actions);
      response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="retrospective-${result.session.code.toLowerCase()}.pdf"` });
      response.send(Buffer.from(bytes));
    }).catch((reason: unknown) => handleError(response, reason));
  });
  return router;
}
