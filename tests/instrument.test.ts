import { describe, expect, it } from 'vitest';
import { activeRange, gaussianAverage, interpolateCubic, lowpassFirstOrder, simulateInstrument, type InstrumentSettings } from '@/lib/dsp/instrument';

// Numerical Recipes erfc (|rel err| < 1.2e-7) — oracle only.
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** Closed form (E4): unit-peak Gaussian exp(−t²/2σ²) through a single pole. */
function gaussThroughRc(t: number, sigma: number, tau: number): number {
  return ((sigma * Math.sqrt(2 * Math.PI)) / (2 * tau)) * Math.exp((sigma * sigma) / (2 * tau * tau) - t / tau) * erfc((sigma / tau - t / sigma) / Math.SQRT2);
}

const sigma = 0.5e-9;
const bw = 0.3e9;
const tau = 1 / (2 * Math.PI * bw);

function gaussianRecord(fs: number, n: number, center: number) {
  return Float64Array.from({ length: n }, (_, i) => Math.exp(-0.5 * ((i / fs - center) / sigma) ** 2));
}

describe('lowpassFirstOrder (E3/E4)', () => {
  it('is exact for a ramp: y = t − τ(1 − e^{−t/τ}) at any dt/τ', () => {
    const dt = 3 * tau; // deliberately coarse
    const x = Float64Array.from({ length: 12 }, (_, i) => i * dt);
    const y = lowpassFirstOrder(x, dt, tau);
    for (let i = 0; i < x.length; i++) {
      const t = i * dt;
      expect(Math.abs(y[i] - (t - tau * (1 - Math.exp(-t / tau)))) / dt).toBeLessThan(1e-12);
    }
  });
  it('Gaussian through RC matches the erfc closed form (max err < 5e-6)', () => {
    const fs = 470e9; // dt ≈ 2.13 ps
    const n = 4096;
    const c = 3e-9;
    const y = lowpassFirstOrder(gaussianRecord(fs, n, c), 1 / fs, tau);
    let worst = 0;
    for (let i = 0; i < n; i += 7) worst = Math.max(worst, Math.abs(y[i] - gaussThroughRc(i / fs - c, sigma, tau)));
    expect(worst).toBeLessThan(5e-6);
  });
  it('10–90 % step rise time is ln9·τ = 0.3497/BW', () => {
    const fs = 100e9;
    const n = 4000;
    const x = Float64Array.from({ length: n }, (_, i) => (i >= 10 ? 1 : 0));
    const y = lowpassFirstOrder(x, 1 / fs, tau);
    const cross = (lvl: number) => {
      for (let i = 1; i < n; i++) if (y[i - 1] < lvl && y[i] >= lvl) return (i - 1 + (lvl - y[i - 1]) / (y[i] - y[i - 1])) / fs;
      return NaN;
    };
    expect((cross(0.9) - cross(0.1)) * bw).toBeCloseTo(Math.log(9) / (2 * Math.PI), 2);
  });
});

describe('gaussianAverage (E5)', () => {
  it('a Gaussian averaged with σ_j has peak σ/√(σ²+σ_j²)', () => {
    const fs = 100e9;
    const n = 4096;
    const sj = 0.25e-9;
    const y = gaussianAverage(gaussianRecord(fs, n, 20e-9), 1 / fs, sj);
    const peak = Math.max(...y);
    expect(peak).toBeCloseTo(sigma / Math.hypot(sigma, sj), 4); // 0.894427
  });
  it('σ_j = 0 returns a copy', () => {
    const x = Float64Array.from([1, 2, 3]);
    const y = gaussianAverage(x, 1, 0);
    expect(Array.from(y)).toEqual([1, 2, 3]);
    expect(y).not.toBe(x);
  });
  it('preserves area (DC gain 1)', () => {
    const fs = 100e9;
    const x = gaussianRecord(fs, 4096, 20e-9);
    const sum = (a: ArrayLike<number>) => Array.from(a).reduce((p, v) => p + v, 0);
    expect(sum(gaussianAverage(x, 1 / fs, 0.4e-9)) / sum(x)).toBeCloseTo(1, 9);
  });
});

