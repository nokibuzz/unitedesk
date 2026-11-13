import { useEffect, useState, type FormEvent } from 'react';
import LinkIcon from '../useful-links/LinkIcon';
import { apiFetch } from '../../app/api';
import { loadUsefulLinks, usefulLinksUpdated, type UsefulLink } from '../useful-links/types';

interface Draft { label: string; url: string; description: string; aliases: string; iconUrl: string }
const empty: Draft = { label: '', url: '', description: '', aliases: '', iconUrl: '' };

export default function UsefulLinksSettings() {
  const demo = import.meta.env.MODE === 'demo';
  const [links, setLinks] = useState<UsefulLink[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let current = true;
    void loadUsefulLinks().then((items) => { if (current) { setLinks(items); setError(''); } }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load useful links'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  async function persist(next: UsefulLink[], message: string) {
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch('/api/useful-links', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links: next }) });
      const body = await response.json() as { links?: UsefulLink[]; error?: string };
      if (!response.ok || !body.links) throw new Error(body.error || 'Could not save useful links');
      setLinks(body.links); setNotice(message); setDraft(empty); setEditing(null);
      window.dispatchEvent(new Event(usefulLinksUpdated));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save useful links'); }
    finally { setSaving(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const aliases = draft.aliases.split(',').map((value) => value.trim()).filter(Boolean);
    const link: UsefulLink = { id: editing || crypto.randomUUID(), label: draft.label.trim(), url: draft.url.trim(), description: draft.description.trim(), aliases, iconUrl: draft.iconUrl.trim() || null };
    void persist(editing ? links.map((item) => item.id === editing ? link : item) : [...links, link], editing ? 'Link updated.' : 'Link added.');
  }
  function edit(link: UsefulLink) {
    setEditing(link.id); setDraft({ label: link.label, url: link.url, description: link.description, aliases: link.aliases.join(', '), iconUrl: link.iconUrl || '' }); setError(''); setNotice('');
    document.getElementById('useful-link-name')?.focus();
  }
  return <div id="useful-links-settings" className="settings-card"><div className="settings-card-heading"><div><h2>Useful links</h2><p>Shared shortcuts to tools, dashboards, logs, deployments, and anything your team opens often.</p></div><span className="settings-scope">Shared</span></div>
    {error ? <div className="sprint-alert" role="alert">{error}</div> : null}
    {notice ? <p className="settings-success" role="status">{notice}</p> : null}
    {loading ? <p className="muted">Loading useful links…</p> : <>
      {links.length ? <div className="settings-links-list">{links.map((link) => <div className="settings-link-row" key={link.id}><LinkIcon link={link} /><div className="settings-link-info"><strong>{link.label}</strong><span>{link.description || new URL(link.url).host}</span><small>{link.aliases.length ? link.aliases.join(' · ') : new URL(link.url).host}</small></div>{!demo ? <div className="settings-link-actions"><button type="button" disabled={saving} onClick={() => edit(link)}>Edit</button><button type="button" disabled={saving} onClick={() => { if (window.confirm(`Remove “${link.label}” from useful links?`)) void persist(links.filter((item) => item.id !== link.id), 'Link removed.'); }}>Remove</button></div> : null}</div>)}</div> : <p className="settings-links-empty">No links added yet. Add a shortcut below.</p>}
      {!demo ? <form className="settings-links-form" onSubmit={submit}><h3>{editing ? 'Edit link' : 'Add a link'}</h3><div className="settings-field-grid">
        <label className="settings-input"><span>Name</span><input id="useful-link-name" required maxLength={100} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Service dashboard" /></label>
        <label className="settings-input"><span>URL</span><input required type="url" maxLength={2048} value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" /></label>
        <label className="settings-input settings-full"><span>Description</span><input maxLength={240} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Where this link takes your team" /></label>
        <label className="settings-input settings-full"><span>Search keywords</span><input value={draft.aliases} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} placeholder="service name, environment, team" /><small>Comma-separated. Add words people might search for, such as a service and environment name.</small></label>
        <label className="settings-input settings-full"><span>Custom icon URL <span className="settings-optional">(optional)</span></span><input type="url" maxLength={2048} value={draft.iconUrl} onChange={(event) => setDraft({ ...draft, iconUrl: event.target.value })} placeholder="https://example.com/icon.png" /><small>By default, UniteDesk loads /favicon.ico from the link's own site. Set a direct image URL if that site uses a different icon path.</small></label>
      </div><div className="settings-links-form-actions"><button className="settings-save" type="submit" disabled={saving || (!editing && links.length >= 100)}>{saving ? 'Saving…' : editing ? 'Save link' : 'Add link'}</button>{editing ? <button type="button" className="settings-cancel" onClick={() => { setEditing(null); setDraft(empty); }}>Cancel</button> : null}</div></form> : null}
    </>}
  </div>;
}
