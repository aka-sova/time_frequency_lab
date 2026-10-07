/**
 * Narrowband ambiguity function (React-free).
 *
 *   χ(τ, ν) = Σ z(t)·z*(t − τ)·e^{j2πνt} / E,   E = Σ|z|²
 *
 * Same convention as the matched filter (compression.ts): the row at ν is the
 * matched-filter output for a Doppler mismatch ν, so for an up-chirp the ridge
 * runs through τ = −ν/k. Doppler is a frequency shift (narrowband model).
 *
 * The reference is cropped to its support, downconverted by f_c and resampled
 * by exact band-limiting (FFT-bin truncation to the band holding 99 % of the
 * energy plus the Doppler span), so each ν row costs one FFT and one inverse
 * FFT of a short sequence. The heatmap is therefore band-limited (sidelobe
 * levels within ≈ 1 dB); the zero-delay cut is computed exactly.
 */
import { fftInPlace, nextPowerOfTwo } from './fft';
import { activeRange } from './instrument';
import type { CompressionResult, ComplexSignal, ReferenceInfo } from './compression';

export const MAX_AMBIGUITY_SAMPLES = 8192;
/** Fraction of the reference energy kept by the band-limited resampling. */
export const AMBIGUITY_ENERGY_FRACTION = 0.99;

export interface AmbiguityOptions {
  /** Delay axis spans ±delaySpanSec. */
  delaySpanSec: number;
  /** Doppler axis spans ±dopplerSpanHz. */
  dopplerSpanHz: number;
  delayPoints?: number;
  /** Odd, so that ν = 0 is a row. */
  dopplerPoints?: number;
  /** Sample range [first, last] of the reference to use (default: where |z| > 1e-4 of its peak). */
  support?: [number, number];
}

export interface AmbiguityResult {
  tau: Float64Array;
  nu: Float64Array;
  /** Rows by ν: |χ| normalized so χ(0, 0) = 1, maximum over each delay cell (peaks are never lost). */
  mag: Float32Array[];
  /** |χ(0, ν)| = |Σ|z|²·e^{j2πνt}| / E, computed exactly at the full sample rate. */
  zeroDelay: Float64Array;
  peak: number;
  /** Σ|χ|²·Δτ·Δν at full lag resolution within the Doppler span (→ 1 when the span covers the spectrum). */
  volume: number;
  fsResampled: number;
  capped: boolean;
  ms: number;
}

/** Sample range covered by the reference pulses (model support, not Hilbert tails). */
export function referenceSupport(ref: ReferenceInfo): [number, number] {
  const fs = ref.signal.fs;
  const n = ref.signal.re.length;
  const a = Math.max(0, Math.floor((Math.min(...ref.centers) + ref.span[0]) * fs));
  const b = Math.min(n - 1, Math.ceil((Math.max(...ref.centers) + ref.span[1]) * fs));
  return b > a ? [a, b] : [0, n - 1];
}

/** Delay span = reference duration; Doppler span = ±2.5·PRF for a train, else ±max(1/τ_c, 4/T). */
export function autoAmbiguitySpan(c: CompressionResult): { delaySpanSec: number; dopplerSpanHz: number } {
  const T = c.reference.duration;
  if (c.reference.train && c.pri > 0) return { delaySpanSec: T, dopplerSpanHz: 2.5 / c.pri };
  const b = Number.isFinite(c.metrics.widthSec) && c.metrics.widthSec > 0 ? 1 / c.metrics.widthSec : 0;
  return { delaySpanSec: T, dopplerSpanHz: Math.max(b, 4 / T) };
}

