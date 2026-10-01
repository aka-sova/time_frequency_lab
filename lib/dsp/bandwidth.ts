/**
 * Bandwidth definitions. "Bandwidth" has no single universal definition, so
 * each function implements one explicitly labeled definition.
 *
 * All functions operate on the non-negative-frequency half of a real signal's
 * spectrum (see spectrum.positiveHalf) and distinguish two spectrum kinds:
 *
 *   baseband — energy centered at DC. Bandwidth is measured from 0 Hz to the
 *              edge (equivalent to the two-sided definition halved).
 *   bandpass — energy centered at f_c > 0. Bandwidth is measured between a
 *              lower and an upper edge around the spectral peak/centroid.
 */
export type SpectrumKind = 'baseband' | 'bandpass';

export interface Band {
  low: number;
  high: number;
  width: number;
  valid: boolean;
  note?: string;
}

const INVALID: Band = { low: NaN, high: NaN, width: NaN, valid: false };

export function argMax(a: ArrayLike<number>, i0 = 0, i1 = a.length): number {
  let best = i0;
  for (let i = i0 + 1; i < i1; i++) if (a[i] > a[best]) best = i;
  return best;
}

function lerpCross(f0: number, f1: number, v0: number, v1: number, thr: number): number {
  if (v1 === v0) return f0;
  return f0 + ((thr - v0) / (v1 - v0)) * (f1 - f0);
}

/**
 * −X dB bandwidth: the contiguous interval around the spectral peak in which
 * |X(f)| ≥ |X|max·10^(−X/20). Edges are linearly interpolated (in dB) between
 * bins. For a pulse train this yields the width of the strongest *line*.
 */
export function thresholdBandwidth(f: ArrayLike<number>, mag: ArrayLike<number>, dbDown: number, kind: SpectrumKind): Band {
  if (mag.length < 3) return INVALID;
  return bandAround(f, mag, argMax(mag), dbDown, kind);
}

/** Contiguous −X dB band around bin p (relative to |X[p]|). */
export function bandAround(f: ArrayLike<number>, mag: ArrayLike<number>, p: number, dbDown: number, kind: SpectrumKind): Band {
  const n = mag.length;
  const peak = mag[p];
  if (!(peak > 0)) return INVALID;
  const thrDb = -Math.abs(dbDown);
  const db = (v: number) => 20 * Math.log10(Math.max(v / peak, 1e-300));

  let hi = NaN;
  for (let k = p + 1; k < n; k++) {
    if (db(mag[k]) < thrDb) {
      hi = lerpCross(f[k - 1], f[k], db(mag[k - 1]), db(mag[k]), thrDb);
      break;
    }
  }
  let lo = NaN;
  let reachedDc = false;
  for (let k = p - 1; k >= 0; k--) {
    if (db(mag[k]) < thrDb) {
      lo = lerpCross(f[k + 1], f[k], db(mag[k + 1]), db(mag[k]), thrDb);
      break;
    }
    if (k === 0) reachedDc = true;
  }
  if (p === 0) reachedDc = true;
  if (!Number.isFinite(hi)) return { ...INVALID, note: 'edge beyond analysis range' };
  if (kind === 'baseband' || reachedDc) {
    return { low: 0, high: hi, width: hi, valid: true, note: kind === 'bandpass' ? 'extends to DC' : undefined };
  }
  return { low: lo, high: hi, width: hi - lo, valid: Number.isFinite(lo) };
}

/**
 * Occupied bandwidth containing a fraction β of the total energy.
 *  bandpass: equal-tail definition (ITU-R SM.328) — (1−β)/2 of the energy lies
 *            below the lower and above the upper edge.
 *  baseband: from DC up to the frequency enclosing β (equivalent to the
 *            symmetric two-sided equal-tail band).
 * Each bin's energy is treated as uniformly spread across the bin, which
 * gives sub-bin interpolation of the edges.
 */
