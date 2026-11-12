import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot, Ticket } from './types';
import './daily.css';

const ranks: Record<Ticket['statusRole'], number> = {
  blocked: 0, in_progress: 1, ready_for_testing: 2, in_testing: 3, backlog: 4, other: 5, done: 6,
};
const testingLabels: Record<Ticket['testing'], string> = {
  none: 'No test task', ready: 'Ready for testing', in_testing: 'In testing', finished: 'Testing finished',
};
function hours(seconds: number): string { return `${Math.round(seconds / 360) / 10}h`; }
function estimate(ticket: Ticket): string {
  const points = ticket.storyPoints == null ? 'No points' : `${ticket.storyPoints} points`;
  const logged = hours(ticket.timeSpentSeconds);
  const original = ticket.originalEstimateSeconds;
  if (original == null || original <= 0) return `${points} · ${logged} logged · no time estimate`;
  const remaining = original - ticket.timeSpentSeconds;
  return remaining < 0 ? `${points} · ${logged} / ${hours(original)} · ${hours(-remaining)} over` : `${points} · ${logged} / ${hours(original)} · ${hours(remaining)} left`;
}
function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function happenedSince(value: string | null, cutoff: number): boolean {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time >= cutoff && time <= Date.now();
}
function KeyLink({ value, url, mock }: { value: string; url: string; mock: boolean }) {
  return mock ? <strong className="daily-key">{value}</strong> : <a className="daily-key" href={url} target="_blank" rel="noreferrer">{value} ↗</a>;
}
function TicketSlide({ ticket, mock, cutoff }: { ticket: Ticket; mock: boolean; cutoff: number }) {
  const workers = new Set(ticket.subtasks.filter((child) => child.statusRole === 'in_progress' || child.statusRole === 'in_testing').map((child) => child.assignee).filter((name): name is string => !!name));
  if (ticket.testing === 'in_testing' && ticket.tester) workers.add(ticket.tester);
  if (!workers.size && ticket.statusRole === 'in_progress' && ticket.assignee) workers.add(ticket.assignee);
  const children = [...ticket.subtasks].sort((a, b) => ranks[a.statusRole] - ranks[b.statusRole] || a.key.localeCompare(b.key));
  return <div className="daily-columns">
    <section className="daily-panel daily-story">
      <div className="daily-kicker">Ticket {happenedSince(ticket.addedToSprintAt, cutoff) ? <span className="daily-new">Added since last daily</span> : null}</div>
      <div className="daily-keyline"><KeyLink value={ticket.key} url={ticket.url} mock={mock} /><span className="daily-chip">{ticket.type}</span>{ticket.statusRole === 'done' ? <span className="daily-chip">Done</span> : null}</div>
      <h2>{ticket.summary}</h2>
      <dl className="daily-facts">
        <div><dt>Assignee</dt><dd>{ticket.assignee || 'Unassigned'}</dd></div>
        <div><dt>Status</dt><dd><span className="daily-chip">{ticket.status}</span></dd></div>
        <div><dt>Testing</dt><dd><span className="daily-chip">{testingLabels[ticket.testing]}</span></dd></div>
        <div><dt>Working now</dt><dd>{workers.size ? [...workers].join(', ') : 'Nobody in progress'}</dd></div>
        <div><dt>Estimate</dt><dd>{estimate(ticket)}</dd></div>
      </dl>
      <h3>Description</h3>
      <div className="daily-description">{ticket.description || <span className="muted">No description</span>}</div>
    </section>
    <section className="daily-panel">
      <h3>Subtickets <span>{children.length}</span></h3>
      {children.length ? <div className="daily-list">{children.map((child) => <article className="daily-list-item" key={child.key}>
        <div className="daily-keyline"><KeyLink value={child.key} url={child.url} mock={mock} /><span className="daily-chip">{child.status}</span>{happenedSince(child.createdAt, cutoff) ? <span className="daily-new">New</span> : null}</div>
        <strong>{child.summary}</strong><small>{child.assignee || 'Unassigned'}</small>
      </article>)}</div> : <p className="muted">No subtickets</p>}
    </section>
    <section className="daily-panel">
      <h3>Testing task</h3>
      {ticket.testingTask ? <article className="daily-list-item"><div className="daily-keyline"><KeyLink value={ticket.testingTask.key} url={ticket.testingTask.url} mock={mock} /><span className="daily-chip">{ticket.testingTask.status}</span></div><small>{ticket.tester || 'No tester assigned'}</small></article> : <p className="muted">No testing task</p>}
      <h3 className="daily-section-gap">Linked Jira issues <span>{ticket.linkedIssues.length}</span></h3>
      {ticket.linkedIssues.length ? <div className="daily-list">{ticket.linkedIssues.map((linked) => <article className="daily-list-item" key={linked.key}>
        <div className="daily-keyline"><KeyLink value={linked.key} url={linked.url} mock={mock} /><span className="daily-chip">{linked.status}</span></div>
        <strong>{linked.summary}</strong><small>{linked.relationship}</small>
      </article>)}</div> : <p className="muted">No linked issues</p>}
    </section>
  </div>;
}
function Recap({ snapshot, cutoff }: { snapshot: Snapshot; cutoff: number }) {
  const closed = snapshot.tickets.filter((ticket) => happenedSince(ticket.doneAt, cutoff));
  const added = snapshot.tickets.filter((ticket) => happenedSince(ticket.addedToSprintAt, cutoff));
  const newChildren = snapshot.tickets.flatMap((ticket) => ticket.subtasks.filter((child) => happenedSince(child.createdAt, cutoff)).map((child) => ({ parent: ticket, child })));
  const mock = snapshot.source === 'mock';
  return <div className="daily-recap">
    <div className="daily-recap-intro"><span className="daily-kicker">Since previous daily</span><h2>Sprint recap</h2><p>Changes since {new Date(cutoff).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: snapshot.daily.timeZone })} ({snapshot.daily.timeZone})</p></div>
    <div className="daily-recap-grid">
      <section className="daily-panel"><h3>{closed.length} completed <small>{closed.reduce((sum, ticket) => sum + (ticket.storyPoints ?? 0), 0)} points</small></h3>{closed.length ? closed.map((ticket) => <div className="daily-recap-row" key={ticket.key}><KeyLink value={ticket.key} url={ticket.url} mock={mock} /><span>{ticket.summary}</span></div>) : <p className="muted">No tickets completed in this window.</p>}</section>
      <section className="daily-panel"><h3>{added.length} added to sprint <small>{added.reduce((sum, ticket) => sum + (ticket.storyPoints ?? 0), 0)} points</small></h3>{added.length ? added.map((ticket) => <div className="daily-recap-row" key={ticket.key}><KeyLink value={ticket.key} url={ticket.url} mock={mock} /><span>{ticket.summary}</span></div>) : <p className="muted">No tickets added in this window.</p>}</section>
      <section className="daily-panel"><h3>{newChildren.length} new subtickets</h3>{newChildren.length ? newChildren.map(({ parent, child }) => <div className="daily-recap-row" key={child.key}><KeyLink value={child.key} url={child.url} mock={mock} /><span>{child.summary}<small>Under {parent.key}</small></span></div>) : <p className="muted">No new subtickets in this window.</p>}</section>
    </div>
  </div>;
}

