import { useEffect, useState } from 'react';
import { useTheme } from './useTheme';
import SprintPage from '../features/sprint/SprintPage';
import ReviewQueuePage from '../features/reviews/ReviewQueuePage';

function ThemeIcon({ theme }: { theme: 'light' | 'dark' }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20.2 15.6A8.5 8.5 0 0 1 8.4 3.8 8.5 8.5 0 1 0 20.2 15.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [section, setSection] = useState<'sprint' | 'reviews'>(() => window.location.hash === '#/reviews' ? 'reviews' : 'sprint');
  useEffect(() => {
    const onHashChange = () => setSection(window.location.hash === '#/reviews' ? 'reviews' : 'sprint');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-content">
          <a className="brand" href="#/sprint" aria-label="UniteDesk home">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span>UniteDesk</span>
          </a>
          <nav className="site-nav" aria-label="Main navigation"><a href="#/sprint" aria-current={section === 'sprint' ? 'page' : undefined}>Sprint</a><a href="#/reviews" aria-current={section === 'reviews' ? 'page' : undefined}>Review Queue</a></nav>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </header>

      <main className="main-content sprint-main">
        {section === 'sprint' ? <SprintPage /> : <ReviewQueuePage />}
      </main>

      <footer className="site-footer"><span>UniteDesk</span><span>Built for teams, together.</span></footer>
    </div>
  );
}