export function ambiguity(ref: ComplexSignal, o: AmbiguityOptions): AmbiguityResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const fs = ref.fs;
  const delayPoints = Math.max(16, Math.round(o.delayPoints ?? 512));
  const dopplerPoints = Math.max(3, Math.round(o.dopplerPoints ?? 201) | 1);
  const dTau = Math.max(o.delaySpanSec, 1 / fs);
  const dNu = Math.max(o.dopplerSpanHz, 1e-30);

  let [a, b] = o.support ?? [0, ref.re.length - 1];
  if (!o.support) {
    const env = new Float64Array(ref.re.length);
    for (let i = 0; i < env.length; i++) env[i] = Math.hypot(ref.re[i], ref.im[i]);
    [a, b] = activeRange(env, 1e-4);
  }
  const m0 = b - a + 1;

  // Downconvert and transform the cropped reference.
  const re = new Float64Array(m0);
  const im = new Float64Array(m0);
  const w = (-2 * Math.PI * ref.fc) / fs;
  for (let i = 0; i < m0; i++) {
    const c = Math.cos(w * (a + i));
    const s = Math.sin(w * (a + i));
    re[i] = ref.re[a + i] * c - ref.im[a + i] * s;
    im[i] = ref.re[a + i] * s + ref.im[a + i] * c;
  }
  fftInPlace(re, im, false);

  // Smallest symmetric band |k| ≤ K holding the energy fraction.
  const half = Math.floor(m0 / 2);
  const ring = new Float64Array(half + 1);
  let total = 0;
  for (let k = 0; k < m0; k++) {
    const kk = k <= half ? k : m0 - k;
    const e = re[k] * re[k] + im[k] * im[k];
    ring[Math.min(kk, half)] += e;
    total += e;
  }
  let acc = 0;
  let kBand = half;
  for (let k = 0; k <= half; k++) {
    acc += ring[k];
    if (acc >= AMBIGUITY_ENERGY_FRACTION * total) {
      kBand = k;
      break;
    }
  }
  const bandHz = (kBand * fs) / m0;

  // Resampled length: band and Doppler span fit without spectral wrap.
  let m = Math.min(m0, Math.ceil((m0 * Math.min(fs, 1.25 * (2 * bandHz + 2 * dNu))) / fs));
  m = Math.max(m, 8);
  let capped = false;
  if (m > MAX_AMBIGUITY_SAMPLES) {
    m = MAX_AMBIGUITY_SAMPLES;
    capped = true;
  }
  const fsNew = (m * fs) / m0;
  const zr = new Float64Array(m);
  const zi = new Float64Array(m);
  if (m === m0) {
    zr.set(re);
    zi.set(im);
  } else {
    const keep = Math.floor((m - 1) / 2);
    for (let k = 0; k <= keep; k++) {
      zr[k] = re[k];
      zi[k] = im[k];
      if (k > 0) {
        zr[m - k] = re[m0 - k];
        zi[m - k] = im[m0 - k];
      }
    }
  }
  fftInPlace(zr, zi, true); // unscaled: χ is normalized by the energy below

  let energy = 0;
  for (let i = 0; i < m; i++) energy += zr[i] * zr[i] + zi[i] * zi[i];
  energy = energy || 1;

  const lp = nextPowerOfTwo(2 * m);
  const br = new Float64Array(lp);
  const bi = new Float64Array(lp);
  br.set(zr);
  bi.set(zi);
  fftInPlace(br, bi, false);

  const tau = new Float64Array(delayPoints);
  const cellLo = new Int32Array(delayPoints);
  const cellHi = new Int32Array(delayPoints);
  const cell = (2 * dTau) / delayPoints;
  const maxLag = m - 1;
  for (let j = 0; j < delayPoints; j++) {
    const lo = -dTau + j * cell;
    tau[j] = lo + cell / 2;
    let k0 = Math.ceil(lo * fsNew);
    let k1 = Math.floor((lo + cell) * fsNew - 1e-9);
    if (k1 < k0) k0 = k1 = Math.round(tau[j] * fsNew);
    cellLo[j] = Math.max(-maxLag, k0);
    cellHi[j] = Math.min(maxLag, k1);
  }

  const nu = new Float64Array(dopplerPoints);
  const stepNu = (2 * dNu) / (dopplerPoints - 1);
  const mag: Float32Array[] = [];
  const zeroDelay = new Float64Array(dopplerPoints);
  const ar = new Float64Array(lp);
  const ai = new Float64Array(lp);
  const lagMag = new Float64Array(2 * m - 1);
  let volume = 0;
  for (let r = 0; r < dopplerPoints; r++) {
    nu[r] = -dNu + r * stepNu;
    ar.fill(0);
    ai.fill(0);
    const wv = (2 * Math.PI * nu[r]) / fsNew;
    for (let i = 0; i < m; i++) {
      const c = Math.cos(wv * i);
      const s = Math.sin(wv * i);
      ar[i] = zr[i] * c - zi[i] * s;
      ai[i] = zr[i] * s + zi[i] * c;
    }
    fftInPlace(ar, ai, false);
    for (let k = 0; k < lp; k++) {
      const yr = ar[k] * br[k] + ai[k] * bi[k];
      const yi = ai[k] * br[k] - ar[k] * bi[k];
      ar[k] = yr;
      ai[k] = yi;
    }
    fftInPlace(ar, ai, true);
    for (let k = -maxLag; k <= maxLag; k++) {
      const src = k >= 0 ? k : lp + k;
      const v = Math.hypot(ar[src], ai[src]) / lp / energy;
      lagMag[k + maxLag] = v;
      volume += v * v;
    }
    const out = new Float32Array(delayPoints);
    for (let j = 0; j < delayPoints; j++) {
      let v = 0;
      for (let k = cellLo[j]; k <= cellHi[j]; k++) v = Math.max(v, lagMag[k + maxLag]);
      out[j] = v;
    }
    mag.push(out);
  }
  volume *= stepNu / fsNew;

  // Exact zero-delay cut on the original samples.
  let e0 = 0;
  for (let i = a; i <= b; i++) e0 += ref.re[i] * ref.re[i] + ref.im[i] * ref.im[i];
  for (let r = 0; r < dopplerPoints; r++) {
    const wv = (2 * Math.PI * nu[r]) / fs;
    const dc = Math.cos(wv);
    const ds = Math.sin(wv);
    let pc = 1; // phasor e^{jωi} by recurrence
    let ps = 0;
    let cr = 0;
    let ci = 0;
    for (let i = a; i <= b; i++) {
      const p = ref.re[i] * ref.re[i] + ref.im[i] * ref.im[i];
      cr += p * pc;
      ci += p * ps;
      const t = pc * dc - ps * ds;
      ps = pc * ds + ps * dc;
      pc = t;
    }
    zeroDelay[r] = Math.hypot(cr, ci) / (e0 || 1);
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { tau, nu, mag, zeroDelay, peak: zeroDelay[(dopplerPoints - 1) / 2], volume, fsResampled: fsNew, capped, ms: t1 - t0 };
}
