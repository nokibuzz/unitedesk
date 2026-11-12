import { useState } from 'react';

export type Theme = 'light' | 'dark';

const storageKey = 'unitedesk.theme';

function initialTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      next === 'dark' ? '#101010' : '#f7f7f6',
    );
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // The current page can still switch themes if storage is unavailable.
    }
    setTheme(next);
  };

  return { theme, toggleTheme };
}
