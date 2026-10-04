'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { FONT_SCALE_CSS_VAR, FONT_SCALE_STORAGE_KEY, clampScale, stepScale } from '@/lib/ui/fontScale';

interface FontSizeApi {
  /** 1 = 100 %. Multiplies the root font size and the Plotly font sizes. */
  scale: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
  set: (v: number) => void;
}

const FontSizeContext = createContext<FontSizeApi>({ scale: 1, increase: () => {}, decrease: () => {}, reset: () => {}, set: () => {} });

// The source of truth is the --ui-scale property on <html> (set before first paint by the inline
// script in app/layout.tsx). It is read through useSyncExternalStore, so the server renders at
// 100 % and the client switches to the stored value right after hydration without a mismatch.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getServerSnapshot = () => 1;
function getSnapshot(): number {
  const v = parseFloat(document.documentElement.style.getPropertyValue(FONT_SCALE_CSS_VAR));
  return Number.isFinite(v) ? clampScale(v) : 1;
}

function apply(v: number) {
  document.documentElement.style.setProperty(FONT_SCALE_CSS_VAR, String(v));
  try {
    if (v === 1) localStorage.removeItem(FONT_SCALE_STORAGE_KEY);
    else localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(v));
  } catch {
    /* storage unavailable (private mode): the size still applies for this session */
  }
  listeners.forEach((l) => l());
}

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const scale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((v: number) => apply(clampScale(v)), []);
  const increase = useCallback(() => apply(stepScale(getSnapshot(), 1)), []);
  const decrease = useCallback(() => apply(stepScale(getSnapshot(), -1)), []);
  const reset = useCallback(() => apply(1), []);
  const value = useMemo(() => ({ scale, increase, decrease, reset, set }), [scale, increase, decrease, reset, set]);
  return <FontSizeContext.Provider value={value}>{children}</FontSizeContext.Provider>;
}

export function useFontSize(): FontSizeApi {
  return useContext(FontSizeContext);
}
