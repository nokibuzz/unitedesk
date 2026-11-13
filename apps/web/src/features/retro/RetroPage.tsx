import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { addAction, addCard, advance, completeAction, createSession, focusGroup, getSession, joinSession, listActions, listSessions, mergeGroups, removeCard, reportUrl, saveNotes, setFinished, setVote, splitGroup } from './api';
import type { RetroAction, RetroGroup, RetroPhase, RetroSession, RetroSummary } from './types';
import './retro.css';

const demo = import.meta.env.MODE === 'demo';
const nameKey = 'unitedesk.retro.name';
const savedName = () => { try { return localStorage.getItem(nameKey) || ''; } catch { return ''; } };
const keepName = (value: string) => { try { localStorage.setItem(nameKey, value); } catch { /* Optional browser storage. */ } };
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Something went wrong';
const codeFromHash = () => /^#\/tools\/retro\/([A-Z0-9]{8})$/i.exec(location.hash)?.[1].toUpperCase() ?? null;
const dateText = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
function defaultDate() { const date = new Date(Date.now() + (demo ? -60 : 60) * 60 * 1000); date.setMinutes(0, 0, 0); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
const phases: Array<{ id: RetroPhase; label: string }> = [{ id: 'collect', label: 'Collect' }, { id: 'present', label: 'Present & group' }, { id: 'vote', label: 'Vote' }, { id: 'discuss', label: 'Discuss' }, { id: 'closed', label: 'Report' }];

function ActionsList({ items, onComplete }: { items: RetroAction[]; onComplete: (id: string) => void }) {
  if (!items.length) return <p className="retro-muted">No open action items yet. Actions from every retrospective will appear here.</p>;
  return <div className="retro-actions-list">{items.map((item) => <div className="retro-action" key={item.id}><button type="button" className="retro-action-check" onClick={() => onComplete(item.id)} aria-label={`Complete ${item.text}`} title="Mark complete">✓</button><div><strong>{item.text}</strong><span>{item.assigneeName || 'Unassigned'}{item.dueDate ? ` · Due ${item.dueDate}` : ''} · Retro {item.sessionCode}</span></div></div>)}</div>;
}

function Lobby() {
  const [name, setName] = useState(savedName);
  const [title, setTitle] = useState('Sprint retrospective');
  const [date, setDate] = useState(defaultDate);
  const [joinCode, setJoinCode] = useState('');
  const [sessions, setSessions] = useState<RetroSummary[]>([]);
  const [actions, setActions] = useState<RetroAction[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void listSessions().then((value) => { if (active) setSessions(value.sessions); }).catch(() => {}); void listActions().then((value) => { if (active) setActions(value.actions); }).catch(() => {}); };
    refresh(); const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const session = await createSession(title.trim(), new Date(date).toISOString(), name.trim()); keepName(name.trim()); location.hash = `#/tools/retro/${session.code}`; }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function join(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const session = await joinSession(joinCode.trim().toUpperCase(), name.trim()); keepName(name.trim()); location.hash = `#/tools/retro/${session.code}`; }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  }
  async function done(id: string) {
    try { await completeAction(id); setActions((current) => current.filter((item) => item.id !== id)); }
    catch (reason) { setError(errorText(reason)); }
  }
  return <section className="retro-page"><a className="retro-back" href="#/tools">← All tools</a><div className="eyebrow"><span className="eyebrow-dot" /> Tools / Reflection</div><h1 className="sprint-title">Team Retrospective<span className="title-period">.</span></h1><p className="sprint-description">Turn individual observations into shared priorities and lasting actions.</p>
    {demo ? <p className="retro-demo-note">Public demo: sessions stay in this browser until refresh. Sample teammates help you try the flow.</p> : null}
    {error ? <p className="sprint-alert" role="alert">{error}</p> : null}
    <div className="retro-lobby-grid"><div className="retro-panel"><span className="retro-kicker">Facilitate</span><h2>Plan a retrospective</h2><label className="retro-field"><span>Your display name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Your name" required /></label><form onSubmit={create}><label className="retro-field"><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required /></label><label className="retro-field"><span>Scheduled for</span><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} required /></label><p className="retro-muted">New sessions use the columns and vote budget from <a href="#/settings/retro">Retrospective settings</a>.</p><button className="retro-primary" disabled={busy || !name.trim()} type="submit">Create retrospective ↗</button></form></div>
      <div className="retro-side-stack"><div className="retro-panel"><span className="retro-kicker">Join your team</span><h2>Enter a session</h2><form onSubmit={join}><label className="retro-field"><span>Invite code</span><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={8} placeholder="ABCD1234" required /></label><button className="retro-secondary" disabled={busy || !name.trim()} type="submit">Join session</button></form></div><div className="retro-panel"><span className="retro-kicker">Your sessions</span><h2>Recent retrospectives</h2>{sessions.length ? <div className="retro-session-list">{sessions.map((session) => <a key={session.code} href={`#/tools/retro/${session.code}`}><strong>{session.title}</strong><span>{dateText(session.scheduledAt)} · {session.phase} · {session.memberCount} people</span></a>)}</div> : <p className="retro-muted">No sessions on this browser yet. Join with a code or create one.</p>}</div></div></div>
    <section className="retro-panel retro-global-actions"><div className="retro-panel-head"><div><span className="retro-kicker">Across all retrospectives</span><h2>Open action items</h2></div><strong>{actions.length} open</strong></div><ActionsList items={actions} onComplete={(id) => void done(id)} /></section>
  </section>;
}

