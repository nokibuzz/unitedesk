import { useEffect, useState } from 'react';
import './sprint.css';

interface Ticket {
  key: string; type: string; summary: string; status: string; statusCategory: string;
  assignee: string | null; tester: string | null;
  testing: 'none' | 'ready' | 'in_testing' | 'finished';
  testingTask: { key: string; status: string; url: string } | null;
  subtasks: Array<{ key: string; summary: string; status: string; url: string }>;
  storyPoints: number | null; originalEstimateSeconds: number | null;
  timeSpentSeconds: number; updatedAt: string | null; url: string;
}
interface Snapshot {
  source: 'mock' | 'jira'; fetchedAt: string;
  sprint: { id: number; name: string; goal: string | null; url: string } | null;
  tickets: Ticket[];
}
type Filter = 'all' | 'progress' | 'testing';
const testingLabel: Record<Ticket['testing'], string> = {
  none: 'Not in testing', ready: 'Ready for testing',
  in_testing: 'In testing', finished: 'Testing finished',
};
function hours(seconds: number | null): string {
  return seconds == null ? '—' : `${Math.round(seconds / 360) / 10}h`;
}
function date(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function SourceKey({ value, url, mock }: { value: string; url: string; mock: boolean }) {
  return mock ? <span className="ticket-key">{value}</span> : (
    <a className="ticket-key" href={url} target="_blank" rel="noreferrer">{value} <span aria-hidden="true">↗</span></a>
  );
}

export default function SprintPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/sprint/active', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Snapshot & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Could not load the active sprint');
        return body;
      })
      .then((body) => { setSnapshot(body); setError(''); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Could not load the active sprint');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  const tickets = snapshot?.tickets ?? [];
  const progress = tickets.filter((item) => item.statusCategory === 'indeterminate' && item.testing === 'none');
  const testing = tickets.filter((item) => item.testing === 'ready' || item.testing === 'in_testing');
  const visible = filter === 'progress' ? progress : filter === 'testing' ? testing : tickets;
  const mock = snapshot?.source === 'mock';

  return (
    <section aria-labelledby="sprint-heading">
      <div className="sprint-heading-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> Ticketing / Jira</div>
          <h1 id="sprint-heading" className="sprint-title">Active sprint<span className="title-period">.</span></h1>
          <p className="sprint-description">A clear view of the work your team is moving through the sprint.</p>
        </div>
        <button className="refresh-button" type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {error ? <div className="sprint-alert" role="alert">{error}</div> : null}
      {snapshot ? <>
        <div className="sprint-context">
          <div><span className="context-label">Current sprint</span><strong>{snapshot.sprint?.name ?? 'No active sprint'}</strong>{snapshot.sprint?.goal ? <span className="sprint-goal">{snapshot.sprint.goal}</span> : null}</div>
          <div className="context-meta"><span className="source-badge">{mock ? 'Mock data' : 'Live Jira'}</span><span>Updated {new Date(snapshot.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>{!mock && snapshot.sprint ? <a href={snapshot.sprint.url} target="_blank" rel="noreferrer">Open board ↗</a> : null}</div>
        </div>
        <div className="sprint-stats" aria-label="Sprint ticket counts">
          {([['all', 'All tickets', tickets.length], ['progress', 'In progress', progress.length], ['testing', 'Testing queue', testing.length]] as const).map(([id, label, count]) => (
            <button key={id} type="button" className={filter === id ? 'stat-card active' : 'stat-card'} onClick={() => setFilter(id)} aria-pressed={filter === id}><span>{label}</span><strong>{count}</strong></button>
          ))}
        </div>
        <div className="table-heading"><h2>{filter === 'all' ? 'Sprint tickets' : filter === 'progress' ? 'In progress' : 'Testing queue'}</h2><span>{visible.length} tickets</span></div>
        <div className="ticket-table-scroll">
          <table className="ticket-table">
            <thead><tr><th>Key</th><th>Type</th><th>Ticket</th><th>Status</th><th>Assignee</th><th>Testing</th><th>Testing task</th><th>Tester</th><th>Estimate</th><th>Logged</th><th>Points</th><th>Updated</th></tr></thead>
            <tbody>{visible.map((item) => <tr key={item.key}>
              <td><SourceKey value={item.key} url={item.url} mock={mock} /></td><td>{item.type}</td>
              <td className="summary-cell"><strong>{item.summary}</strong>{item.subtasks.length ? <small>{item.subtasks.length} subtask{item.subtasks.length === 1 ? '' : 's'}</small> : null}</td>
              <td><span className="status-pill">{item.status}</span></td><td>{item.assignee || <span className="muted">Unassigned</span>}</td>
              <td>{testingLabel[item.testing]}</td><td>{item.testingTask ? <SourceKey value={item.testingTask.key} url={item.testingTask.url} mock={mock} /> : '—'}</td>
              <td>{item.tester || '—'}</td><td>{hours(item.originalEstimateSeconds)}</td><td>{hours(item.timeSpentSeconds)}</td><td>{item.storyPoints ?? '—'}</td><td>{date(item.updatedAt)}</td>
            </tr>)}</tbody>
          </table>
          {!visible.length ? <div className="empty-state">No tickets in this view.</div> : null}
        </div>
      </> : !loading && !error ? <div className="empty-state">No active sprint data yet.</div> : null}
    </section>
  );
}
