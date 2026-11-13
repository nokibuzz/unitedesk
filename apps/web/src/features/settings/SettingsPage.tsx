import { useEffect, useState } from 'react';
import type { MainSection } from '../../app/personal';
import type { ThemeMode } from '../../app/useTheme';
import type { Mapping, Role } from '../sprint/types';
import type { TeamSettings } from './types';
import UsefulLinksSettings from './UsefulLinksSettings';
import './settings.css';

type SettingsTab = 'personal' | 'team';
type TeamDraft = Omit<TeamSettings, 'dailyCutoffHour' | 'dailyTicketSeconds' | 'gitlabStaleDays'> & {
  dailyCutoffHour: string; dailyTicketSeconds: string; gitlabStaleDays: string;
};
function toDraft(settings: TeamSettings): TeamDraft {
  return { ...settings, dailyCutoffHour: String(settings.dailyCutoffHour), dailyTicketSeconds: String(settings.dailyTicketSeconds), gitlabStaleDays: String(settings.gitlabStaleDays) };
}
const roleLabels: Record<Role, string> = {
  backlog: 'Backlog', in_progress: 'In development', ready_for_testing: 'Ready for testing',
  in_testing: 'In testing', done: 'Done', blocked: 'Blocked', other: 'Other',
};
async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || 'Could not save settings');
  return body;
}
export default function SettingsPage({ mode, onModeChange, defaultSection, onDefaultSectionChange }: {
  mode: ThemeMode; onModeChange: (mode: ThemeMode) => void;
  defaultSection: MainSection; onDefaultSectionChange: (section: MainSection) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(() => window.location.hash === '#/settings/team' ? 'team' : 'personal');
  const [team, setTeam] = useState<TeamDraft | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [teamError, setTeamError] = useState('');
  const [mappingError, setMappingError] = useState('');
  const [teamNotice, setTeamNotice] = useState('');
  const [mappingNotice, setMappingNotice] = useState('');
  const [savingTeam, setSavingTeam] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  useEffect(() => {
    const onHashChange = () => { if (window.location.hash === '#/settings/team') { setTab('team'); requestAnimationFrame(() => document.getElementById('useful-links-settings')?.scrollIntoView({ block: 'start' })); } };
    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings/team', { signal: controller.signal }).then((response) => responseBody<{ settings: TeamSettings }>(response))
      .then((body) => { setTeam(toDraft(body.settings)); setTeamError(''); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setTeamError(reason instanceof Error ? reason.message : 'Could not load team settings'); })
      .finally(() => { if (!controller.signal.aborted) setTeamLoading(false); });
    fetch('/api/ticketing/status-mapping', { signal: controller.signal }).then((response) => responseBody<Mapping>(response))
      .then((body) => { setMapping(body); setMappingError(''); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setMappingError(reason instanceof Error ? reason.message : 'Could not discover ticket statuses'); })
      .finally(() => { if (!controller.signal.aborted) setMappingLoading(false); });
    return () => controller.abort();
  }, []);
  async function saveTeam() {
    if (!team) return;
    setSavingTeam(true); setTeamError(''); setTeamNotice('');
    try {
      const settings: TeamSettings = { ...team, dailyCutoffHour: Number(team.dailyCutoffHour), dailyTicketSeconds: Number(team.dailyTicketSeconds), gitlabStaleDays: Number(team.gitlabStaleDays) };
      const body = await responseBody<{ settings: TeamSettings }>(await fetch('/api/settings/team', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) }));
      setTeam(toDraft(body.settings)); setTeamNotice('Team settings saved. Sprint and Review Queue will use these values on the next visit or refresh.');
    } catch (reason) { setTeamError(reason instanceof Error ? reason.message : 'Could not save team settings'); }
    finally { setSavingTeam(false); }
  }
  async function saveMapping() {
    if (!mapping) return;
    setSavingMapping(true); setMappingError(''); setMappingNotice('');
    try {
      const body = await responseBody<Mapping>(await fetch('/api/ticketing/status-mapping', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statuses: mapping.statuses.map(({ id, role }) => ({ id, role })) }) }));
      setMapping(body); setMappingNotice('Ticket status mapping confirmed.');
    } catch (reason) { setMappingError(reason instanceof Error ? reason.message : 'Could not confirm ticket status mapping'); }
    finally { setSavingMapping(false); }
  }
  function updateTeam<K extends keyof TeamDraft>(key: K, value: TeamDraft[K]) {
    setTeam((current) => current ? { ...current, [key]: value } : null);
    setTeamNotice('');
  }
  return <section className="settings-page" aria-labelledby="settings-heading">
    <div className="eyebrow"><span className="eyebrow-dot" /> Workspace / Preferences</div>
    <h1 id="settings-heading" className="sprint-title">Settings<span className="title-period">.</span></h1>
    <p className="sprint-description">Personal choices for this browser, and shared rules for this workspace.</p>
    <div className="settings-tabs" role="tablist" aria-label="Settings sections">
      <button type="button" role="tab" id="settings-personal-tab" aria-controls="settings-panel" aria-selected={tab === 'personal'} className={tab === 'personal' ? 'active' : ''} onClick={() => setTab('personal')}>Personal</button>
      <button type="button" role="tab" id="settings-team-tab" aria-controls="settings-panel" aria-selected={tab === 'team'} className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>Team</button>
    </div>
    <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-${tab}-tab`}>
      {tab === 'personal' ? <div className="settings-stack">
        <div className="settings-card"><div className="settings-card-heading"><div><h2>Appearance</h2><p>Choose how UniteDesk looks in this browser.</p></div><span className="settings-scope">This browser</span></div>
          <div className="settings-field"><span className="settings-label">Theme</span><div className="settings-choice-group" role="group" aria-label="Theme">{(['system', 'light', 'dark'] as const).map((option) => <button type="button" key={option} aria-pressed={mode === option} className={mode === option ? 'selected' : ''} onClick={() => onModeChange(option)}>{option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}</button>)}</div></div>
        </div>
        <div className="settings-card"><div className="settings-card-heading"><div><h2>Start page</h2><p>Choose where the UniteDesk logo opens.</p></div><span className="settings-scope">This browser</span></div>
          <div className="settings-field"><span className="settings-label">Default section</span><div className="settings-choice-group" role="group" aria-label="Default section"><button type="button" aria-pressed={defaultSection === 'sprint'} className={defaultSection === 'sprint' ? 'selected' : ''} onClick={() => onDefaultSectionChange('sprint')}>Sprint</button><button type="button" aria-pressed={defaultSection === 'reviews'} className={defaultSection === 'reviews' ? 'selected' : ''} onClick={() => onDefaultSectionChange('reviews')}>Review Queue</button><button type="button" aria-pressed={defaultSection === 'documents'} className={defaultSection === 'documents' ? 'selected' : ''} onClick={() => onDefaultSectionChange('documents')}>Knowledge</button></div></div>
        </div>
      </div> : <div className="settings-stack">
        <div className="settings-card"><div className="settings-card-heading"><div><h2>Team workflow</h2><p>These values apply to everyone using this local workspace.</p></div><span className="settings-scope">Shared</span></div>
          {teamError ? <div className="sprint-alert" role="alert">{teamError}</div> : null}
          {teamNotice ? <p className="settings-success" role="status">{teamNotice}</p> : null}
          {teamLoading ? <p className="muted">Loading team settings…</p> : team ? <form onSubmit={(event) => { event.preventDefault(); void saveTeam(); }}>
            <div className="settings-field-grid"><label className="settings-input"><span>Daily time zone</span><input required value={team.dailyTimeZone} onChange={(event) => updateTeam('dailyTimeZone', event.target.value)} placeholder="Europe/Belgrade" /><small>IANA time zone used for the daily recap.</small></label>
              <label className="settings-input"><span>Previous daily hour</span><input required type="number" min="0" max="23" step="1" value={team.dailyCutoffHour} onChange={(event) => updateTeam('dailyCutoffHour', event.target.value)} /><small>Hour from 0 to 23 in the selected time zone.</small></label>
              <label className="settings-input"><span>Seconds per ticket</span><input required type="number" min="15" max="900" step="1" value={team.dailyTicketSeconds} onChange={(event) => updateTeam('dailyTicketSeconds', event.target.value)} /><small>Daily presentation timer.</small></label>
              <label className="settings-input"><span>MR aging threshold</span><input required type="number" min="0.5" max="365" step="0.5" value={team.gitlabStaleDays} onChange={(event) => updateTeam('gitlabStaleDays', event.target.value)} /><small>Calendar days before an open MR is marked aging.</small></label>
              <label className="settings-input settings-full"><span>Testing task name</span><input required maxLength={100} value={team.jiraTestTaskName} onChange={(event) => updateTeam('jiraTestTaskName', event.target.value)} /><small>Used to identify a ticket's testing subtask.</small></label>
            </div><button className="settings-save" type="submit" disabled={savingTeam}>{savingTeam ? 'Saving…' : 'Save team workflow'}</button>
          </form> : null}
        </div>
        <div className="settings-card"><div className="settings-card-heading"><div><h2>Ticket status mapping</h2><p>Review the roles discovered from the connected ticketing tool.</p></div><span className="settings-scope">Shared</span></div>
          {mappingError ? <div className="sprint-alert" role="alert">{mappingError}</div> : null}
          {mappingNotice ? <p className="settings-success" role="status">{mappingNotice}</p> : null}
          {mappingLoading ? <p className="muted">Discovering ticket statuses…</p> : mapping ? <><div className="settings-mapping-meta"><span className="source-badge">{mapping.confirmed ? 'Confirmed' : 'Review needed'}</span><span>New statuses require another confirmation.</span></div>
            <div className="settings-mapping-list">{mapping.statuses.map((status) => <label key={status.id}><span><strong>{status.name}</strong><small>{status.category}</small></span><select value={status.role} onChange={(event) => { setMapping((current) => current ? { ...current, confirmed: false, statuses: current.statuses.map((item) => item.id === status.id ? { ...item, role: event.target.value as Role } : item) } : null); setMappingNotice(''); }}>{Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>)}</div>
            <button className="settings-save" type="button" onClick={saveMapping} disabled={savingMapping || !mapping.statuses.length}>{savingMapping ? 'Saving…' : 'Confirm status mapping'}</button>
          </> : null}
        </div>
        <UsefulLinksSettings />
        <div className="settings-card"><div className="settings-card-heading"><div><h2>Connections</h2><p>Provider addresses and access tokens are set in the server's private <code>.env</code> file. Restart the server after changing them.</p></div><span className="settings-scope">Server</span></div></div>
      </div>}
    </div>
  </section>;
}
