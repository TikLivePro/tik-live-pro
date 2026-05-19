export const lightTheme = {
  mode: 'light' as const,
  colors: {
    background: '#ffffff',
    surface: '#f8fafc',
    border: '#e2e8f0',
    brand: '#7c3aed',
    brandForeground: '#ffffff',
    foreground: '#0f172a',
    muted: '#64748b',
    mutedBackground: '#f1f5f9',
    destructive: '#ef4444',
    success: '#22c55e',
    live: '#ef4444',
    tiktok: '#ff0050',
    facebook: '#1877f2',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 20,
    full: 9999,
  },
  typography: {
    xs: { fontSize: 12, lineHeight: 16 },
    sm: { fontSize: 14, lineHeight: 20 },
    base: { fontSize: 16, lineHeight: 24 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 28 },
    '2xl': { fontSize: 24, lineHeight: 32 },
  },
};

export const darkTheme: typeof lightTheme = {
  ...lightTheme,
  mode: 'dark' as const,
  colors: {
    ...lightTheme.colors,
    background: '#0f172a',
    surface: '#1e293b',
    border: '#334155',
    foreground: '#f8fafc',
    muted: '#94a3b8',
    mutedBackground: '#1e293b',
    brand: '#a78bfa',
  },
};

export type AppTheme = typeof lightTheme;
