import './tools.css';

function CardsIcon() {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><rect x="10" y="13" width="31" height="42" rx="5" transform="rotate(-12 10 13)" stroke="currentColor" strokeWidth="2"/><rect x="22" y="11" width="31" height="42" rx="5" fill="var(--surface)" stroke="currentColor" strokeWidth="2"/><text x="37.5" y="39" textAnchor="middle" fill="currentColor" fontSize="20" fontWeight="700">5</text></svg>;
}
export default function ToolsPage() {
  return <section className="tools-page" aria-labelledby="tools-title"><div className="eyebrow"><span className="eyebrow-dot" /> Workspace / Tools</div><h1 id="tools-title" className="sprint-title">Tools<span className="title-period">.</span></h1><p className="sprint-description">Small team utilities that fit naturally into the same workspace.</p>
    <div className="tools-grid"><a className="tools-card" href="#/tools/poker"><div className="tools-card-icon"><CardsIcon /></div><div><span className="tools-card-kicker">Planning · Live rooms</span><h2>Scrum Poker</h2><p>Pick a sprint ticket, estimate together with hidden votes, and reveal the team's view when everyone is ready.</p></div><span className="tools-card-arrow" aria-hidden="true">↗</span></a><a className="tools-card" href="#/tools/retro"><div className="tools-card-icon tools-retro-icon" aria-hidden="true">↻</div><div><span className="tools-card-kicker">Reflection · Shared outcomes</span><h2>Team Retrospective</h2><p>Collect ideas, group themes, vote on priorities, and keep action items visible across sessions.</p></div><span className="tools-card-arrow" aria-hidden="true">↗</span></a></div>
  </section>;
}
