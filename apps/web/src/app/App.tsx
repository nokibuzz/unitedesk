import { useEffect, useState } from 'react';
import { useTheme } from './useTheme';
import { getDefaultSection, saveDefaultSection, type MainSection } from './personal';
import SprintPage from '../features/sprint/SprintPage';
import ReviewQueuePage from '../features/reviews/ReviewQueuePage';
import DocumentsPage from '../features/documents/DocumentsPage';
import SettingsPage from '../features/settings/SettingsPage';
import UsefulLinksLauncher from '../features/useful-links/UsefulLinksLauncher';

type Section = MainSection | 'settings';
function sectionFromHash(fallback: MainSection): Section {
  if (window.location.hash === '#/sprint') return 'sprint';
  if (window.location.hash === '#/reviews') return 'reviews';
  if (window.location.hash === '#/documents') return 'documents';
  if (window.location.hash === '#/settings' || window.location.hash === '#/settings/team') return 'settings';
  return fallback;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 2.8h4l.7 2.1c.5.2 1 .4 1.5.7l2-.9 2.8 2.8-.9 2c.3.5.5 1 .7 1.5l2.1.7v4l-2.1.7c-.2.5-.4 1-.7 1.5l.9 2-2.8 2.8-2-.9c-.5.3-1 .5-1.5.7L14 23h-4l-.7-2.1c-.5-.2-1-.4-1.5-.7l-2 .9L3 18.3l.9-2c-.3-.5-.5-1-.7-1.5L1 14.1v-4l2.2-.7c.2-.5.4-1 .7-1.5l-.9-2 2.8-2.8 2 .9c.5-.3 1-.5 1.5-.7L10 2.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" transform="translate(1 0) scale(.92)"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
export default function App() {
  const { mode, setMode } = useTheme();
  const [defaultSection, setDefaultSectionState] = useState<MainSection>(getDefaultSection);
  const [section, setSection] = useState<Section>(() => sectionFromHash(getDefaultSection()));
  useEffect(() => {
    const onHashChange = () => setSection(sectionFromHash(getDefaultSection()));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  function setDefaultSection(next: MainSection) { saveDefaultSection(next); setDefaultSectionState(next); }
  return <div className="app-shell">
    <header className="site-header"><div className="header-content">
      <a className="brand" href={`#/${defaultSection}`} aria-label="UniteDesk home"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>UniteDesk</span></a>
      <nav className="site-nav" aria-label="Main navigation"><a href="#/sprint" aria-current={section === 'sprint' ? 'page' : undefined}>Sprint</a><a href="#/reviews" aria-current={section === 'reviews' ? 'page' : undefined}>Review Queue</a><a href="#/documents" aria-current={section === 'documents' ? 'page' : undefined}>Knowledge</a></nav>
      <UsefulLinksLauncher />
      <a className="settings-link" href="#/settings" aria-label="Settings" aria-current={section === 'settings' ? 'page' : undefined} title="Settings"><SettingsIcon /></a>
    </div></header>
    <main className={`main-content ${section === 'documents' ? 'documents-main' : 'sprint-main'}`}>
      {section === 'sprint' ? <SprintPage /> : section === 'reviews' ? <ReviewQueuePage /> : section === 'documents' ? <DocumentsPage /> : <SettingsPage mode={mode} onModeChange={setMode} defaultSection={defaultSection} onDefaultSectionChange={setDefaultSection} />}
    </main>
    <footer className="site-footer"><span>UniteDesk</span><span>Built for teams, together.</span></footer>
  </div>;
}
