import { getActiveSprint } from '../sprint/service.js';
import { PokerError } from './rooms.js';
import type { PokerTicket } from './types.js';

export async function pokerTickets(root: string, query = ''): Promise<PokerTicket[]> {
  const snapshot = await getActiveSprint(root);
  const term = query.trim().toLowerCase().slice(0, 120);
  return snapshot.tickets.filter((ticket) => !term || `${ticket.key} ${ticket.summary} ${ticket.description}`.toLowerCase().includes(term))
    .slice(0, 50).map((ticket) => ({ key: ticket.key, summary: ticket.summary, description: ticket.description, status: ticket.status,
      assignee: ticket.assignee, storyPoints: ticket.storyPoints, url: ticket.url, source: snapshot.source }));
}

export async function pokerTicket(root: string, key: string): Promise<PokerTicket> {
  const normalized = key.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(normalized)) throw new PokerError(400, 'Choose a ticket from the active sprint');
  const ticket = (await pokerTickets(root, normalized)).find((item) => item.key.toUpperCase() === normalized);
  if (!ticket) throw new PokerError(404, 'Ticket is not in the active sprint');
  return ticket;
}

function boardId(): number {
  const direct = Number(process.env.JIRA_BOARD_ID);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const raw = process.env.JIRA_BOARD_URL ?? '';
  const match = raw.match(/\/boards\/(\d+)/) ?? raw.match(/[?&]rapidView=(\d+)/);
  const parsed = Number(match?.[1]);
  if (!Number.isInteger(parsed) || parsed < 1) throw new PokerError(400, 'Set JIRA_BOARD_URL or JIRA_BOARD_ID before publishing estimates');
  return parsed;
}

export async function publishJiraPoints(ticket: PokerTicket, points: number): Promise<void> {
  if (ticket.source !== 'jira') throw new PokerError(400, 'Only a live Jira ticket can be updated');
  const rawBase = process.env.JIRA_URL?.trim() || (process.env.JIRA_BOARD_URL ? new URL(process.env.JIRA_BOARD_URL).origin : '');
  const email = process.env.JIRA_EMAIL?.trim();
  const token = process.env.JIRA_API_TOKEN?.trim();
  if (!rawBase || !email || !token) throw new PokerError(400, 'Configure Jira URL, email, and API token before publishing estimates');
  const base = new URL(rawBase);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new PokerError(400, 'Jira URL must be a base HTTP or HTTPS URL without credentials');
  const root = base.href.replace(/\/+$/, '');
  const authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  let fieldId = process.env.JIRA_STORY_POINTS_FIELD?.trim() || '';
  if (!fieldId) {
    const response = await fetch(`${root}/rest/agile/1.0/board/${boardId()}/configuration`, { headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new PokerError(response.status, `Could not discover Jira story points field (${response.status})`);
    const body = await response.json() as { estimation?: { field?: { fieldId?: string } } };
    fieldId = body.estimation?.field?.fieldId ?? '';
  }
  if (!/^customfield_\d+$/.test(fieldId)) throw new PokerError(400, 'Jira board does not expose a story points field. Set JIRA_STORY_POINTS_FIELD to its custom field ID');
  const response = await fetch(`${root}/rest/api/3/issue/${encodeURIComponent(ticket.key)}`, { method: 'PUT', headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { [fieldId]: points } }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new PokerError(response.status, `Jira did not accept the story points update (${response.status}). Check issue edit permissions and the configured field`);
}
