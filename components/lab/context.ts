'use client';

import { createContext, useContext } from 'react';
import type { Experiment, UiMode } from '@/types/signal';
import type { IsolateKey } from '@/lib/presets/isolate';

export type WorkspaceTab = 'measurements' | 'ab' | 'sweep' | 'leakage' | 'synthesis' | 'theory' | 'experiments';
export type SectionKey = 'carrier' | 'pulse' | 'repetition' | 'coherence' | 'jitter' | 'chirp' | 'am' | 'noise' | 'sampling' | 'general';

export interface LabApi {
  exp: Experiment;
  mode: UiMode;
  presetId: string;
  update: (path: string, value: unknown) => void;
  updateMany: (entries: [string, unknown][]) => void;
  isLocked: (path: string) => boolean;
  toggleLock: (path: string) => void;
  resetSection: (key: SectionKey) => void;
  isolate: (key: IsolateKey) => void;
  fitTime: () => void;
  fitFrequency: () => void;
  applyPreset: (id: string) => void;
  setTab: (t: WorkspaceTab) => void;
}

export const LabContext = createContext<LabApi | null>(null);

export function useLab(): LabApi {
  const v = useContext(LabContext);
  if (!v) throw new Error('useLab must be used inside LabContext');
  return v;
}

const ORDER: Record<UiMode, number> = { basic: 0, advanced: 1, expert: 2 };

export function allowed(mode: UiMode, level: UiMode = 'basic'): boolean {
  return ORDER[mode] >= ORDER[level];
}
