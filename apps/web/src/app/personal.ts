export type MainSection = 'sprint' | 'reviews' | 'documents' | 'tools';
const key = 'unitedesk.defaultSection';
export function getDefaultSection(): MainSection {
  try {
    const saved = localStorage.getItem(key);
    return saved === 'reviews' || saved === 'documents' || saved === 'tools' ? saved : 'sprint';
  }
  catch { return 'sprint'; }
}
export function saveDefaultSection(section: MainSection): void {
  try { localStorage.setItem(key, section); } catch { /* The current browser session still uses the selection. */ }
}
