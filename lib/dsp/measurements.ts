/**
 * Time-domain measurements on sampled waveforms. All crossings are linearly
 * interpolated between samples.
 */
import { argMax } from './bandwidth';

export interface Crossing {
  t1: number;
  t2: number;
  width: number;
  valid: boolean;
}

const BAD: Crossing = { t1: NaN, t2: NaN, width: NaN, valid: false };

function interp(t0: number, t1: number, v0: number, v1: number, thr: number): number {
  return v1 === v0 ? t0 : t0 + ((thr - v0) / (v1 - v0)) * (t1 - t0);
}

/** Interval around the envelope peak where e(t) ≥ level·e_max (contiguous). */
export function levelWidth(t: ArrayLike<number>, e: ArrayLike<number>, level: number): Crossing {
  const n = e.length;
  if (n < 3) return BAD;
  const p = argMax(e);
  const thr = e[p] * level;
  if (!(e[p] > 0)) return BAD;
  let a = NaN;
  for (let i = p; i > 0; i--) {
    if (e[i - 1] < thr) {
      a = interp(t[i - 1], t[i], e[i - 1], e[i], thr);
      break;
    }
  }
  let b = NaN;
  for (let i = p; i < n - 1; i++) {
    if (e[i + 1] < thr) {
      b = interp(t[i], t[i + 1], e[i], e[i + 1], thr);
      break;
    }
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return BAD;
  return { t1: a, t2: b, width: b - a, valid: true };
}

/** Full width at half maximum of an envelope. */
export function fwhm(t: ArrayLike<number>, e: ArrayLike<number>): Crossing {
  return levelWidth(t, e, 0.5);
}

/**
 * 10–90 % rise and 90–10 % fall times of the envelope around its peak: the
 * last 90 % crossing before the peak and the 10 % crossing preceding it
 * (mirror for the fall).
 */
export function edgeTimes(t: ArrayLike<number>, e: ArrayLike<number>, lo = 0.1, hi = 0.9): { rise: number; fall: number } {
  const n = e.length;
  const p = argMax(e);
  const peak = e[p];
  if (!(peak > 0)) return { rise: NaN, fall: NaN };
  const L = lo * peak;
  const H = hi * peak;
  let tH = NaN;
  let tL = NaN;
  let i = p;
  for (; i > 0; i--) {
    if (e[i - 1] < H) {
      tH = interp(t[i - 1], t[i], e[i - 1], e[i], H);
      break;
    }
  }
  for (; i > 0; i--) {
    if (e[i - 1] < L) {
      tL = interp(t[i - 1], t[i], e[i - 1], e[i], L);
      break;
    }
  }
  const rise = tH - tL;
  let fH = NaN;
  let fL = NaN;
  let j = p;
  for (; j < n - 1; j++) {
    if (e[j + 1] < H) {
      fH = interp(t[j], t[j + 1], e[j], e[j + 1], H);
      break;
    }
  }
  for (; j < n - 1; j++) {
    if (e[j + 1] < L) {
      fL = interp(t[j], t[j + 1], e[j], e[j + 1], L);
      break;
    }
  }
  return { rise, fall: fL - fH };
}

export interface RmsDuration {
  centroid: number;
  sigma: number;
  energy: number;
}

/**
 * RMS duration σ_t from the energy density |e(t)|²:
 *   t̄ = ∫ t|e|² / ∫|e|²,  σ_t² = ∫ (t − t̄)²|e|² / ∫|e|²
 * Use e = x for baseband signals and e = |z| (Hilbert envelope) for bandpass
 * signals so that σ_t pairs consistently with rmsBandwidth().
 */
export function rmsDuration(t: ArrayLike<number>, e: ArrayLike<number>): RmsDuration {
  let s0 = 0;
  let s1 = 0;
  for (let i = 0; i < e.length; i++) {
    const p = e[i] * e[i];
    s0 += p;
    s1 += t[i] * p;
  }
  if (!(s0 > 0)) return { centroid: NaN, sigma: NaN, energy: 0 };
  const c = s1 / s0;
  let s2 = 0;
  for (let i = 0; i < e.length; i++) s2 += (t[i] - c) ** 2 * e[i] * e[i];
  const dt = e.length > 1 ? t[1] - t[0] : 1;
  return { centroid: c, sigma: Math.sqrt(s2 / s0), energy: s0 * dt };
}

export function peakAbs(x: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

export function rms(x: ArrayLike<number>, start = 0, end = x.length): number {
  let s = 0;
  for (let i = start; i < end; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(end - start, 1));
}

/** Ratio of signal power to error power in dB (e.g. SQNR, SNR). */
export function snrDb(clean: ArrayLike<number>, observed: ArrayLike<number>): number {
  let ps = 0;
  let pe = 0;
  for (let i = 0; i < clean.length; i++) {
    ps += clean[i] * clean[i];
    pe += (observed[i] - clean[i]) ** 2;
  }
  return pe > 0 ? 10 * Math.log10(ps / pe) : Infinity;
}