function DiscussionNotes({ group, session }: { group: RetroGroup; session: RetroSession }) {
  const [draft, setDraft] = useState(group.notes);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(group.notes); setSaved(false); }, [group.id, group.notes]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSaved(false);
    try { await saveNotes(session.code, group.id, draft); setSaved(true); }
    catch (reason) { setError(errorText(reason)); }
  }
  return <div className="retro-discussion-notes"><h3>Discussion notes</h3>{session.host && session.phase === 'discuss' ? <form onSubmit={(event) => void submit(event)}><textarea value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} maxLength={2000} rows={3} placeholder="Capture the decision or root cause…" /><button className="retro-secondary" type="submit" disabled={draft === group.notes}>Save notes</button>{saved ? <span role="status">Shared with the team</span> : null}{error ? <span role="alert">{error}</span> : null}</form> : <p className="retro-muted">{group.notes || 'No discussion notes for this topic.'}</p>}</div>;
}
function GroupContents({ group, session }: { group: RetroGroup; session: RetroSession }) {
  return <><div className="retro-group-cards">{group.cardIds.map((cardId) => { const card = session.cards.find((item) => item.id === cardId); if (!card) return null; const column = session.columns.find((item) => item.id === card.columnId); return <div className="retro-group-card" key={card.id} style={{ borderLeftColor: column?.color }}><span>{column?.name || 'Card'}</span><p>{card.text}</p></div>; })}</div>{session.phase === 'discuss' || session.phase === 'closed' ? <DiscussionNotes group={group} session={session} /> : null}</>;
}

