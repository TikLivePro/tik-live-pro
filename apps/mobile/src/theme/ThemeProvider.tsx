import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { ThemeProvider as SCThemeProvider } from 'styled-components/native';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, type AppTheme } from './theme';

interface ThemeContextValue {
  theme: AppTheme;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [overrideScheme, setOverrideScheme] = useState<'light' | 'dark' | null>(null);

  const scheme = overrideScheme ?? systemScheme ?? 'light';
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  const toggleTheme = () =>
    setOverrideScheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, isDark: scheme === 'dark', toggleTheme }}>
      <SCThemeProvider theme={theme}>
        {children}
      </SCThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used inside AppThemeProvider');
  return ctx;
}