export default function DailyMode({ snapshot, onClose }: { snapshot: Snapshot; onClose: () => void }) {
  const [hideDone, setHideDone] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(snapshot.daily.ticketSeconds * 1000);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deck = useMemo(() => snapshot.tickets.filter((ticket) => !hideDone || ticket.statusRole !== 'done').sort((a, b) => ranks[a.statusRole] - ranks[b.statusRole] || a.key.localeCompare(b.key)), [snapshot.tickets, hideDone]);
  const index = cursor === 'recap' ? deck.length : Math.max(0, deck.findIndex((ticket) => ticket.key === cursor));
  const ticket = deck[index] ?? null;
  const recap = deck.length > 0 && index === deck.length;
  const cutoff = Date.parse(snapshot.daily.windowStart);
  const ticketMs = snapshot.daily.ticketSeconds * 1000;
  function move(delta: number) {
    if (!deck.length) return;
    const next = Math.max(0, Math.min(deck.length, index + delta));
    setCursor(next === deck.length ? 'recap' : deck[next].key);
  }
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => {
    if (!ticket) return;
    const started = Date.now();
    setRemaining(ticketMs);
    const timer = window.setInterval(() => setRemaining(Math.max(0, ticketMs - (Date.now() - started))), 250);
    return () => window.clearInterval(timer);
  }, [ticket?.key, ticketMs]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'Tab') {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)') ?? [])];
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [deck, index, onClose]);
  return <div className="daily-backdrop"><div className="daily-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="daily-title">
    <header className="daily-header"><div><span className="daily-kicker">Daily mode</span><h1 id="daily-title">{snapshot.sprint?.name || 'Active sprint'}</h1><p>{snapshot.sprint?.goal || 'No sprint goal set'}</p>{!snapshot.statusMappingConfirmed ? <p className="daily-mapping-note">Status roles are suggestions. Confirm the mapping on the sprint page.</p> : null}</div><div className="daily-header-actions"><label><input type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} /> Hide done</label><button ref={closeRef} type="button" className="daily-close" onClick={onClose} aria-label="Close daily mode">×</button></div></header>
    <div className="daily-toolbar"><span>{ticket ? `Ticket ${index + 1} of ${deck.length}` : recap ? 'Recap' : 'No tickets'}</span>{ticket ? <div className={remaining === 0 ? 'daily-timer is-up' : 'daily-timer'} aria-label={`Time remaining ${clock(remaining)}`}><strong>{clock(remaining)}</strong><span className="daily-timer-track"><span style={{ width: `${remaining / ticketMs * 100}%` }} /></span></div> : null}</div>
    <main className="daily-stage">{ticket ? <TicketSlide ticket={ticket} mock={snapshot.source === 'mock'} cutoff={cutoff} /> : recap ? <Recap snapshot={snapshot} cutoff={cutoff} /> : <div className="daily-empty">No tickets to present. Turn off “Hide done” to include completed tickets.</div>}</main>
    <footer className="daily-footer"><button type="button" className="daily-nav" onClick={() => move(-1)} disabled={!deck.length || index === 0}>← Previous</button><div className="daily-rail" aria-label="Jump to ticket">{deck.map((item, position) => <button key={item.key} type="button" className={position === index ? 'active' : ''} onClick={() => setCursor(item.key)} aria-current={position === index ? 'step' : undefined}>{item.key}</button>)}{deck.length ? <button type="button" className={recap ? 'active' : ''} onClick={() => setCursor('recap')} aria-current={recap ? 'step' : undefined}>Recap</button> : null}</div><button type="button" className="daily-nav" onClick={() => move(1)} disabled={!deck.length || recap}>Next →</button></footer>
  </div></div>;
}