function Session({ code }: { code: string }) {
  const [name, setName] = useState(savedName);
  const [ready, setReady] = useState(() => Boolean(savedName().trim()));
  const [session, setSession] = useState<RetroSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [actionText, setActionText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!ready || !name.trim()) return;
    let active = true; let stream: EventSource | null = null;
    void joinSession(code, name.trim()).then((value) => {
      if (!active) return; keepName(name.trim()); setSession(value); setError('');
      if (!demo) { stream = new EventSource(`/api/retro/sessions/${encodeURIComponent(code)}/events`); stream.onmessage = (event) => { if (active) setSession(JSON.parse(event.data) as RetroSession); }; }
    }).catch((reason) => { if (active) setError(errorText(reason)); });
    const timer = window.setInterval(() => { void getSession(code).then((value) => { if (active) setSession(value); }).catch(() => {}); }, demo ? 1500 : 6000);
    return () => { active = false; stream?.close(); window.clearInterval(timer); };
  }, [code, ready]);
  async function act(action: () => Promise<RetroSession>, message?: string) {
    setBusy(true); setError(''); setNotice('');
    try { const next = await action(); setSession(next); if (message) setNotice(message); return true; }
    catch (reason) { setError(errorText(reason)); return false; } finally { setBusy(false); }
  }
  async function add(columnId: string, event: FormEvent) {
    event.preventDefault(); const text = drafts[columnId]?.trim(); if (!text) return;
    if (await act(() => addCard(code, columnId, text))) setDrafts((current) => ({ ...current, [columnId]: '' }));
  }
  async function group(event: FormEvent) {
    event.preventDefault(); if (selectedGroups.length < 2) return;
    if (await act(() => mergeGroups(code, selectedGroups, groupTitle.trim() || 'Grouped topic'), 'Cards grouped for the team.')) { setSelectedGroups([]); setGroupTitle(''); }
  }
  async function action(event: FormEvent, groupId: string) {
    event.preventDefault(); if (!actionText.trim()) return;
    if (await act(() => addAction(code, groupId, actionText.trim(), assignee || null, dueDate || null), 'Action item added to the shared list.')) { setActionText(''); setAssignee(''); setDueDate(''); }
  }
  const sortedGroups = useMemo(() => session?.phase === 'discuss' || session?.phase === 'closed' ? [...session.groups].sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title)) : session?.groups ?? [], [session]);
  const focused = sortedGroups.find((group) => group.id === session?.focusId) ?? sortedGroups[0];
  const focusIndex = Math.max(0, sortedGroups.findIndex((group) => group.id === focused?.id));
  const mine = session?.members.find((member) => member.id === session.you);
  const remaining = session ? session.votesPerPerson - session.votesUsed : 0;
  async function download() {
    if (!session) return;
    if (demo) { window.print(); return; }
    setError('');
    try { const response = await fetch(reportUrl(code), { credentials: 'same-origin' }); if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error || 'Could not download report'); } const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `retrospective-${code.toLowerCase()}.pdf`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10_000); }
    catch (reason) { setError(errorText(reason)); }
  }
  if (!ready) return <section className="retro-page"><a className="retro-back" href="#/tools/retro">← Retrospectives</a><h1 className="sprint-title">Join {code}<span className="title-period">.</span></h1><form className="retro-panel retro-join-name" onSubmit={(event) => { event.preventDefault(); if (!name.trim()) return; keepName(name.trim()); setReady(true); }}><label className="retro-field"><span>Your display name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Your name" required /></label><button className="retro-primary" type="submit">Join retrospective</button></form></section>;
  if (!session) return <section className="retro-page"><a className="retro-back" href="#/tools/retro">← Retrospectives</a><h1 className="sprint-title">Joining {code}<span className="title-period">.</span></h1>{error ? <p className="sprint-alert" role="alert">{error}</p> : <p className="retro-muted">Connecting to the team…</p>}</section>;
  return <section className="retro-page retro-session-page"><a className="retro-back" href="#/tools/retro">← Retrospectives</a><div className="retro-top"><div><div className="eyebrow"><span className="eyebrow-dot" /> Tools / Team Retrospective</div><h1 className="sprint-title">{session.title}<span className="title-period">.</span></h1><p className="sprint-description">Scheduled {dateText(session.scheduledAt)} · Code <strong>{session.code}</strong> · {session.members.length} participant{session.members.length === 1 ? '' : 's'}</p></div><div className="retro-top-actions">{!demo ? <button className="retro-secondary" type="button" onClick={() => { void navigator.clipboard.writeText(location.href).then(() => setNotice('Invite link copied.')).catch(() => setError('Could not copy link')); }}>Copy invite link</button> : <span className="retro-demo-badge">Browser-only demo</span>}{session.phase === 'closed' ? <button className="retro-primary" type="button" onClick={() => void download()}>{demo ? 'Print / Save as PDF' : 'Download PDF report ↓'}</button> : null}</div></div>
    <div className="retro-stage-list" aria-label="Retrospective stages">{phases.map((item, index) => <div key={item.id} className={`${session.phase === item.id ? 'active' : ''} ${phases.findIndex((phase) => phase.id === session.phase) > index ? 'done' : ''}`}><span>{String(index + 1).padStart(2, '0')}</span>{item.label}</div>)}</div>
    {error ? <p className="sprint-alert" role="alert">{error}</p> : null}{notice ? <p className="settings-success" role="status">{notice}</p> : null}
    <div className="retro-layout"><div className="retro-main">
      {session.phase === 'collect' ? <><div className="retro-section-heading"><div><span className="retro-kicker">01 / Gather ideas</span><h2>Write your cards</h2><p>Others' cards stay private until the facilitator starts presentation. You can add ideas early, before the scheduled date.</p></div></div><div className="retro-columns">{session.columns.map((column) => <section className="retro-column" key={column.id} style={{ borderTopColor: column.color }}><div className="retro-column-head"><h3>{column.name}</h3><span>{session.cards.filter((card) => card.columnId === column.id).length} yours</span></div><div className="retro-card-list">{session.cards.filter((card) => card.columnId === column.id).map((card) => <article className="retro-card" key={card.id}><p>{card.text}</p>{card.authorId === session.you && !mine?.finished ? <button type="button" onClick={() => void act(() => removeCard(code, card.id))} aria-label="Remove card">×</button> : null}</article>)}</div>{!mine?.finished ? <form onSubmit={(event) => void add(column.id, event)}><textarea value={drafts[column.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [column.id]: event.target.value }))} maxLength={1000} rows={3} placeholder={`Add to ${column.name.toLowerCase()}…`} /><button className="retro-secondary" disabled={busy || !drafts[column.id]?.trim()} type="submit">+ Add card</button></form> : null}</section>)}</div><div className="retro-panel retro-collect-footer"><div><strong>{mine?.finished ? 'You are finished' : 'Still collecting ideas'}</strong><p>{mine?.finished ? 'You can resume editing while collection is open.' : 'Mark finished when your cards are ready.'}</p></div><button className="retro-primary" disabled={busy} type="button" onClick={() => void act(() => setFinished(code, !mine?.finished))}>{mine?.finished ? 'Resume editing' : 'Finished adding cards ✓'}</button></div></> : null}
      {session.phase === 'present' ? <><div className="retro-section-heading"><div><span className="retro-kicker">02 / Presentation</span><h2>Find the common themes</h2><p>The facilitator's spotlight is synchronized on every screen. Select two or more topics to group related cards.</p></div></div><div className="retro-presentation"><div className="retro-panel retro-focus"><span className="retro-kicker">Now presenting · {focusIndex + 1} / {sortedGroups.length}</span><h2>{focused?.title || 'Choose a topic'}</h2>{focused ? <GroupContents group={focused} session={session} /> : null}{session.host && sortedGroups.length > 1 ? <div className="retro-focus-controls"><button type="button" className="retro-secondary" disabled={busy || focusIndex === 0} onClick={() => void act(() => focusGroup(code, sortedGroups[focusIndex - 1].id))}>← Previous</button><button type="button" className="retro-secondary" disabled={busy || focusIndex >= sortedGroups.length - 1} onClick={() => void act(() => focusGroup(code, sortedGroups[focusIndex + 1].id))}>Next →</button></div> : null}</div><div className="retro-panel retro-group-list"><span className="retro-kicker">All topics</span><h2>Group cards</h2>{sortedGroups.map((group) => <div className={`retro-group-row ${focused?.id === group.id ? 'focused' : ''}`} key={group.id}><label>{session.host ? <input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={(event) => setSelectedGroups((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} /> : null}<span><strong>{group.title}</strong><small>{group.cardIds.length} card{group.cardIds.length === 1 ? '' : 's'}</small></span></label>{session.host ? <div><button type="button" onClick={() => void act(() => focusGroup(code, group.id))}>Present</button>{group.cardIds.length > 1 ? <button type="button" onClick={() => void act(() => splitGroup(code, group.id))}>Ungroup</button> : null}</div> : null}</div>)}{session.host ? <form className="retro-group-form" onSubmit={group}><input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} maxLength={80} placeholder="Theme title" /><button type="submit" className="retro-secondary" disabled={busy || selectedGroups.length < 2}>Group selected</button></form> : null}</div></div>{session.host ? <div className="retro-next-bar"><p>Ready to prioritize these themes?</p><button type="button" className="retro-primary" onClick={() => void act(() => advance(code, 'vote'))}>Open voting →</button></div> : null}</> : null}
      {session.phase === 'vote' ? <><div className="retro-section-heading"><div><span className="retro-kicker">03 / Prioritize</span><h2>Vote on what matters</h2><p>Distribute up to {session.votesPerPerson} votes across topics. Counts stay hidden until discussion begins.</p></div><span className="retro-vote-budget">{remaining} / {session.votesPerPerson} left</span></div><div className="retro-vote-grid">{session.groups.map((group) => <article className="retro-panel retro-vote-card" key={group.id}><span className="retro-kicker">{group.cardIds.length} card{group.cardIds.length === 1 ? '' : 's'}</span><h3>{group.title}</h3><GroupContents group={group} session={session} /><div className="retro-vote-control"><button type="button" disabled={busy || !session.myVotes[group.id]} onClick={() => void act(() => setVote(code, group.id, (session.myVotes[group.id] || 0) - 1))} aria-label={`Remove vote from ${group.title}`}>−</button><strong>{session.myVotes[group.id] || 0}</strong><button type="button" disabled={busy || remaining <= 0} onClick={() => void act(() => setVote(code, group.id, (session.myVotes[group.id] || 0) + 1))} aria-label={`Vote for ${group.title}`}>+</button><span>Your votes</span></div></article>)}</div>{session.host ? <div className="retro-next-bar"><p>When everyone is ready, reveal priorities for discussion.</p><button type="button" className="retro-primary" onClick={() => void act(() => advance(code, 'discuss'))}>Start discussion →</button></div> : null}</> : null}
      {session.phase === 'discuss' || session.phase === 'closed' ? <><div className="retro-section-heading"><div><span className="retro-kicker">{session.phase === 'closed' ? '05 / Outcomes' : '04 / Discuss & act'}</span><h2>{session.phase === 'closed' ? 'Retrospective summary' : 'Discuss in priority order'}</h2><p>{session.phase === 'closed' ? 'Your report and follow-up actions are ready.' : 'The facilitator guides the group through topics with the most votes. Add concrete follow-up actions below.'}</p></div></div><div className="retro-discussion"><div className="retro-priority-list">{sortedGroups.map((group, index) => <button key={group.id} type="button" className={focused?.id === group.id ? 'active' : ''} disabled={!session.host && session.phase === 'discuss'} onClick={() => { if (session.host && session.phase === 'discuss') void act(() => focusGroup(code, group.id)); }}><span>{String(index + 1).padStart(2, '0')}</span><strong>{group.title}</strong><b>{group.votes} vote{group.votes === 1 ? '' : 's'}</b></button>)}</div><div className="retro-panel retro-discussion-main">{focused ? <><span className="retro-kicker">Priority {focusIndex + 1} of {sortedGroups.length}</span><h2>{focused.title}</h2><p className="retro-vote-total">{focused.votes} vote{focused.votes === 1 ? '' : 's'} · {focused.cardIds.length} card{focused.cardIds.length === 1 ? '' : 's'}</p><GroupContents group={focused} session={session} /><div className="retro-topic-actions"><h3>Action items</h3>{session.actions.filter((item) => item.groupId === focused.id).length ? session.actions.filter((item) => item.groupId === focused.id).map((item) => <div className="retro-topic-action" key={item.id}><strong>{item.text}</strong><span>{item.assigneeName || 'Unassigned'}{item.dueDate ? ` · Due ${item.dueDate}` : ''}{item.completedAt ? ' · Completed' : ''}</span></div>) : <p className="retro-muted">No action items for this topic yet.</p>}{session.phase === 'discuss' ? <form className="retro-action-form" onSubmit={(event) => void action(event, focused.id)}><label className="retro-field"><span>New action item</span><textarea value={actionText} onChange={(event) => setActionText(event.target.value)} maxLength={500} rows={2} placeholder="What will we change?" required /></label><div><label className="retro-field"><span>Owner</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Unassigned</option>{session.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="retro-field"><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></div><button type="submit" className="retro-primary" disabled={busy || !actionText.trim()}>Add action item</button></form> : null}</div></> : null}{session.host && session.phase === 'discuss' && sortedGroups.length > 1 ? <div className="retro-focus-controls"><button type="button" className="retro-secondary" disabled={busy || focusIndex === 0} onClick={() => void act(() => focusGroup(code, sortedGroups[focusIndex - 1].id))}>← Previous</button><button type="button" className="retro-secondary" disabled={busy || focusIndex >= sortedGroups.length - 1} onClick={() => void act(() => focusGroup(code, sortedGroups[focusIndex + 1].id))}>Next →</button></div> : null}</div></div>{session.host && session.phase === 'discuss' ? <div className="retro-next-bar"><p>Close when the team has captured its follow-up actions.</p><button type="button" className="retro-primary" onClick={() => { if (window.confirm('Close this retrospective and make the PDF report available?')) void act(() => advance(code, 'closed')); }}>Close retrospective →</button></div> : null}</> : null}
    </div><aside className="retro-people retro-panel"><div className="retro-panel-head"><div><span className="retro-kicker">In the room</span><h2>Participants</h2></div><strong>{session.members.filter((member) => member.online).length} online</strong></div>{session.members.map((member) => <div className="retro-person" key={member.id}><span className="retro-avatar">{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}{member.id === session.you ? ' (you)' : ''}</strong><small>{member.host ? 'Facilitator · ' : ''}{member.online ? 'Present' : 'Away'}</small></div>{session.phase === 'collect' ? <span className={member.finished ? 'finished' : ''}>{member.finished ? 'Finished' : 'Writing'}</span> : null}</div>)}{session.phase === 'collect' && session.host ? <div className="retro-facilitator"><p>{session.readyToPresent ? 'Everyone present is finished. You can start presentation.' : Date.parse(session.scheduledAt) > Date.now() ? 'Presentation opens on the scheduled date.' : 'Waiting for currently present people to finish. Absent contributors do not block the meeting.'}</p><button className="retro-primary" type="button" disabled={busy || !session.readyToPresent} onClick={() => void act(() => advance(code, 'present'))}>Start presentation →</button></div> : null}{session.phase !== 'collect' ? <p className="retro-muted retro-small">Changes are shared live with everyone in this session.</p> : null}</aside></div>
  </section>;
}

export default function RetroPage() {
  const [code, setCode] = useState(codeFromHash);
  useEffect(() => { const update = () => setCode(codeFromHash()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  return code ? <Session key={code} code={code} /> : <Lobby />;
}
