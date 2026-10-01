/**
 * Converts a Spectrum into the plotted quantity for a given sidedness and
 * display mode. See spectrum.ts for the normalization conventions; one-sided
 * doubling is applied only to absolute amplitude-spectrum magnitudes and to
 * power-like quantities.
 */
import type { Sidedness, SpectrumDisplay } from '@/types/signal';
import type { Spectrum } from './spectrum';

export interface SpectrumView {
  /** Ascending frequency axis (Hz). */
  f: Float64Array;
  /** Natural-order bin of each point. */
  bins: Int32Array;
  /** Plotted quantity. */
  y: Float64Array;
  /** Scaled |X| without doubling (for hover / dB-relative readouts). */
  mag: Float64Array;
  /** Peak of |X| over all displayed points. */
  magPeak: number;
  /** True when y is in dB. */
  db: boolean;
  /** Label of y. */
  yLabel: string;
}

export function viewOrder(s: Spectrum, sided: Sidedness, centered: boolean): { f: Float64Array; bins: Int32Array; doubled: Uint8Array } {
  const n = s.nfft;
  if (sided === 'one') {
    const m = Math.floor(n / 2) + 1;
    const f = new Float64Array(m);
    const bins = new Int32Array(m);
    const doubled = new Uint8Array(m);
    for (let k = 0; k < m; k++) {
      f[k] = (k * s.fs) / n;
      bins[k] = k;
      doubled[k] = k === 0 || (n % 2 === 0 && k === n / 2) ? 0 : 1;
    }
    return { f, bins, doubled };
  }
  const f = new Float64Array(n);
  const bins = new Int32Array(n);
  const doubled = new Uint8Array(n);
  if (centered) {
    const shift = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      const k = (i + n - shift) % n;
      bins[i] = k;
      f[i] = s.freqs[k];
    }
  } else {
    for (let k = 0; k < n; k++) {
      bins[k] = k;
      f[k] = (k * s.fs) / n;
    }
  }
  return { f, bins, doubled };
}

/** Plotted quantity from scaled magnitudes |X| (already including any overlay factor). */
export function valuesFromMag(
  mag: ArrayLike<number>,
  doubled: ArrayLike<number>,
  s: Spectrum,
  display: SpectrumDisplay,
  powerDb: boolean,
  refPeak: number,
): Float64Array {
  const m = mag.length;
  const y = new Float64Array(m);
  const amp = s.scaling === 'amplitude';
  const ref = refPeak > 0 ? refPeak : 1;
  for (let i = 0; i < m; i++) {
    const v = mag[i];
    const d = doubled[i] ? 2 : 1;
    switch (display) {
      case 'magnitude':
        y[i] = v * (amp ? d : 1);
        break;
      case 'normalized':
        y[i] = v / ref;
        break;
      case 'db':
        y[i] = 20 * Math.log10(Math.max(v / ref, 1e-15));
        break;
      case 'power':
        y[i] = v * v * d;
        break;
      case 'psd':
        y[i] = ((v * v) / (s.magScale * s.magScale)) * s.psdScale * d;
        break;
    }
    if ((display === 'power' || display === 'psd') && powerDb) y[i] = 10 * Math.log10(Math.max(y[i], 1e-300));
  }
  return y;
}

export function yAxisLabel(s: Spectrum, display: SpectrumDisplay, powerDb: boolean, u: { ft: string; amp: string; psd: string }): string {
  const amp = s.scaling === 'amplitude';
  switch (display) {
    case 'magnitude':
      return amp ? `|X| (${u.amp})` : `|X(f)| (${u.ft})`;
    case 'normalized':
      return '|X(f)| / max|X|';
    case 'db':
      return '|X| (dB re peak)';
    case 'power': {
      const base = amp ? `Power |X|² (${u.amp}²)` : `ESD |X(f)|² (${u.ft}²)`;
      return powerDb ? `${base}, dB` : base;
    }
    case 'psd':
      return powerDb ? `PSD (dB re 1 ${u.psd})` : `PSD (${u.psd})`;
  }
}

export interface SpectrumViewFull extends SpectrumView {
  doubled: Uint8Array;
}

export function spectrumView(
  s: Spectrum,
  opts: { sided: Sidedness; centered: boolean; display: SpectrumDisplay; powerDb: boolean; unitLabel: { ft: string; amp: string; psd: string } },
): SpectrumViewFull {
  const { f, bins, doubled } = viewOrder(s, opts.sided, opts.centered);
  const m = f.length;
  const mag = new Float64Array(m);
  let peak = 0;
  for (let i = 0; i < m; i++) {
    mag[i] = Math.sqrt(s.power[bins[i]]) * s.magScale;
    if (mag[i] > peak) peak = mag[i];
  }
  const y = valuesFromMag(mag, doubled, s, opts.display, opts.powerDb, peak);
  const db = opts.display === 'db' || ((opts.display === 'power' || opts.display === 'psd') && opts.powerDb);
  return { f, bins, y, mag, magPeak: peak, db, yLabel: yAxisLabel(s, opts.display, opts.powerDb, opts.unitLabel), doubled };
}
