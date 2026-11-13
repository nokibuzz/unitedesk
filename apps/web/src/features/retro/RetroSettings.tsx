import { useEffect, useState, type FormEvent } from 'react';
import { getSettings, saveSettings } from './api';
import type { RetroSettings as Settings } from './types';
import './retro.css';

export default function RetroSettings() {
  const demo = import.meta.env.MODE === 'demo';
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void getSettings().then((value) => { if (active) setSettings(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load retrospective settings'); }); return () => { active = false; }; }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!settings) return; setBusy(true); setError(''); setNotice('');
    try { const saved = await saveSettings(settings); setSettings(saved); setNotice(demo ? 'Demo settings saved in this browser until refresh.' : 'Retrospective defaults saved. New sessions will use these columns and vote count.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save retrospective settings'); }
    finally { setBusy(false); }
  }
  return <div className="settings-stack"><div className="settings-card"><div className="settings-card-heading"><div><h2>Retrospective defaults</h2><p>Choose the columns and voting budget used when a facilitator creates a new retrospective. Existing sessions keep their own setup.</p></div><span className="settings-scope">{demo ? 'This browser' : 'Shared'}</span></div>
    {error ? <p className="sprint-alert" role="alert">{error}</p> : null}{notice ? <p className="settings-success" role="status">{notice}</p> : null}
    {!settings ? <p className="muted">Loading retrospective settings…</p> : <form onSubmit={save}><div className="retro-settings-list">{settings.columns.map((column, index) => <div className="retro-settings-column" key={column.id}><span className="retro-settings-number">{String(index + 1).padStart(2, '0')}</span><label className="settings-input"><span>Column name</span><input required maxLength={40} value={column.name} onChange={(event) => setSettings((current) => current ? { ...current, columns: current.columns.map((item) => item.id === column.id ? { ...item, name: event.target.value } : item) } : null)} /></label><label className="settings-input retro-color-field"><span>Color</span><input type="color" value={column.color} onChange={(event) => setSettings((current) => current ? { ...current, columns: current.columns.map((item) => item.id === column.id ? { ...item, color: event.target.value } : item) } : null)} /></label><button type="button" className="retro-icon-button" disabled={settings.columns.length <= 2} onClick={() => setSettings((current) => current ? { ...current, columns: current.columns.filter((item) => item.id !== column.id) } : null)} aria-label={`Remove ${column.name}`}>×</button></div>)}</div>
      <button type="button" className="retro-secondary" disabled={settings.columns.length >= 6} onClick={() => setSettings((current) => current ? { ...current, columns: [...current.columns, { id: `column-${crypto.randomUUID().slice(0, 8)}`, name: '', color: '#8595b2' }] } : null)}>+ Add column</button>
      <label className="settings-input retro-votes-setting"><span>Votes per person</span><input type="number" min="1" max="20" step="1" required value={settings.votesPerPerson} onChange={(event) => setSettings((current) => current ? { ...current, votesPerPerson: Number(event.target.value) } : null)} /><small>Default: 5. Participants can distribute votes across topics.</small></label>
      <button className="settings-save" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save retrospective defaults'}</button>
    </form>}
  </div><div className="settings-card"><div className="settings-card-heading"><div><h2>How sessions use these settings</h2><p>A new retrospective takes a snapshot of the columns and vote count. Facilitators can schedule a date, invite teammates, guide presentation, then download a PDF report after closing the session.</p></div></div><a href="#/tools/retro" className="retro-settings-link">Open retrospectives ↗</a></div></div>;
}
