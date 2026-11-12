import { useEffect, useState } from 'react';
import DailyMode from './DailyMode';
import type { Snapshot, Ticket } from './types';
import './sprint.css';

type Tab = 'overview' | 'development' | 'testing';
const testingLabel: Record<Ticket['testing'], string> = {
  none: 'No test task', ready: 'Waiting for test', in_testing: 'In testing', finished: 'Test finished',
};
function hours(seconds: number | null): string { return seconds == null ? '—' : `${Math.round(seconds / 360) / 10}h`; }
function duration(ms: number | null): string {
  if (ms == null) return '—';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
function SourceKey({ value, url, mock }: { value: string; url: string; mock: boolean }) {
  return mock ? <span className="ticket-key">{value}</span> : <a className="ticket-key" href={url} target="_blank" rel="noreferrer">{value} <span aria-hidden="true">↗</span></a>;
}
function TicketSummary({ item }: { item: Ticket }) {
  return <td className="summary-cell"><strong>{item.summary}</strong>{item.subtasks.length ? <small>{item.subtasks.length} subtask{item.subtasks.length === 1 ? '' : 's'}</small> : null}</td>;
}

export default function SprintPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [dailyOpen, setDailyOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/sprint/active', { signal: controller.signal }).then(async (response) => {
      const sprint = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(sprint.error || 'Could not load the active sprint');
      return sprint;
    }).then((sprint) => { setSnapshot(sprint); setError(''); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load the sprint'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  const tickets = snapshot?.tickets ?? [];
  const development = tickets.filter((item) => item.statusRole === 'in_progress' || item.statusRole === 'blocked');
  const testing = tickets.filter((item) => item.testing === 'ready' || item.testing === 'in_testing' || item.statusRole === 'ready_for_testing' || item.statusRole === 'in_testing');
  const visible = tab === 'development' ? development : tab === 'testing' ? testing : tickets;
  const mock = snapshot?.source === 'mock';
  const tabs: Array<{ id: Tab; name: string; count: number }> = [
    { id: 'overview', name: 'Overview', count: tickets.length },
    { id: 'development', name: 'Development', count: development.length },
    { id: 'testing', name: 'Testing', count: testing.length },
  ];
  return <section aria-labelledby="sprint-heading">
    <div className="sprint-heading-row"><div>
      <div className="eyebrow"><span className="eyebrow-dot" /> Ticketing / Jira</div>
      <h1 id="sprint-heading" className="sprint-title">Active sprint<span className="title-period">.</span></h1>
      <p className="sprint-description">A clear view of the work your team is moving through the sprint.</p>
    </div><div className="sprint-actions"><button className="refresh-button" type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button><button className="refresh-button daily-launch" type="button" onClick={() => setDailyOpen(true)} disabled={!snapshot?.sprint || loading}>Start daily ↗</button></div></div>
    {error ? <div className="sprint-alert" role="alert">{error}</div> : null}
    {snapshot ? <>
      <div className="sprint-context"><div><span className="context-label">Current sprint</span><strong>{snapshot.sprint?.name ?? 'No active sprint'}</strong>{snapshot.sprint?.goal ? <span className="sprint-goal">{snapshot.sprint.goal}</span> : null}</div>
        <div className="context-meta"><span className="source-badge">{mock ? 'Mock data' : 'Live Jira'}</span><span>Updated {new Date(snapshot.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>{!mock && snapshot.sprint ? <a href={snapshot.sprint.url} target="_blank" rel="noreferrer">Open board ↗</a> : null}</div></div>
      {!snapshot.statusMappingConfirmed ? <div className="sprint-alert" role="status">Jira status roles are suggestions. <a href="#/settings">Review mapping in Settings ↗</a></div> : null}
      <div className="sprint-stats" aria-label="Sprint ticket counts">{tabs.map((item) => <div className="stat-card" key={item.id}><span>{item.name}</span><strong>{item.count}</strong></div>)}</div>
      <div className="sprint-tabs" role="tablist" aria-label="Active sprint views">{tabs.map((item) => <button key={item.id} id={`tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="sprint-tabpanel" className={tab === item.id ? 'sprint-tab active' : 'sprint-tab'} onClick={() => setTab(item.id)}>{item.name} <span>{item.count}</span></button>)}</div>
      <div id="sprint-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <div className="table-heading"><h2>{tabs.find((item) => item.id === tab)?.name} tickets</h2><span>{visible.length} tickets</span></div>
        <p className="age-note">Durations are elapsed calendar time from Jira status history; “—” means the start time could not be verified.</p>
        <div className="ticket-table-scroll"><table className="ticket-table"><thead><tr>
          {tab === 'overview' ? <><th>Key</th><th>Type</th><th>Ticket</th><th>Status</th><th>Assignee</th><th>Testing</th><th>Tester</th><th>Estimate</th><th>Logged</th><th>Points</th></> : null}
          {tab === 'development' ? <><th>Key</th><th>Ticket</th><th>Estimate</th><th>Status</th><th>Time in status</th><th>Subtasks</th><th>Assignee</th><th>Testing</th></> : null}
          {tab === 'testing' ? <><th>Key</th><th>Ticket</th><th>Estimate</th><th>Tester</th><th>Testing task</th><th>Testing status</th><th>Waiting for test</th><th>In testing</th><th>Ticket status</th></> : null}
        </tr></thead><tbody>{visible.map((item) => <tr key={item.key}>
          {tab === 'overview' ? <><td><SourceKey value={item.key} url={item.url} mock={mock} /></td><td>{item.type}</td><TicketSummary item={item} /><td><span className="status-pill">{item.status}</span></td><td>{item.assignee || <span className="muted">Unassigned</span>}</td><td>{testingLabel[item.testing]}</td><td>{item.tester || '—'}</td><td>{hours(item.originalEstimateSeconds)}</td><td>{hours(item.timeSpentSeconds)}</td><td>{item.storyPoints ?? '—'}</td></> : null}
          {tab === 'development' ? <><td><SourceKey value={item.key} url={item.url} mock={mock} /></td><TicketSummary item={item} /><td>{hours(item.originalEstimateSeconds)}</td><td><span className="status-pill">{item.status}</span></td><td>{duration(item.statusAgeMs)}</td><td>{item.subtasks.length ? item.subtasks.map((task) => <div key={task.key}><SourceKey value={task.key} url={task.url} mock={mock} /> <span className="muted">{task.status}</span></div>) : '—'}</td><td>{item.assignee || '—'}</td><td>{testingLabel[item.testing]}</td></> : null}
          {tab === 'testing' ? <><td><SourceKey value={item.key} url={item.url} mock={mock} /></td><TicketSummary item={item} /><td>{hours(item.originalEstimateSeconds)}</td><td>{item.tester || '—'}</td><td>{item.testingTask ? <SourceKey value={item.testingTask.key} url={item.testingTask.url} mock={mock} /> : '—'}</td><td>{item.testingTask?.status ?? '—'}</td><td>{duration(item.testingWaitingAgeMs)}</td><td>{duration(item.testingAgeMs)}</td><td><span className="status-pill">{item.status}</span></td></> : null}
        </tr>)}</tbody></table>{!visible.length ? <div className="empty-state">No tickets in this view.</div> : null}</div>
      </div>
    </> : !loading && !error ? <div className="empty-state">No active sprint data yet.</div> : null}
    {snapshot && dailyOpen ? <DailyMode snapshot={snapshot} onClose={() => setDailyOpen(false)} /> : null}
  </section>;
}
