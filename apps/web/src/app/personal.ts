export type MainSection = 'sprint' | 'reviews';
const key = 'unitedesk.defaultSection';
export function getDefaultSection(): MainSection {
  try { return localStorage.getItem(key) === 'reviews' ? 'reviews' : 'sprint'; }
  catch { return 'sprint'; }
}
export function saveDefaultSection(section: MainSection): void {
  try { localStorage.setItem(key, section); } catch { /* The current browser session still uses the selection. */ }
}
