export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'honcho-memory-console-theme';

function systemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function readInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const theme = stored === 'light' || stored === 'dark' ? stored : systemTheme();
  applyTheme(theme);
  return theme;
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Browser storage can be disabled; the visual theme still applies for this session.
  }
}
