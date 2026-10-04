/**
 * Power and energy of a sampled waveform in physical units (React-free).
 *
 *   resistive load:  P(t) = v²(t)/R          E = ∫ P dt            [W], [J]
 *   free space:      S(t) = E²(t)/η₀         fluence = ∫ S dt      [W/m²], [J/m²]
 *
 * The free-space relation holds for a plane wave far from the source; it is
 * not the radiated power of any particular antenna.
 */
import type { AmplitudeUnit } from '@/types/signal';

/** Impedance of free space, CODATA 2022 (Ω). */
export const ETA0 = 376.730313412;

export interface PowerContext {
  quantity: 'load' | 'field';
  /** Load resistance R, or η₀ for a field (Ω). */
  impedance: number;
  amplitudeUnit: 'V' | 'V/m';
  powerUnit: 'W' | 'W/m²';
  energyUnit: 'J' | 'J/m²';
}

/** Null for normalized amplitudes (no physical interpretation). */
export function powerContext(unit: AmplitudeUnit, resistanceOhm: number): PowerContext | null {
  if (unit === 'V') return { quantity: 'load', impedance: resistanceOhm, amplitudeUnit: 'V', powerUnit: 'W', energyUnit: 'J' };
  if (unit === 'V/m') return { quantity: 'field', impedance: ETA0, amplitudeUnit: 'V/m', powerUnit: 'W/m²', energyUnit: 'J/m²' };
  return null;
}

/** ∫ y dt on a uniform grid (trapezoid rule). */
export function trapezoid(y: ArrayLike<number>, dt: number): number {
  const n = y.length;
  if (n < 2) return 0;
  let s = 0.5 * (y[0] + y[n - 1]);
  for (let i = 1; i < n - 1; i++) s += y[i];
  return s * dt;
}

export interface EnergyStats {
  /** max |x| (V or V/m). */
  peak: number;
  /** peak² / Z. */
  peakPower: number;
  /** ∫ x²/Z dt (J or J/m²). */
  energy: number;
  /** E / P_peak — width of the rectangle with equal peak power and energy (s). */
  equivalentWidth: number;
  /** ∫ x dt (V·s or V·s/m): zero for a DC-free pulse such as a monocycle. */
  netArea: number;
}

export function energyStats(x: ArrayLike<number>, fs: number, z: number): EnergyStats {
  const n = x.length;
  const sq = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    sq[i] = x[i] * x[i];
    peak = Math.max(peak, Math.abs(x[i]));
  }
  const dt = 1 / fs;
  const energy = trapezoid(sq, dt) / z;
  const peakPower = (peak * peak) / z;
  return { peak, peakPower, energy, equivalentWidth: peakPower > 0 ? energy / peakPower : NaN, netArea: trapezoid(x, dt) };
}

/** Time between the first and last sample with |x| > rel·peak (0 if none). */
export function supportSpan(x: ArrayLike<number>, fs: number, rel = 1e-6): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (!(peak > 0)) return 0;
  const thr = rel * peak;
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) <= thr) a++;
  while (b > a && Math.abs(x[b]) <= thr) b--;
  return (b - a) / fs;
}

/**
 * Superposes copies of x shifted by multiples of `period` onto one period:
 *   y(τ) = Σ_k x(τ + kT),  0 ≤ τ < T
 * on a grid of m = ⌈T·fs⌉ points (linear interpolation of x).
 */
export function foldPeriodic(x: ArrayLike<number>, fs: number, period: number): { y: Float64Array; dt: number } {
  const m = Math.max(2, Math.ceil(period * fs - 1e-9));
  const dt = period / m;
  const last = (x.length - 1) / fs;
  const y = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    for (let k = 0; ; k++) {
      const u = j * dt + k * period;
      if (u > last + 1e-15) break;
      const pos = u * fs;
      const i = Math.min(Math.floor(pos + 1e-9), x.length - 1);
      const frac = pos - i;
      sum += i + 1 < x.length && frac > 1e-9 ? x[i] + (x[i + 1] - x[i]) * frac : x[i];
    }
    y[j] = sum;
  }
  return { y, dt };
}

export interface PeriodicStats {
  period: number;
  /** True when copies of the pulse overlap in time (P_avg ≠ E·PRF). */
  overlap: boolean;
  peak: number;
  peakPower: number;
  energyPerPeriod: number;
  averagePower: number;
  /** peakPower / averagePower. */
  peakToAverage: number;
}

/**
 * Peak and average power of the pulse repeated at `prf`. Without overlap
 * this is E·PRF; with overlap the copies are summed (amplitudes add) first.
 */
export function periodicStats(x: ArrayLike<number>, fs: number, prf: number, z: number): PeriodicStats {
  const period = Math.max(1 / prf, 2 / fs); // never fold below two samples per period
  const single = energyStats(x, fs, z);
  const span = supportSpan(x, fs);
  if (!(period < span)) {
    const averagePower = single.energy / period;
    return { period, overlap: false, peak: single.peak, peakPower: single.peakPower, energyPerPeriod: single.energy, averagePower, peakToAverage: averagePower > 0 ? single.peakPower / averagePower : NaN };
  }
  const { y, dt } = foldPeriodic(x, fs, period);
  let sum = 0;
  let peak = 0;
  for (let j = 0; j < y.length; j++) {
    sum += y[j] * y[j];
    peak = Math.max(peak, Math.abs(y[j]));
  }
  const energyPerPeriod = (sum * dt) / z;
  const averagePower = energyPerPeriod / period;
  const peakPower = (peak * peak) / z;
  return { period, overlap: true, peak, peakPower, energyPerPeriod, averagePower, peakToAverage: averagePower > 0 ? peakPower / averagePower : NaN };
}
