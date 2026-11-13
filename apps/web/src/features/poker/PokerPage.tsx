import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { castVote, clearTicket, clearVote, createRoom, deleteRoom, getRoom, joinRoom, leaveRoom, listRooms, listTickets, nextRound, reveal, selectTicket, setEstimate, setMode, setRevisit } from './api';
import { POKER_CARDS, type PokerCard, type PokerRoom, type PokerRoomSummary, type PokerTicket } from './types';
import './poker.css';

const nameKey = 'unitedesk.poker.name';
function savedName(): string { try { return localStorage.getItem(nameKey) || ''; } catch { return ''; } }
function keepName(name: string) { try { localStorage.setItem(nameKey, name); } catch { /* Browser storage is optional. */ } }
function roomCode(): string | null { const match = /^#\/tools\/poker\/([A-Z0-9]{6})$/i.exec(window.location.hash); return match?.[1].toUpperCase() ?? null; }
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : 'Something went wrong';
const demo = import.meta.env.MODE === 'demo';

function Lobby() {
  const [displayName, setDisplayName] = useState(savedName);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [rooms, setRooms] = useState<PokerRoomSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void listRooms().then(({ rooms }) => { if (active) setRooms(rooms); }).catch(() => {}); return () => { active = false; }; }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const room = await createRoom(name.trim(), displayName.trim()); keepName(displayName.trim()); window.location.hash = `#/tools/poker/${room.code}`; }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function join(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const room = await joinRoom(code.trim().toUpperCase(), displayName.trim()); keepName(displayName.trim()); window.location.hash = `#/tools/poker/${room.code}`; }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  return <section className="poker-page" aria-labelledby="poker-title"><a className="poker-back" href="#/tools">← All tools</a><div className="eyebrow"><span className="eyebrow-dot" /> Tools / Planning</div><h1 id="poker-title" className="sprint-title">Scrum Poker<span className="title-period">.</span></h1><p className="sprint-description">Estimate a ticket together. Votes stay private until the host reveals them.</p>
    {demo ? <p className="poker-note">Public demo: rooms and votes exist only in this browser. No provider data is changed.</p> : null}
    {error ? <p className="sprint-alert" role="alert">{error}</p> : null}
    <div className="poker-lobby-grid"><div className="poker-panel"><span className="poker-kicker">Your seat</span><h2>Start or join a room</h2><label className="poker-field"><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} placeholder="Your name" autoComplete="nickname" required /></label><div className="poker-lobby-actions"><form onSubmit={create}><label className="poker-field"><span>New room name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Sprint planning" required /></label><button className="poker-primary" disabled={busy || !displayName.trim()} type="submit">Create room ↗</button></form><form onSubmit={join}><label className="poker-field"><span>Join with code</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" required /></label><button className="poker-secondary" disabled={busy || !displayName.trim()} type="submit">Join room</button></form></div></div><div className="poker-panel"><span className="poker-kicker">Recent rooms</span><h2>Your open rooms</h2>{rooms.length ? <div className="poker-room-list">{rooms.map((room) => <button key={room.code} type="button" onClick={() => { setCode(room.code); if (displayName.trim()) { keepName(displayName.trim()); window.location.hash = `#/tools/poker/${room.code}`; } else setError('Enter your display name first'); }}><strong>{room.name}</strong><span>{room.code} · {room.memberCount} member{room.memberCount === 1 ? '' : 's'}{room.host ? ' · Host' : ''}</span><b>↗</b></button>)}</div> : <p className="poker-muted">No rooms yet. Create one to start estimating.</p>}<p className="poker-muted poker-small">{demo ? 'Demo rooms live only in this browser until you refresh.' : 'Rooms live in server memory and expire after 24 hours without activity.'}</p></div></div>
  </section>;
}

