import { useEffect, useMemo, useRef, useState } from 'react';
import LinkIcon from './LinkIcon';
import { searchUsefulLinks } from './search';
import { loadUsefulLinks, usefulLinksUpdated, type UsefulLink } from './types';
import './useful-links.css';

export default function UsefulLinksLauncher() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [links, setLinks] = useState<UsefulLink[]>([]);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const openedOnce = useRef(false);
  const results = useMemo(() => searchUsefulLinks(links, query), [links, query]);

  useEffect(() => {
    let current = true;
    const refresh = () => { void loadUsefulLinks().then((items) => { if (current) { setLinks(items); setError(''); } }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load links'); }); };
    refresh();
    window.addEventListener(usefulLinksUpdated, refresh);
    return () => { current = false; window.removeEventListener(usefulLinksUpdated, refresh); };
  }, []);
  useEffect(() => { if (open) { openedOnce.current = true; setQuery(''); setActive(0); void loadUsefulLinks().then((items) => { setLinks(items); setError(''); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load links')); requestAnimationFrame(() => inputRef.current?.focus()); } else if (openedOnce.current) buttonRef.current?.focus(); }, [open]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen((current) => !current); }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <>
    <button ref={buttonRef} className="useful-links-trigger" type="button" title="Useful links (⌘/Ctrl+K)" aria-label="Search useful links" aria-haspopup="dialog" onClick={() => setOpen(true)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13.5a5 5 0 0 0 7.1 0l2.3-2.3a5 5 0 0 0-7.1-7.1l-1.4 1.4M14 10.5a5 5 0 0 0-7.1 0l-2.3 2.3a5 5 0 0 0 7.1 7.1l1.4-1.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button>
    {open ? <div className="useful-links-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section ref={dialogRef} className="useful-links-dialog" role="dialog" aria-modal="true" aria-label="Useful links" onKeyDown={(event) => { if (event.key !== 'Tab') return; const items = dialogRef.current?.querySelectorAll<HTMLElement>('input, button, a'); if (!items?.length) return; const first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }}><div className="useful-links-search-row"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7"/><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && results[active]) { event.preventDefault(); window.open(results[active].url, '_blank', 'noopener,noreferrer'); setOpen(false); }
    }} placeholder="Search links, tools, services, environments…" aria-label="Search useful links" role="combobox" aria-expanded="true" aria-controls="useful-links-results" aria-activedescendant={results[active] ? `useful-link-result-${results[active].id}` : undefined} autoComplete="off" /><button type="button" className="useful-links-close" onClick={() => setOpen(false)} aria-label="Close useful links">Esc</button></div>
      <div id="useful-links-results" className="useful-links-results" role="listbox" aria-label="Matching links">{error ? <p className="useful-links-empty" role="alert">{error}</p> : results.length ? results.map((link, index) => <a key={link.id} id={`useful-link-result-${link.id}`} role="option" aria-selected={index === active} className={`useful-links-result ${index === active ? 'is-active' : ''}`} href={link.url} target="_blank" rel="noopener noreferrer" onMouseEnter={() => setActive(index)} onClick={() => setOpen(false)}><LinkIcon link={link} /><span className="useful-links-result-text"><strong>{link.label}</strong><small>{link.description || new URL(link.url).host}</small></span><span className="useful-links-result-domain">{new URL(link.url).host}</span><span aria-hidden="true">↗</span></a>) : <p className="useful-links-empty">{query ? 'No matching links.' : 'No useful links yet. Add them in Settings → Team.'}</p>}</div>
      <div className="useful-links-footer"><span>{links.length} links · Search by name, keyword or URL</span><a href="#/settings/team" onClick={() => setOpen(false)}>Manage in Settings ↗</a></div>
    </section></div> : null}
  </>;
}
