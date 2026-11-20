'use client';
import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
export const THEME_KEY = 'decide-better-theme';

/** Inline script for <head>: applies the saved theme before first paint (no flash). */
export const themeBootScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeSelect() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    // Sync with the value the boot script applied before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t === 'light' || t === 'dark') setTheme(t);
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    try {
      if (t === 'system') {
        delete document.documentElement.dataset.theme;
        localStorage.removeItem(THEME_KEY);
      } else {
        document.documentElement.dataset.theme = t;
        localStorage.setItem(THEME_KEY, t);
      }
    } catch {
      /* storage blocked: theme still applies for this page view */
    }
  };
  return (
    <>
      <label htmlFor="theme" className="sr-only-x">
        Theme
      </label>
      <select id="theme" className="sel w-auto" value={theme} onChange={(e) => apply(e.target.value as Theme)}>
        <option value="system">Theme: system</option>
        <option value="light">Theme: light</option>
        <option value="dark">Theme: dark</option>
      </select>
    </>
  );
}
