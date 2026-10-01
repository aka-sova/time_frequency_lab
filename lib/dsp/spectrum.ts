/**
 * Spectrum estimation and normalization conventions.
 *
 * Let X_d[k] = Σ_n w[n]·x[n]·e^{−j2πkn/N_fft} be the (unscaled) DFT of the
 * windowed, zero-padded record of N_seg samples, Δt = 1/fs.
 *
 *  • Fourier-transform estimate ('ft'):     X(f_k) ≈ Δt · X_d[k]          [V/Hz = V·s]
 *    Approximates X(f) = ∫x(t)e^{−j2πft}dt for energy (pulse) signals; it is
 *    independent of fs and of zero padding, so pulse spectra keep their
 *    physical height (e.g. a rect pulse of width τ has |X(0)| = A·τ).
 *  • Amplitude spectrum ('amplitude'):      X_d[k] / Σw                    [V]
 *    Coherent-gain corrected; a bin-centred tone A·cos(2πf₀t) shows A/2 at ±f₀
 *    (two-sided) and A on the doubled one-sided scale. For power signals.
 *  • Periodogram PSD:                        |X_d[k]|² / (fs · Σw²)         [V²/Hz]
 *    Noise-normalized so that Σ_k PSD[k]·(fs/N_fft)·(N_fft/N_seg) equals the
 *    mean power of the windowed record (Parseval).
 *
 * One-sided views fold negative frequencies onto positive ones: power-like
 * quantities are doubled except at DC and Nyquist. The Fourier-transform
 * magnitude |X(f)| itself is a function value and is not doubled.
 */
import type { AnalysisWindow, SpectrumScaling } from '@/types/signal';
import { fftFrequencies, fftInPlace, ifft } from './fft';
import { makeWindow, windowStats, type WindowStats } from './windows';

export interface SpectrumOptions {
  window: AnalysisWindow;
  zeroPad: number;
  scaling: SpectrumScaling;
  /** Sample-index range [start, end) of the analyzed segment. */
  start?: number;
  end?: number;
}

export interface Spectrum {
  fs: number;
  nSeg: number;
  nfft: number;
  /** DFT bin spacing fs/N_fft (affected by zero padding). */
  binSpacing: number;
  /** Bin spacing of the un-padded record fs/N_seg ≈ 1/T_obs. */
  recordBinSpacing: number;
  /** Time of the first analyzed sample. */
  tStart: number;
  /** Natural FFT order. */
  freqs: Float64Array;
  re: Float64Array;
  im: Float64Array;
  /** |X_d|² in natural order (Welch: averaged). */
  power: Float64Array;
  window: WindowStats;
  scaling: SpectrumScaling;
  /** Multiply |X_d| by this to get the chosen magnitude scaling. */
  magScale: number;
  /** Multiply |X_d|² by this to get the two-sided PSD in V²/Hz. */
  psdScale: number;
}

export function computeSpectrum(x: ArrayLike<number>, fs: number, opts: SpectrumOptions): Spectrum {
  const start = Math.max(0, Math.min(opts.start ?? 0, x.length));
  const end = Math.max(start + 2, Math.min(opts.end ?? x.length, x.length));
  const nSeg = Math.max(1, end - start);
  const pad = Math.max(1, opts.zeroPad);
  const nfft = Math.max(nSeg, Math.round(nSeg * pad));
  const w = makeWindow(opts.window, nSeg, true);
  const ws = windowStats(w);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let i = 0; i < nSeg; i++) re[i] = (x[start + i] ?? 0) * w[i];
  fftInPlace(re, im, false);
  const power = new Float64Array(nfft);
  for (let k = 0; k < nfft; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  return {
    fs,
    nSeg,
    nfft,
    binSpacing: fs / nfft,
    recordBinSpacing: fs / nSeg,
    tStart: start / fs,
    freqs: fftFrequencies(nfft, fs),
    re,
    im,
    power,
    window: ws,
    scaling: opts.scaling,
    magScale: opts.scaling === 'ft' ? 1 / fs : 1 / ws.sum,
    psdScale: 1 / (fs * ws.sumSq),
  };
}

/**
 * Welch-averaged periodogram: K Hann-windowed segments with 50 % overlap.
 * Reduces the variance of PSD estimates of noise-like signals at the cost of
 * frequency resolution (segment length < record length).
 */
