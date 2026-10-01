/**
 * Spectral-leakage laboratory: a single tone observed over N samples,
 * analyzed with several windows. Frequencies are expressed in DFT bins of the
 * un-padded record (cycles per record), so "integer bin" ⇔ an exact number of
 * periods fits the observation and the rectangular window shows no leakage.
 */
import type { AnalysisWindow } from '@/types/signal';
import { fftInPlace } from './fft';
import { makeWindow, windowStats } from './windows';

export interface LeakageTrace {
  window: AnalysisWindow;
  /** Interpolated (zero-padded) spectrum, bins and dB re. bin-centered peak. */
  bins: number[];
  db: number[];
  /** Raw N-point DFT samples (integer bins). */
  rawBins: number[];
  rawDb: number[];
}

/** dB spectrum normalized so a bin-centered tone of the same amplitude reads 0 dB. */
export function toneSpectrum(n: number, toneBin: number, zeroPad: number, window: AnalysisWindow, maxBin?: number): LeakageTrace {
  const w = makeWindow(window, n, true);
  const ws = windowStats(w);
  const build = (nfft: number) => {
    const re = new Float64Array(nfft);
    const im = new Float64Array(nfft);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * toneBin * i) / n) * w[i];
    fftInPlace(re, im, false);
    const ref = ws.sum / 2;
    const half = Math.floor(nfft / 2);
    const lim = maxBin === undefined ? half : Math.min(half, Math.ceil((maxBin * nfft) / n));
    const bins: number[] = [];
    const db: number[] = [];
    for (let k = 0; k <= lim; k++) {
      bins.push((k * n) / nfft);
      db.push(20 * Math.log10(Math.max(Math.hypot(re[k], im[k]) / ref, 1e-12)));
    }
    return { bins, db };
  };
  const fine = build(Math.max(n, Math.round(n * zeroPad)));
  const raw = build(n);
  return { window, bins: fine.bins, db: fine.db, rawBins: raw.bins, rawDb: raw.db };
}

export interface WindowMetrics {
  window: AnalysisWindow;
  /** Main-lobe null-to-null width in bins. */
  mainLobeBins: number;
  /** −3 dB main-lobe width in bins. */
  halfPowerBins: number;
  /** Highest sidelobe relative to the main-lobe peak (dB). */
  peakSidelobeDb: number;
  enbwBins: number;
  coherentGain: number;
  /** Worst-case amplitude loss for a tone halfway between bins (dB). */
  scallopLossDb: number;
}

/** Measures window properties numerically from a heavily zero-padded DTFT. */
export function measureWindow(window: AnalysisWindow, n = 64, pad = 64): WindowMetrics {
  const w = makeWindow(window, n, true);
  const ws = windowStats(w);
  const nfft = n * pad;
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < n; i++) re[i] = w[i];
  fftInPlace(re, im, false);
  const mag = new Float64Array(nfft / 2);
  for (let k = 0; k < nfft / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  const peak = mag[0];
  let k = 1;
  while (k < mag.length - 1 && !(mag[k] <= mag[k - 1] && mag[k] <= mag[k + 1])) k++;
  const firstNull = k;
  let side = 0;
  for (let j = firstNull; j < mag.length; j++) side = Math.max(side, mag[j]);
  let h = 1;
  while (h < mag.length && mag[h] >= peak / Math.SQRT2) h++;
  const h0 = h - 1;
  const frac = (peak / Math.SQRT2 - mag[h0]) / (mag[h] - mag[h0]);
  const halfPower = ((h0 + frac) / pad) * 2;
  return {
    window,
    mainLobeBins: (2 * firstNull) / pad,
    halfPowerBins: halfPower,
    peakSidelobeDb: 20 * Math.log10(side / peak),
    enbwBins: ws.enbwBins,
    coherentGain: ws.coherentGain,
    scallopLossDb: 20 * Math.log10(mag[pad / 2] / peak),
  };
}
