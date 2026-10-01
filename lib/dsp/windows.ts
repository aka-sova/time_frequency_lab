import type { AnalysisWindow, EnvelopeType } from '@/types/signal';

/**
 * Window functions.
 *
 * Each window is defined as a continuous function w(u) on u ∈ [0, 1]. Sampled
 * windows use either
 *   - symmetric points u = n/(N−1)  (filter design, envelopes), or
 *   - periodic ("DFT-even") points u = n/N (spectral analysis — the standard
 *     choice because the window then has exact DFT-bin nulls).
 */

export type WindowName = AnalysisWindow | 'tukey' | 'gaussian';

function cosineSum(u: number, a: number[]): number {
  let v = 0;
  for (let k = 0; k < a.length; k++) v += (k % 2 === 0 ? 1 : -1) * a[k] * Math.cos(2 * Math.PI * k * u);
  return v;
}

export function windowValue(name: WindowName, u: number, param = 0.5): number {
  if (u < 0 || u > 1) return 0;
  switch (name) {
    case 'rect':
      return 1;
    case 'hann':
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
    case 'hamming':
      return 0.54 - 0.46 * Math.cos(2 * Math.PI * u);
    case 'blackman':
      return cosineSum(u, [0.42, 0.5, 0.08]);
    case 'blackman-harris':
      return cosineSum(u, [0.35875, 0.48829, 0.14128, 0.01168]);
    case 'flattop':
      return cosineSum(u, [0.21557895, 0.41663158, 0.277263158, 0.083578947, 0.006947368]);
    case 'tukey': {
      // Raised-cosine taper; `param` = α, the tapered fraction of the support.
      const a = Math.min(Math.max(param, 0), 1);
      if (a <= 0) return 1;
      if (u < a / 2) return 0.5 * (1 - Math.cos((2 * Math.PI * u) / a));
      if (u > 1 - a / 2) return 0.5 * (1 - Math.cos((2 * Math.PI * (1 - u)) / a));
      return 1;
    }
    case 'gaussian': {
      const s = param > 0 ? param : 0.4;
      const z = (u - 0.5) / (s * 0.5);
      return Math.exp(-0.5 * z * z);
    }
  }
}

export function makeWindow(name: WindowName, n: number, periodic = true, param?: number): Float64Array {
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  const denom = periodic ? n : n - 1;
  for (let i = 0; i < n; i++) w[i] = windowValue(name, i / denom, param);
  return w;
}

export interface WindowStats {
  /** Σw */
  sum: number;
  /** Σw² */
  sumSq: number;
  /** Coherent gain Σw/N (amplitude of a bin-centered tone is scaled by this). */
  coherentGain: number;
  /** Equivalent noise bandwidth in bins: N·Σw² / (Σw)². */
  enbwBins: number;
}

export function windowStats(w: ArrayLike<number>): WindowStats {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < w.length; i++) {
    s += w[i];
    s2 += w[i] * w[i];
  }
  const n = w.length;
  return { sum: s, sumSq: s2, coherentGain: s / n, enbwBins: (n * s2) / (s * s) };
}

export const ANALYSIS_WINDOWS: { id: AnalysisWindow; label: string }[] = [
  { id: 'rect', label: 'Rectangular' },
  { id: 'hann', label: 'Hann' },
  { id: 'hamming', label: 'Hamming' },
  { id: 'blackman', label: 'Blackman' },
  { id: 'blackman-harris', label: 'Blackman–Harris' },
  { id: 'flattop', label: 'Flat-top' },
];

export const ENVELOPES: { id: EnvelopeType; label: string }[] = [
  { id: 'rect', label: 'Rectangular / trapezoid' },
  { id: 'gaussian', label: 'Gaussian' },
  { id: 'gaussian-d1', label: 'Gaussian 1st derivative (monocycle)' },
  { id: 'gaussian-d2', label: 'Gaussian 2nd derivative (Ricker)' },
  { id: 'hann', label: 'Hann' },
  { id: 'hamming', label: 'Hamming' },
  { id: 'blackman', label: 'Blackman' },
  { id: 'tukey', label: 'Raised cosine (Tukey)' },
];