export function computeWelch(x: ArrayLike<number>, fs: number, segments: number, zeroPad: number, scaling: SpectrumScaling): Spectrum {
  const k = Math.max(1, Math.round(segments));
  const n = x.length;
  const len = Math.max(16, Math.floor((2 * n) / (k + 1)));
  const hop = Math.max(1, Math.floor(len / 2));
  const nfft = Math.max(len, Math.round(len * Math.max(1, zeroPad)));
  const w = makeWindow('hann', len, true);
  const ws = windowStats(w);
  const acc = new Float64Array(nfft);
  let count = 0;
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  for (let s = 0; s + len <= n; s += hop) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < len; i++) re[i] = x[s + i] * w[i];
    fftInPlace(re, im, false);
    for (let j = 0; j < nfft; j++) acc[j] += re[j] * re[j] + im[j] * im[j];
    count++;
  }
  for (let j = 0; j < nfft; j++) acc[j] /= Math.max(count, 1);
  const mag = new Float64Array(nfft);
  for (let j = 0; j < nfft; j++) mag[j] = Math.sqrt(acc[j]);
  return {
    fs,
    nSeg: len,
    nfft,
    binSpacing: fs / nfft,
    recordBinSpacing: fs / len,
    tStart: 0,
    freqs: fftFrequencies(nfft, fs),
    re: mag,
    im: new Float64Array(nfft),
    power: acc,
    window: ws,
    scaling,
    magScale: scaling === 'ft' ? 1 / fs : 1 / ws.sum,
    psdScale: 1 / (fs * ws.sumSq),
  };
}

export interface HalfSpectrum {
  /** Ascending frequencies 0 … fs/2. */
  f: Float64Array;
  /** Scaled magnitude |X| (no one-sided doubling). */
  mag: Float64Array;
  /** Folded |X_d|² (doubled except DC/Nyquist) — energy distribution over f ≥ 0. */
  foldedPower: Float64Array;
  /** Natural-order bin indices of the entries. */
  bins: Int32Array;
}

/** Non-negative frequency half of a real-signal spectrum, with power folding. */
export function positiveHalf(s: Spectrum): HalfSpectrum {
  const m = Math.floor(s.nfft / 2) + 1;
  const f = new Float64Array(m);
  const mag = new Float64Array(m);
  const fp = new Float64Array(m);
  const bins = new Int32Array(m);
  const nyq = s.nfft % 2 === 0 ? s.nfft / 2 : -1;
  for (let k = 0; k < m; k++) {
    f[k] = (k * s.fs) / s.nfft;
    mag[k] = Math.sqrt(s.power[k]) * s.magScale;
    fp[k] = k === 0 || k === nyq ? s.power[k] : 2 * s.power[k];
    bins[k] = k;
  }
  return { f, mag, foldedPower: fp, bins };
}

/**
 * Phase of X(f) referenced to time tRef: arg{X(f)·e^{+j2πf(tRef − tStart)}}.
 * Choosing tRef at the pulse center removes the linear-phase term of the
 * pulse delay so that the remaining phase reflects the pulse shape.
 */
export function phaseAt(s: Spectrum, bin: number, tRef: number): number {
  const f = s.freqs[bin];
  const a = 2 * Math.PI * f * (tRef - s.tStart);
  const c = Math.cos(a);
  const d = Math.sin(a);
  const r = s.re[bin] * c - s.im[bin] * d;
  const i = s.re[bin] * d + s.im[bin] * c;
  return Math.atan2(i, r);
}

/** Unwrap a phase sequence (radians), ignoring NaN gaps. */
export function unwrapPhase(p: ArrayLike<number>): Float64Array {
  const out = new Float64Array(p.length);
  let offset = 0;
  let prev = NaN;
  for (let i = 0; i < p.length; i++) {
    const v = p[i];
    if (!Number.isFinite(v)) {
      out[i] = NaN;
      continue;
    }
    if (Number.isFinite(prev)) {
      let d = v + offset - prev;
      while (d > Math.PI) {
        offset -= 2 * Math.PI;
        d -= 2 * Math.PI;
      }
      while (d < -Math.PI) {
        offset += 2 * Math.PI;
        d += 2 * Math.PI;
      }
    }
    out[i] = v + offset;
    prev = out[i];
  }
  return out;
}

/**
 * Discrete analytic signal z = x + j·H{x} via the FFT: keep DC (and Nyquist)
 * once, double positive frequencies, zero negative frequencies.
 * |z| is the Hilbert envelope used for bandpass time measurements.
 */
export function analyticSignal(x: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i];
  fftInPlace(re, im, false);
  const half = Math.floor(n / 2);
  for (let k = 1; k < n; k++) {
    let h: number;
    if (n % 2 === 0) h = k < half ? 2 : k === half ? 1 : 0;
    else h = k <= half ? 2 : 0;
    re[k] *= h;
    im[k] *= h;
  }
  return ifft(re, im);
}

export function hilbertEnvelope(x: ArrayLike<number>): Float64Array {
  const z = analyticSignal(x);
  const e = new Float64Array(x.length);
  for (let i = 0; i < e.length; i++) e[i] = Math.hypot(z.re[i], z.im[i]);
  return e;
}
