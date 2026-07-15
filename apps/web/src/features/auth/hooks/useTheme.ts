'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

interface UseThemeResult {
  /** Resolved theme currently applied to the document. */
  theme: Theme;
  /** Stored preference — 'system' follows the OS setting live. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Toggles between explicit light and dark (used by the header button). */
  toggle: () => void;
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>('light');
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    // Matches the pre-paint bootstrap script in app/layout.tsx: an absent
    // localStorage key means "follow the system".
    const stored = localStorage.getItem('theme') as Theme | null;
    const initialPreference: ThemePreference = stored ?? 'system';
    const initial = stored ?? systemTheme();
    setPreferenceState(initialPreference);
    setTheme(initial);
    applyTheme(initial);
  }, []);

  // While on 'system', follow OS theme changes live.
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      const next = systemTheme();
      setTheme(next);
      applyTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (next === 'system') {
      localStorage.removeItem('theme');
      const resolved = systemTheme();
      setTheme(resolved);
      applyTheme(resolved);
    } else {
      localStorage.setItem('theme', next);
      setTheme(next);
      applyTheme(next);
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setPreference]);

  return { theme, preference, setPreference, toggle };
}