describe('interpolateCubic', () => {
  it('reproduces a sampled sine to < 1e-3 at 32× oversampling', () => {
    const y = Float64Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * i) / 32));
    let worst = 0;
    for (let pos = 4; pos < 250; pos += 0.37) worst = Math.max(worst, Math.abs(interpolateCubic(y, pos) - Math.sin((2 * Math.PI * pos) / 32)));
    expect(worst).toBeLessThan(1e-3);
  });
  it('clamps outside the record', () => {
    const y = Float64Array.from([5, 6, 7]);
    expect(interpolateCubic(y, -3)).toBe(5);
    expect(interpolateCubic(y, 9)).toBe(7);
  });
});

describe('activeRange', () => {
  it('finds the first and last significant samples', () => {
    const x = new Float64Array(100);
    x[30] = 1;
    x[60] = -0.5;
    expect(activeRange(x, 1e-3)).toEqual([30, 60]);
  });
});

describe('simulateInstrument', () => {
  const fs = 100e9;
  const n = 4096;
  const x = gaussianRecord(fs, n, 20e-9);
  const base: InstrumentSettings = { bandwidthHz: 50e9, sampleRateHz: 100e9, samplePhasePct: 0, triggerJitterRmsSec: 0, clipEnabled: false, clipRatio: 1.2 };

  it('a wide instrument leaves the pulse essentially unchanged', () => {
    const r = simulateInstrument(x, fs, base);
    expect(Math.abs(r.metrics.peakErrorDisplayedPct)).toBeLessThan(1);
    expect(r.metrics.fwhmDisplayed / r.metrics.fwhmTrue).toBeCloseTo(1, 1);
  });

  it('300 MHz bandwidth: displayed peak equals the closed form maximum (−23 % vs true)', () => {
    const r = simulateInstrument(x, fs, { ...base, bandwidthHz: bw });
    let ref = 0;
    for (let i = 0; i < n; i++) ref = Math.max(ref, gaussThroughRc(i / fs - 20e-9, sigma, tau));
    expect(r.metrics.peakDisplayed / ref).toBeCloseTo(1, 3);
    expect(r.metrics.peakErrorDisplayedPct).toBeCloseTo(-23.0, 0);
    expect(r.metrics.fwhmDisplayed / r.metrics.fwhmTrue).toBeCloseTo(1.25, 1);
  });

  it('trigger jitter widens and lowers the displayed pulse', () => {
    const a = simulateInstrument(x, fs, base);
    const b = simulateInstrument(x, fs, { ...base, triggerJitterRmsSec: 0.5e-9 });
    expect(b.metrics.peakDisplayed).toBeLessThan(a.metrics.peakDisplayed * 0.8);
    expect(b.metrics.fwhmDisplayed).toBeGreaterThan(a.metrics.fwhmDisplayed * 1.3);
  });

  it('coarse sampling can miss the peak, and sample phase changes the answer', () => {
    const slow = { ...base, sampleRateHz: 1e9 }; // 1 ns sample period vs 1.18 ns FWHM
    const onPeak = simulateInstrument(x, fs, { ...slow, samplePhasePct: 0 });
    const offPeak = simulateInstrument(x, fs, { ...slow, samplePhasePct: 50 });
    expect(onPeak.metrics.peakSampled).toBeLessThanOrEqual(onPeak.metrics.peakDisplayed + 1e-12);
    expect(Math.abs(onPeak.metrics.peakSampled - offPeak.metrics.peakSampled)).toBeGreaterThan(1e-3);
    expect(Math.min(onPeak.metrics.peakSampled, offPeak.metrics.peakSampled)).toBeLessThan(0.95 * onPeak.metrics.peakTrue);
  });

  it('ADC clip limits every sample to clipRatio × true peak', () => {
    const r = simulateInstrument(x, fs, { ...base, clipEnabled: true, clipRatio: 0.5 });
    for (const v of r.sampleV) expect(Math.abs(v)).toBeLessThanOrEqual(0.5 * r.metrics.peakTrue + 1e-12);
    expect(r.metrics.peakSampled).toBeCloseTo(0.5 * r.metrics.peakTrue, 9);
  });

  it('reports τ and the single-pole rise time', () => {
    const r = simulateInstrument(x, fs, { ...base, bandwidthHz: 1e9 });
    expect(r.tau).toBeCloseTo(1 / (2 * Math.PI * 1e9), 18);
    expect(r.riseTimeFilter * 1e9).toBeCloseTo(0.3497, 3);
  });
});
