import { useTheme } from './useTheme';

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

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-content">
          <a className="brand" href="/" aria-label="UniteDesk home">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span>UniteDesk</span>
          </a>
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

      <main className="main-content">
        <div className="eyebrow"><span className="eyebrow-dot" /> The foundation is ready</div>
        <h1>One place for your<br /><em>team's work.</em></h1>
        <p className="intro">UniteDesk will bring tickets, code, documentation and team tools into a clear shared view.</p>

        <section className="foundation-card" aria-labelledby="foundation-title">
          <div className="card-symbol" aria-hidden="true">
            <span className="symbol-line symbol-line-one" />
            <span className="symbol-line symbol-line-two" />
            <span className="symbol-line symbol-line-three" />
          </div>
          <div>
            <p className="card-kicker">Workspace</p>
            <h2 id="foundation-title">A clean starting point</h2>
            <p>The app structure and themes are in place. Integrations will appear here as they are built.</p>
          </div>
          <span className="card-index" aria-hidden="true">01 / 01</span>
        </section>
      </main>

      <footer className="site-footer"><span>UniteDesk</span><span>Built for teams, together.</span></footer>
    </div>
  );
}