function Room({ code }: { code: string }) {
  const [displayName, setDisplayName] = useState(savedName);
  const [ready, setReady] = useState(() => Boolean(savedName().trim()));
  const [room, setRoom] = useState<PokerRoom | null>(null);
  const [tickets, setTickets] = useState<PokerTicket[]>([]);
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketError, setTicketError] = useState('');
  const [selected, setSelected] = useState<PokerCard | null>(null);
  const [devHours, setDevHours] = useState('');
  const [qaHours, setQaHours] = useState('');
  const [estimate, setEstimateValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!ready || !displayName.trim()) return;
    let active = true; let stream: EventSource | null = null;
    void joinRoom(code, displayName.trim()).then((initial) => {
      if (!active) return; keepName(displayName.trim()); setRoom(initial); setError('');
      if (!demo) { stream = new EventSource(`/api/poker/rooms/${encodeURIComponent(code)}/events`); stream.onmessage = (event) => { if (active) setRoom(JSON.parse(event.data) as PokerRoom); }; stream.addEventListener('gone', () => { window.location.hash = '#/tools/poker'; }); }
    }).catch((reason) => { if (active) setError(errorMessage(reason)); });
    const poll = window.setInterval(() => { void getRoom(code).then((next) => { if (active) setRoom(next); }).catch(() => {}); }, demo ? 1500 : 5000);
    return () => { active = false; stream?.close(); window.clearInterval(poll); };
  }, [code, ready]);
  useEffect(() => {
    if (!room?.admin) return;
    let active = true; const timer = window.setTimeout(() => { void listTickets(ticketQuery).then(({ items }) => { if (active) { setTickets(items); setTicketError(''); } }).catch((reason) => { if (active) setTicketError(errorMessage(reason)); }); }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [room?.admin, ticketQuery]);
  const mine = room?.members.find((member) => member.id === room.you);
  useEffect(() => { if (mine?.vote) { setSelected(mine.vote.value); setDevHours(mine.vote.devHours == null ? '' : String(mine.vote.devHours)); setQaHours(mine.vote.qaHours == null ? '' : String(mine.vote.qaHours)); } }, [mine?.vote?.value, mine?.vote?.devHours, mine?.vote?.qaHours]);
  useEffect(() => { if (room?.stats?.median && !estimate) setEstimateValue(room.stats.median); if (!room?.revealed) setEstimateValue(''); }, [room?.revealed, room?.stats?.median]);
  const voted = room?.members.filter((member) => member.voted).length ?? 0;
  const candidates = useMemo(() => {
    if (!room?.stats) return [];
    return [...new Set([...room.stats.distribution.filter((item) => item.value !== '?').map((item) => item.value), ...(room.stats.median ? [room.stats.median] : [])])];
  }, [room?.stats]);
  async function act(action: () => Promise<PokerRoom>, success?: string) {
    setBusy(true); setError(''); setNotice('');
    try { const next = await action(); setRoom(next); if (success) setNotice(success); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }
  async function vote(event: FormEvent) {
    event.preventDefault(); if (!selected) return;
    const dev = room?.advanced && selected !== '?' && devHours !== '' ? Number(devHours) : null;
    const qa = room?.advanced && selected !== '?' && qaHours !== '' ? Number(qaHours) : null;
    await act(() => castVote(code, selected, dev, qa), 'Vote submitted. You can change it until results are revealed.');
  }
  async function save(publish: boolean) {
    if (!estimate) return;
    if (publish && !window.confirm(`Publish ${estimate} story points to ${room?.ticket?.key} in Jira?`)) return;
    await act(() => setEstimate(code, estimate, publish), publish ? 'Estimate published to Jira.' : 'Room estimate saved.');
  }
  if (!ready) return <section className="poker-page"><a className="poker-back" href="#/tools/poker">← Poker rooms</a><h1 className="sprint-title">Join room {code}<span className="title-period">.</span></h1><form className="poker-panel poker-join-name" onSubmit={(event) => { event.preventDefault(); if (!displayName.trim()) return; keepName(displayName.trim()); setReady(true); }}><label className="poker-field"><span>Your display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} placeholder="Your name" required /></label><button className="poker-primary" type="submit">Join room</button></form></section>;
  if (!room) return <section className="poker-page"><a className="poker-back" href="#/tools/poker">← Poker rooms</a><h1 className="sprint-title">Joining {code}<span className="title-period">.</span></h1>{error ? <p className="sprint-alert" role="alert">{error}</p> : <p className="poker-muted">Connecting to the room…</p>}</section>;
  return <section className="poker-page poker-room-page" aria-labelledby="poker-room-title"><a className="poker-back" href="#/tools/poker">← Poker rooms</a><div className="poker-room-top"><div><div className="eyebrow"><span className="eyebrow-dot" /> Tools / Scrum Poker</div><h1 id="poker-room-title" className="sprint-title">{room.name}<span className="title-period">.</span></h1><p className="sprint-description">Room <strong>{room.code}</strong> · {room.members.length} member{room.members.length === 1 ? '' : 's'} · {room.admin ? 'You are the host' : 'Waiting for the host to reveal'}</p></div><div className="poker-room-actions">{!demo ? <button type="button" className="poker-secondary" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => setNotice('Invite link copied.')).catch(() => setError('Could not copy the invite link')); }}>Copy invite link</button> : <span className="poker-demo-badge">Browser-only demo</span>}<button type="button" className="poker-secondary" onClick={() => { void leaveRoom(code).catch((reason) => setError(errorMessage(reason))).finally(() => { window.location.hash = '#/tools/poker'; }); }}>Leave</button>{room.admin ? <button type="button" className="poker-danger" onClick={() => { if (window.confirm('Delete this room for everyone?')) void deleteRoom(code).then(() => { window.location.hash = '#/tools/poker'; }).catch((reason) => setError(errorMessage(reason))); }}>Delete</button> : null}</div></div>
    {error ? <p className="sprint-alert" role="alert">{error}</p> : null}{notice ? <p className="settings-success" role="status">{notice}</p> : null}
    <div className="poker-board"><div className="poker-left"><section className="poker-panel"><div className="poker-panel-heading"><div><span className="poker-kicker">Story to estimate</span><h2>Ticket</h2></div>{room.ticket && room.admin ? <button className="poker-text-button" type="button" disabled={busy} onClick={() => void act(() => clearTicket(code))}>Clear</button> : null}</div>{room.admin ? <><label className="poker-field"><span>Search active sprint</span><input value={ticketQuery} onChange={(event) => setTicketQuery(event.target.value)} placeholder="Key, title, or description" /></label>{ticketError ? <p className="poker-error">{ticketError}</p> : null}<div className="poker-ticket-options">{tickets.slice(0, 8).map((ticket) => <button key={ticket.key} type="button" className={room.ticket?.key === ticket.key ? 'active' : ''} disabled={busy} onClick={() => void act(() => selectTicket(code, ticket.key))}><strong>{ticket.key}</strong><span>{ticket.summary}</span></button>)}{!tickets.length && !ticketError ? <p className="poker-muted">No matching active sprint tickets.</p> : null}</div></> : null}{room.ticket ? <article className="poker-ticket-detail"><div className="poker-ticket-line"><strong>{room.ticket.key}</strong><span>{room.ticket.status}</span>{room.ticket.source !== 'mock' ? <a href={room.ticket.url} target="_blank" rel="noopener noreferrer">Open source ↗</a> : null}</div><h3>{room.ticket.summary}</h3><p>{room.ticket.description || 'No description available.'}</p><div className="poker-ticket-meta"><span>Owner: {room.ticket.assignee || 'Unassigned'}</span><span>Current points: {room.ticket.storyPoints ?? '—'}</span></div>{room.revisit ? <span className="poker-revisit-mark">Needs another discussion</span> : null}</article> : <p className="poker-muted">{room.admin ? 'Choose a ticket from the current sprint.' : 'The host will choose a ticket.'}</p>}</section>
      <section className="poker-panel"><div className="poker-panel-heading"><div><span className="poker-kicker">People in the room</span><h2>Participants</h2></div><strong>{voted}/{room.members.length} voted</strong></div><div className="poker-members">{room.members.map((member) => <div key={member.id} className="poker-member"><span className="poker-avatar">{member.name.slice(0, 1).toUpperCase()}</span><span className="poker-member-name"><strong>{member.name}{member.id === room.you ? ' (you)' : ''}</strong><small>{member.admin ? 'Host · ' : ''}{member.online ? 'Online' : 'Away'}</small></span><span className={`poker-vote-status ${member.voted ? 'has-voted' : ''}`}>{room.revealed ? member.vote?.value ?? '—' : member.voted ? 'Voted' : 'Waiting'}</span></div>)}</div></section></div>
      <div className="poker-right"><section className="poker-panel"><div className="poker-panel-heading"><div><span className="poker-kicker">{room.revealed ? 'Round results' : 'Private ballot'}</span><h2>{room.revealed ? 'Results' : 'Your vote'}</h2></div>{room.admin && !room.revealed ? <label className="poker-mode"><input type="checkbox" checked={room.advanced} disabled={busy || voted > 0} onChange={(event) => void act(() => setMode(code, event.target.checked))} />Dev/QA hours</label> : null}</div>
        {!room.revealed ? <form onSubmit={vote}><div className="poker-cards" role="group" aria-label="Story point cards">{POKER_CARDS.map((card) => <button key={card} type="button" aria-pressed={selected === card} className={selected === card ? 'selected' : ''} disabled={busy} onClick={() => setSelected(card)} title={card === '?' ? 'Not sure yet' : `${card} story points`}>{card}</button>)}</div>{room.advanced && selected && selected !== '?' ? <div className="poker-hours"><label className="poker-field"><span>Development hours</span><input type="number" min="0" max="80" step="0.5" value={devHours} onChange={(event) => setDevHours(event.target.value)} placeholder="Optional" /></label><label className="poker-field"><span>QA hours</span><input type="number" min="0" max="80" step="0.5" value={qaHours} onChange={(event) => setQaHours(event.target.value)} placeholder="Optional" /></label></div> : null}<div className="poker-vote-actions"><button className="poker-primary" disabled={busy || !selected} type="submit">{mine?.voted ? 'Update vote' : 'Submit vote'}</button>{mine?.voted ? <button type="button" className="poker-text-button" disabled={busy} onClick={() => void act(() => clearVote(code))}>Clear my vote</button> : null}</div><p className="poker-muted poker-small">Other votes stay hidden until the host reveals the round. You can change yours before then.</p></form> : <><div className="poker-stats"><div><span>Median</span><strong>{room.stats?.median ?? '—'}</strong></div><div><span>Average</span><strong>{room.stats?.average ?? '—'}</strong></div><div><span>Numeric votes</span><strong>{room.stats?.count ?? 0}</strong></div></div>{room.stats?.unanimous ? <p className="poker-consensus">✦ Everyone picked the same card.</p> : null}<div className="poker-distribution">{room.stats?.distribution.map((item) => <div key={item.value}><span>{item.value === '?' ? 'Not sure' : `${item.value} points`}</span><div><i style={{ width: `${item.count / Math.max(voted, 1) * 100}%` }} /></div><strong>{item.count}</strong></div>)}</div>{room.advanced ? <p className="poker-muted">Average time: Dev {room.stats?.devAverage ?? '—'}h · QA {room.stats?.qaAverage ?? '—'}h</p> : null}</>}
        {room.admin ? <div className="poker-host-actions">{!room.revealed ? <button type="button" className="poker-secondary" disabled={busy || voted === 0} onClick={() => void act(() => reveal(code))}>Reveal votes</button> : <button type="button" className="poker-secondary" disabled={busy} onClick={() => void act(() => nextRound(code))}>New round</button>}</div> : null}
      </section>
      {room.revealed ? <section className="poker-panel"><span className="poker-kicker">Decide together</span><h2>Final estimate</h2>{room.estimate ? <p className="poker-current-estimate">{room.estimate} points {room.published ? '· Published to Jira' : '· Saved in room'}</p> : null}{room.admin ? <><label className="poker-field"><span>Choose a voted score or the median</span><select value={estimate} onChange={(event) => setEstimateValue(event.target.value)}><option value="">Select estimate</option>{candidates.map((value) => <option key={value} value={value}>{value} points{value === room.stats?.median ? ' · median' : ''}</option>)}</select></label><div className="poker-final-actions"><button type="button" className="poker-primary" disabled={busy || !room.ticket || !estimate} onClick={() => void save(false)}>Save in room</button>{room.ticket?.source === 'jira' ? <button type="button" className="poker-secondary" disabled={busy || !estimate} onClick={() => void save(true)}>Publish to Jira ↗</button> : null}</div><button type="button" className="poker-text-button" disabled={busy} onClick={() => void act(() => setRevisit(code, !room.revisit))}>{room.revisit ? 'Clear needs-discussion flag' : 'Mark for another discussion'}</button></> : <p className="poker-muted">The host will confirm the final estimate.</p>}</section> : null}
      </div></div>
  </section>;
}

export default function PokerPage() {
  const [code, setCode] = useState(roomCode);
  useEffect(() => { const update = () => setCode(roomCode()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return code ? <Room key={code} code={code} /> : <Lobby />;
}