export function occupiedBandwidth(f: ArrayLike<number>, foldedPower: ArrayLike<number>, fraction: number, kind: SpectrumKind): Band {
  const n = foldedPower.length;
  if (n < 2) return INVALID;
  let total = 0;
  for (let k = 0; k < n; k++) total += foldedPower[k];
  if (!(total > 0)) return INVALID;
  const df = f[1] - f[0];
  const locate = (target: number) => {
    let c = 0;
    for (let k = 0; k < n; k++) {
      const next = c + foldedPower[k];
      if (next >= target) {
        const frac = foldedPower[k] > 0 ? (target - c) / foldedPower[k] : 0;
        // Bin k covers [f_k − Δf/2, f_k + Δf/2]; the DC bin starts at 0.
        const left = k === 0 ? 0 : f[k] - df / 2;
        const right = k === 0 ? df / 2 : f[k] + df / 2;
        return left + frac * (right - left);
      }
      c = next;
    }
    return f[n - 1];
  };
  if (kind === 'baseband') {
    const hi = locate(fraction * total);
    return { low: 0, high: hi, width: hi, valid: true };
  }
  const lo = locate(((1 - fraction) / 2) * total);
  const hi = locate(((1 + fraction) / 2) * total);
  return { low: lo, high: hi, width: hi - lo, valid: true };
}

/**
 * Null-to-null (main-lobe) bandwidth: from the peak, walk outward to the
 * first local minimum that is at least 12 dB below the peak. For baseband
 * spectra the first null frequency is reported (DC → first null).
 * Not meaningful for shapes without nulls (e.g. Gaussian) → invalid.
 */
export function nullToNullBandwidth(f: ArrayLike<number>, mag: ArrayLike<number>, kind: SpectrumKind): Band {
  const n = mag.length;
  const p = argMax(mag);
  const peak = mag[p];
  if (!(peak > 0)) return INVALID;
  const isNull = (k: number) =>
    mag[k] <= mag[k - 1] && mag[k] <= mag[k + 1] && mag[k] < peak * 0.25 && mag[k + 1] > mag[k] * 1.02;
  let hi = NaN;
  for (let k = p + 1; k < n - 1; k++) {
    if (isNull(k)) {
      hi = f[k];
      break;
    }
  }
  if (!Number.isFinite(hi)) return { ...INVALID, note: 'no spectral nulls' };
  if (kind === 'baseband' || p === 0) return { low: 0, high: hi, width: hi, valid: true, note: 'DC → first null' };
  let lo = NaN;
  for (let k = p - 1; k >= 1; k--) {
    if (isNull(k)) {
      lo = f[k];
      break;
    }
  }
  if (!Number.isFinite(lo)) return { ...INVALID, note: 'no lower null' };
  return { low: lo, high: hi, width: hi - lo, valid: true };
}

export interface RmsBandwidth {
  centroid: number;
  sigma: number;
}

/**
 * RMS (Gabor) bandwidth σ_f from the energy spectrum |X(f)|².
 *  baseband: σ_f² = ∫ f² |X|² df / ∫ |X|² df over the full two-sided axis
 *            (centroid 0 for real signals).
 *  bandpass: computed on positive frequencies only (analytic-signal
 *            spectrum) about the centroid f̄ = ∫ f |X|² / ∫ |X|².
 * With σ_t defined from |x|² (baseband) or |z|² (bandpass, z analytic),
 * σ_t·σ_f ≥ 1/(4π), with equality only for Gaussian envelopes.
 */
export function rmsBandwidth(f: ArrayLike<number>, foldedPower: ArrayLike<number>, kind: SpectrumKind): RmsBandwidth {
  let s0 = 0;
  let s1 = 0;
  for (let k = 0; k < foldedPower.length; k++) {
    s0 += foldedPower[k];
    s1 += f[k] * foldedPower[k];
  }
  if (!(s0 > 0)) return { centroid: NaN, sigma: NaN };
  const c = kind === 'baseband' ? 0 : s1 / s0;
  let s2 = 0;
  for (let k = 0; k < foldedPower.length; k++) s2 += (f[k] - c) ** 2 * foldedPower[k];
  return { centroid: kind === 'baseband' ? 0 : c, sigma: Math.sqrt(s2 / s0) };
}

