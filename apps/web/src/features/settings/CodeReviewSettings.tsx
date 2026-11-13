import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../../app/api';

type Provider = 'mock' | 'gitlab' | 'github';
interface Connection {
  provider: Provider;
  gitlab: { url: string; group: string; hasToken: boolean };
  github: { apiUrl: string; owner: string; repos: string; hasToken: boolean };
}

export default function CodeReviewSettings() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [gitlabToken, setGitlabToken] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const demo = import.meta.env.MODE === 'demo';
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    void apiFetch('/api/settings/code-review', { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as { connection?: Connection; error?: string };
      if (!response.ok || !body.connection) throw new Error(body.error || 'Could not load code review settings');
      return body.connection;
    }).then((value) => { setConnection(value); setError(''); }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load code review settings'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [demo]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connection) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await apiFetch('/api/settings/code-review', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: { provider: connection.provider, gitlab: { ...connection.gitlab, token: gitlabToken }, github: { ...connection.github, token: githubToken } } }) });
      const body = await response.json() as { connection?: Connection; error?: string };
      if (!response.ok || !body.connection) throw new Error(body.error || 'Could not save code review settings');
      setConnection(body.connection); setGitlabToken(''); setGithubToken(''); setNotice('Code review connection saved. Review Queue will use it on your next visit.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save code review settings'); }
    finally { setSaving(false); }
  }
  return <div className="settings-card"><div className="settings-card-heading"><div><h2>Code review source</h2><p>Choose which service powers Review Queue. Tokens stay on this server and are never returned to the browser after saving.</p></div><span className="settings-scope">Server</span></div>
    {demo ? <p className="settings-links-empty">The public demo uses sample reviews. Connect GitLab or GitHub after running UniteDesk on your own server.</p> : <>
      {error ? <div className="sprint-alert" role="alert">{error}</div> : null}{notice ? <p className="settings-success" role="status">{notice}</p> : null}
      {loading ? <p className="muted">Loading code review settings…</p> : connection ? <form onSubmit={save}>
        <div className="settings-field"><span className="settings-label">Provider</span><div className="settings-choice-group" role="group" aria-label="Code review provider">{(['gitlab', 'github', 'mock'] as const).map((provider) => <button key={provider} type="button" aria-pressed={connection.provider === provider} className={connection.provider === provider ? 'selected' : ''} onClick={() => { setConnection({ ...connection, provider }); setNotice(''); }}>{provider === 'gitlab' ? 'GitLab' : provider === 'github' ? 'GitHub' : 'Mock data'}</button>)}</div></div>
        {connection.provider === 'gitlab' ? <div className="settings-field-grid settings-connection-fields"><label className="settings-input"><span>GitLab base URL</span><input required type="url" value={connection.gitlab.url} onChange={(event) => setConnection({ ...connection, gitlab: { ...connection.gitlab, url: event.target.value } })} placeholder="https://gitlab.com" /></label><label className="settings-input"><span>Group path</span><input required value={connection.gitlab.group} onChange={(event) => setConnection({ ...connection, gitlab: { ...connection.gitlab, group: event.target.value } })} placeholder="your-team/subgroup" /></label><label className="settings-input settings-full"><span>Access token</span><input type="password" autoComplete="new-password" value={gitlabToken} onChange={(event) => setGitlabToken(event.target.value)} placeholder={connection.gitlab.hasToken ? 'Token configured — leave blank to keep it' : 'Enter a GitLab token'} required={!connection.gitlab.hasToken} /><small>{connection.gitlab.hasToken ? 'A token is configured. Enter a new one only to replace it.' : 'Stored in a local, Git-ignored file. Never put it in a link URL.'}</small></label></div> : null}
        {connection.provider === 'github' ? <div className="settings-field-grid settings-connection-fields"><label className="settings-input"><span>GitHub API URL</span><input required type="url" value={connection.github.apiUrl} onChange={(event) => setConnection({ ...connection, github: { ...connection.github, apiUrl: event.target.value } })} placeholder="https://api.github.com" /></label><label className="settings-input"><span>Owner</span><input value={connection.github.owner} onChange={(event) => setConnection({ ...connection, github: { ...connection.github, owner: event.target.value } })} placeholder="Leave blank for your account" /></label><label className="settings-input settings-full"><span>Repositories <span className="settings-optional">(optional)</span></span><input value={connection.github.repos} onChange={(event) => setConnection({ ...connection, github: { ...connection.github, repos: event.target.value } })} placeholder="org/repo-one,org/repo-two" /><small>Comma-separated. Leave blank to scan accessible repositories for the owner.</small></label><label className="settings-input settings-full"><span>Access token</span><input type="password" autoComplete="new-password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder={connection.github.hasToken ? 'Token configured — leave blank to keep it' : 'Enter a GitHub token'} required={!connection.github.hasToken} /><small>{connection.github.hasToken ? 'A token is configured. Enter a new one only to replace it.' : 'Stored in a local, Git-ignored file. Never put it in a link URL.'}</small></label></div> : null}
        {connection.provider === 'mock' ? <p className="settings-connection-note">Use local sample reviews from <code>mock/gitlab/merge-requests.json</code>.</p> : null}
        <button className="settings-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save code review source'}</button>
      </form> : null}
    </>}
  </div>;
}
