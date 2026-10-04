import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPERIMENT, mergeExperiment } from '@/lib/presets/defaults';
import { generateSignal } from '@/lib/dsp/signals';
import { ETA0, energyStats, foldPeriodic, periodicStats, powerContext, supportSpan, trapezoid } from '@/lib/dsp/power';
import type { DeepPartial, Experiment } from '@/types/signal';

const exp = (p: DeepPartial<Experiment>) => mergeExperiment(DEFAULT_EXPERIMENT, p);
// Gaussian with σ = 0.5 ns  →  FWHM = 2√(2 ln2)·σ
const FWHM_05 = 2 * Math.sqrt(2 * Math.LN2) * 0.5e-9;

function gaussian10V() {
  const e = exp({
    signal: {
      signalType: 'gaussian',
      amplitude: 10,
      amplitudeUnit: 'V',
      carrier: { enabled: false },
      pulse: { envelope: 'gaussian', widthSec: FWHM_05 },
      repetition: { enabled: false },
      sampling: { mode: 'manual', sampleRateHz: 100e9, sampleCount: 4096 },
    },
  });
  return generateSignal(e.signal);
}

describe('powerContext', () => {
  it('maps amplitude units to physics', () => {
    expect(powerContext('normalized', 50)).toBeNull();
    expect(powerContext('V', 75)).toMatchObject({ quantity: 'load', impedance: 75, powerUnit: 'W', energyUnit: 'J' });
    expect(powerContext('V/m', 75)).toMatchObject({ quantity: 'field', impedance: ETA0, powerUnit: 'W/m²', energyUnit: 'J/m²' });
  });
  it('uses the CODATA-2022 impedance of free space', () => {
    expect(ETA0).toBeCloseTo(376.730313412, 9);
  });
});

describe('trapezoid', () => {
  it('integrates a ramp exactly', () => {
    const y = Float64Array.from({ length: 11 }, (_, i) => i); // 0..10, dt=1  → ∫ = 50
    expect(trapezoid(y, 1)).toBeCloseTo(50, 12);
  });
});

describe('energyStats — E1 (Gaussian into 50 Ω)', () => {
  it('peak power 2 W, energy A²σ√π/R = 1.77245 nJ', () => {
    const sig = gaussian10V();
    const s = energyStats(sig.singlePulse, sig.fs, 50);
    expect(s.peak).toBeCloseTo(10, 6);
    expect(s.peakPower).toBeCloseTo(2, 6);
    expect(s.energy / 1.7724538509e-9).toBeCloseTo(1, 4);
    expect(s.equivalentWidth / (0.5e-9 * Math.sqrt(Math.PI))).toBeCloseTo(1, 4); // E/Ppk = σ√π
    expect(s.netArea / (10 * 0.5e-9 * Math.sqrt(2 * Math.PI))).toBeCloseTo(1, 4); // ∫A·exp(−t²/2σ²) = Aσ√(2π)
  });
  it('average power at 100 kHz is 177.245 µW', () => {
    const sig = gaussian10V();
    const p = periodicStats(sig.singlePulse, sig.fs, 100e3, 50);
    expect(p.overlap).toBe(false);
    expect(p.averagePower / 177.245385e-6).toBeCloseTo(1, 4);
  });
});

describe('energyStats — E2 (free space)', () => {
  it('10 V/m peak → S_pk = 0.265442 W/m²', () => {
    const peakS = (10 * 10) / ETA0;
    expect(peakS).toBeCloseTo(0.265442, 6);
    const n = 4000;
    const x = Float64Array.from({ length: n }, (_, i) => 10 * Math.sin((2 * Math.PI * i * 40) / n)); // 40 whole periods
    const s = energyStats(x, 1e9, ETA0);
    expect(s.peakPower).toBeCloseTo(peakS, 5);
    // sinusoid: <S> = peak/2
    expect(s.energy / (n / 1e9) / (peakS / 2)).toBeCloseTo(1, 3);
  });
});

describe('monocycle', () => {
  it('has (numerically) zero net area, unlike a Gaussian', () => {
    const e = exp({
      signal: {
        signalType: 'gaussian-derivative',
        amplitude: 10,
        amplitudeUnit: 'V',
        carrier: { enabled: false },
        pulse: { envelope: 'gaussian-d1', widthSec: FWHM_05 },
        repetition: { enabled: false },
        sampling: { mode: 'manual', sampleRateHz: 100e9, sampleCount: 4096 },
      },
    });
    const sig = generateSignal(e.signal);
    const s = energyStats(sig.singlePulse, sig.fs, 50);
    expect(Math.abs(s.netArea)).toBeLessThan(1e-6 * 10 * 1e-9);
    expect(s.peak).toBeCloseTo(10, 1); // monocycle normalised to peak 1
  });
});

describe('supportSpan / foldPeriodic / periodicStats', () => {
  const fs = 10e9;
  const rect = (len: number, lead: number, total: number) => Float64Array.from({ length: total }, (_, i) => (i >= lead && i < lead + len ? 1 : 0));

  it('supportSpan measures first→last significant sample', () => {
    expect(supportSpan(rect(100, 20, 200), fs)).toBeCloseTo(99 / fs, 15);
    expect(supportSpan(new Float64Array(10), fs)).toBe(0);
  });

  it('folds two overlapping copies of a rectangle into a constant 2', () => {
    const x = rect(100, 20, 200); // 10 ns wide
    const { y, dt } = foldPeriodic(x, fs, 5e-9); // period 5 ns → 2 copies overlap everywhere
    expect(y.length).toBe(50);
    expect(dt).toBeCloseTo(0.1e-9, 18);
    for (const v of y) expect(v).toBeCloseTo(2, 12);
  });

  it('overlap: mean power = (2 V)²/1 Ω = 4 W; peak 2 V; E·PRF would be wrong (2 W)', () => {
    const x = rect(100, 20, 200);
    const p = periodicStats(x, fs, 1 / 5e-9, 1);
    expect(p.overlap).toBe(true);
    expect(p.peak).toBeCloseTo(2, 12);
    expect(p.averagePower).toBeCloseTo(4, 9);
    const naive = energyStats(x, fs, 1).energy / 5e-9;
    expect(naive).toBeLessThan(p.averagePower); // cross terms matter
  });

  it('matches a brute-force sum of many shifted copies', () => {
    const base = Float64Array.from({ length: 200 }, (_, i) => Math.exp(-0.5 * ((i - 100) / 25) ** 2)); // wide Gaussian
    const period = 80; // samples
    const total = 80 * 40;
    const long = new Float64Array(total + 400);
    for (let k = 0; k < 40; k++) for (let i = 0; i < base.length; i++) long[k * period + i] += base[i];
    // mean of long² over 20 whole periods well inside the train
    let acc = 0;
    for (let i = 8 * period; i < 28 * period; i++) acc += long[i] * long[i];
    const brute = acc / (20 * period);
    const p = periodicStats(base, 1, 1 / period, 1); // fs = 1 sample/s → time unit = samples
    expect(p.overlap).toBe(true);
    expect(p.averagePower / brute).toBeCloseTo(1, 9);
  });

  it('caps absurd PRF so cost stays bounded', () => {
    const x = rect(100, 20, 200);
    const p = periodicStats(x, fs, 1e15, 1);
    expect(Number.isFinite(p.averagePower)).toBe(true);
  });
});
