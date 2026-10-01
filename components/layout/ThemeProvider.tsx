'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { PALETTES, type Palette, type ThemeName } from '@/components/plots/theme';
import { THEME_STORAGE_KEY } from './themeScript';

interface ThemeApi {
  theme: ThemeName;
  palette: Palette;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi>({ theme: 'dark', palette: PALETTES.dark, toggle: () => {} });

/** The inline script in app/layout.tsx sets data-theme before first paint; we start from it. */
function initialTheme(): ThemeName {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  const toggle = useCallback(() => {
    const next: ThemeName = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode): theme still applies for this session */
    }
    setTheme(next);
  }, [theme]);
  const value = useMemo(() => ({ theme, palette: PALETTES[theme], toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  return useContext(ThemeContext);
}

/** Plot palette for the active theme (stable object per theme, safe as a memo dependency). */
export function usePalette(): Palette {
  return useContext(ThemeContext).palette;
}
