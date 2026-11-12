import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'system';
const storageKey = 'unitedesk.theme';
function initialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch { return 'system'; }
}
function resolvedTheme(mode: ThemeMode): Theme {
  return mode === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : mode;
}
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101010' : '#f7f7f6');
}
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { const next = resolvedTheme(mode); applyTheme(next); setTheme(next); };
    update();
    if (mode === 'system') media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [mode]);
  function setMode(next: ThemeMode) {
    try { localStorage.setItem(storageKey, next); } catch { /* The current page can still switch themes. */ }
    setModeState(next);
  }
  return { mode, theme, setMode };
}
