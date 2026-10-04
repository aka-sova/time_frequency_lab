/**
 * Pulse width under several definitions (React-free). Percentages refer to the
 * absolute sample peak (amplitude, power) or to the cumulative energy.
 *
 *   amplitude: |x|/peak          power: (x/peak)²          energy: ∫x² / E_total
 *
 * 'central' takes the rising crossing closest to (before) the first absolute
 * peak and the first falling crossing after it, i.e. the width of the main
 * lobe. 'outer' takes the first rising and the last falling crossing, which
 * spans every lobe of a multi-lobe pulse.
 */
export type WidthBasis = 'amplitude' | 'power' | 'energy';
export type EdgeScope = 'central' | 'outer';

export interface WidthOptions {
  basis: WidthBasis;
  startPct: number;
  endPct: number;
  scope?: EdgeScope;
}

export interface WidthResult {
  valid: boolean;
  start: number;
  end: number;
  width: number;
  /** Fraction of the total energy between start and end. */
  energyFraction: number;
  error?: string;
}

const fail = (error: string): WidthResult => ({ valid: false, start: NaN, end: NaN, width: NaN, energyFraction: NaN, error });

function cumulativeEnergy(t: ArrayLike<number>, x: ArrayLike<number>): Float64Array {
  const c = new Float64Array(x.length);
  for (let i = 1; i < x.length; i++) c[i] = c[i - 1] + 0.5 * (x[i - 1] * x[i - 1] + x[i] * x[i]) * (t[i] - t[i - 1]);
  return c;
}

/** Linear interpolation of y(t) at tq (clamped to the ends). */
function valueAt(t: ArrayLike<number>, y: ArrayLike<number>, tq: number): number {
  if (tq <= t[0]) return y[0];
  const last = t.length - 1;
  if (tq >= t[last]) return y[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < tq) lo = mid;
    else hi = mid;
  }
  return y[lo] + ((y[hi] - y[lo]) * (tq - t[lo])) / (t[hi] - t[lo]);
}

/** Time at which a nondecreasing y reaches `level`. */
function timeAt(t: ArrayLike<number>, y: ArrayLike<number>, level: number): number {
  const last = t.length - 1;
  if (level <= y[0]) return t[0];
  if (level >= y[last]) return t[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (y[mid] < level) lo = mid;
    else hi = mid;
  }
  const d = y[hi] - y[lo];
  return d > 0 ? t[lo] + ((level - y[lo]) / d) * (t[hi] - t[lo]) : t[hi];
}

export function pulseWidth(t: ArrayLike<number>, x: ArrayLike<number>, o: WidthOptions): WidthResult {
  const { basis, startPct, endPct } = o;
  const scope = o.scope ?? 'central';
  if (![startPct, endPct].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) return fail('Percentages must be between 0 and 100.');
  if (x.length < 3 || t.length !== x.length) return fail('Not enough samples.');

  let peak = 0;
  let peakIdx = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) {
      peak = a;
      peakIdx = i;
    }
  }
  if (!(peak > 0)) return fail('The waveform is identically zero.');

  const cum = cumulativeEnergy(t, x);
  const total = cum[cum.length - 1];
  let start: number;
  let end: number;

  if (basis === 'energy') {
    if (endPct <= startPct) return fail('For cumulative energy the end percentage must exceed the start percentage.');
    start = timeAt(t, cum, (total * startPct) / 100);
    end = timeAt(t, cum, (total * endPct) / 100);
  } else {
    const level = (i: number) => (basis === 'power' ? (x[i] / peak) ** 2 * 100 : (Math.abs(x[i]) / peak) * 100);
    const tPeak = t[peakIdx];
    const rising: number[] = [];
    const falling: number[] = [];
    const cross = (i: number, target: number) => {
      const a = level(i);
      const b = level(i + 1);
      return t[i] + ((target - a) / (b - a)) * (t[i + 1] - t[i]);
    };
    const eps = 1e-10 * Math.abs(t[t.length - 1] - t[0]);
    for (let i = 0; i < x.length - 1; i++) {
      const a = level(i);
      const b = level(i + 1);
      if (a < startPct && b >= startPct) {
        const tc = cross(i, startPct);
        if (tc <= tPeak + eps) rising.push(tc);
      }
      if (a >= endPct && b < endPct) {
        const tc = cross(i, endPct);
        if (tc >= tPeak - eps) falling.push(tc);
      }
    }
    if (!rising.length || !falling.length) return fail('No complete level crossing inside the record (a 0 % level is never crossed — use a small positive level).');
    start = scope === 'central' ? rising[rising.length - 1] : rising[0];
    end = scope === 'central' ? falling[0] : falling[falling.length - 1];
  }

  const eStart = valueAt(t, cum, start);
  const eEnd = valueAt(t, cum, end);
  return { valid: true, start, end, width: Math.max(0, end - start), energyFraction: total > 0 ? Math.max(0, eEnd - eStart) / total : NaN };
}