export interface CombLines {
  /** Median spacing between detected spectral lines (Hz), NaN if < 3 lines. */
  spacing: number;
  lineCount: number;
  /** Median line-to-valley ratio (dB): high for a sharp, coherent comb. */
  contrastDb: number;
  lines: number[];
}

/**
 * Detects discrete spectral lines by non-maximum suppression: a line is the
 * largest value within ±minSeparation and lies within `dbRange` of the global
 * peak. minSeparation (≈ PRF/2) suppresses the finite-train sidelobes that
 * surround each line. The line-to-valley contrast quantifies comb sharpness.
 */
export function detectCombLines(
  f: ArrayLike<number>,
  mag: ArrayLike<number>,
  minSeparationHz: number,
  dbRange = 20,
  maxLines = 2000,
): CombLines {
  const n = mag.length;
  const none = { spacing: NaN, lineCount: 0, contrastDb: NaN, lines: [] as number[] };
  if (n < 5) return none;
  const p = argMax(mag);
  const peak = mag[p];
  if (!(peak > 0)) return none;
  const df = f[1] - f[0];
  const w = Math.max(1, Math.floor(minSeparationHz / df));
  const thr = peak * 10 ** (-dbRange / 20);
  const idx: number[] = [];
  for (let k = 0; k < n && idx.length < maxLines; k++) {
    const v = mag[k];
    if (v < thr) continue;
    let isMax = true;
    for (let j = Math.max(0, k - w); j <= Math.min(n - 1, k + w); j++) {
      if (mag[j] > v || (mag[j] === v && j < k)) {
        isMax = false;
        break;
      }
    }
    if (isMax) idx.push(k);
  }
  // Parabolic interpolation of the log-magnitude peak gives sub-bin line positions.
  const lines = idx.map((k) => {
    if (k <= 0 || k >= n - 1) return f[k];
    const a = Math.log(Math.max(mag[k - 1], 1e-300));
    const b = Math.log(mag[k]);
    const c = Math.log(Math.max(mag[k + 1], 1e-300));
    const den = a - 2 * b + c;
    const delta = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    return f[k] + delta * df;
  });
  if (idx.length < 3) return { ...none, lineCount: idx.length, lines };
  const gaps: number[] = [];
  const contrast: number[] = [];
  for (let i = 1; i < idx.length; i++) {
    gaps.push(lines[i] - lines[i - 1]);
    let valley = Infinity;
    // Average valley level over the middle half between lines (robust to single deep nulls).
    const a = idx[i - 1] + Math.floor((idx[i] - idx[i - 1]) / 4);
    const b = idx[i] - Math.floor((idx[i] - idx[i - 1]) / 4);
    let s = 0;
    let c = 0;
    for (let j = a; j <= b; j++) {
      s += mag[j] * mag[j];
      c++;
      valley = Math.min(valley, mag[j]);
    }
    const rmsValley = Math.sqrt(s / Math.max(c, 1));
    contrast.push(20 * Math.log10(Math.min(mag[idx[i - 1]], mag[idx[i]]) / Math.max(rmsValley, 1e-300)));
  }
  const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  return { spacing: median(gaps), lineCount: idx.length, contrastDb: median(contrast), lines };
}

/**
 * −3 dB width of the strongest spectral line away from DC (f ≥ minFrequency),
 * measured as a two-edge (bandpass) band around that line.
 */
export function lineWidth(f: ArrayLike<number>, mag: ArrayLike<number>, minFrequency: number): Band {
  let p = -1;
  for (let k = 0; k < mag.length; k++) if (f[k] >= minFrequency && (p < 0 || mag[k] > mag[p])) p = k;
  if (p < 1) return INVALID;
  return bandAround(f, mag, p, 3, 'bandpass');
}
