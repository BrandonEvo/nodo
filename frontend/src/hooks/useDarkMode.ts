import { useState, useEffect } from 'react';

const STORAGE_KEY = 'nodo-dark-mode';

type DarkPreference = 'dark' | 'light' | 'system';

function applyDark(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function resolvePreference(pref: DarkPreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useDarkMode() {
  const [preference, setPreference] = useState<DarkPreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as DarkPreference | null;
    return stored ?? 'system';
  });

  const isDark = resolvePreference(preference);

  // Apply class on mount and whenever preference changes
  useEffect(() => {
    applyDark(resolvePreference(preference));
  }, [preference]);

  // Track system changes when pref is 'system'
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => applyDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  const toggle = () => {
    setPreference(prev => {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      let next: DarkPreference;
      if (prev === 'system') {
        // Override away from system
        next = systemIsDark ? 'light' : 'dark';
      } else {
        // Manual override: toggle, and if result matches system → go back to 'system'
        const wouldBeDark = prev === 'light';
        next = wouldBeDark === systemIsDark ? 'system' : wouldBeDark ? 'dark' : 'light';
      }
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  return { isDark, preference, toggle };
}
