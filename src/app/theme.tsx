import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Appearance, chosen by each person from their own menu (owner decision
 * 2026-10-04): Light by default, Light with a dark menu, Dark, or Automatic,
 * which follows the device between Light and Dark.
 */
export type ThemeChoice = 'light' | 'light-dark-menu' | 'dark' | 'auto';

export const THEMES: { id: ThemeChoice; label: string; note: string }[] = [
  { id: 'light', label: 'Light', note: 'The default' },
  { id: 'light-dark-menu', label: 'Light, dark menu', note: 'A dark side menu beside a light page' },
  { id: 'dark', label: 'Dark', note: 'Easier on the eyes in the evening' },
  { id: 'auto', label: 'Automatic', note: 'Follows your device' },
];

const KEY = 'mrsales.theme';

const read = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.some(t => t.id === v) ? (v as ThemeChoice) : 'light';
  } catch {
    return 'light';
  }
};

const Ctx = createContext<{ theme: ThemeChoice; setTheme: (t: ThemeChoice) => void }>({
  theme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(read);

  useEffect(() => {
    const root = document.documentElement;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'auto' && dark.matches);
      root.dataset.theme = isDark ? 'dark' : 'light';
      root.dataset.menu = theme === 'light-dark-menu' ? 'dark' : 'light';
    };
    apply();
    dark.addEventListener('change', apply);
    return () => dark.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = (t: ThemeChoice) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      // A private window keeps the choice for this visit only.
    }
  };

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
