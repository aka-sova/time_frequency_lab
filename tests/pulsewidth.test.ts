import { describe, expect, it } from 'vitest';
import { pulseWidth } from '@/lib/dsp/pulsewidth';

const fs = 200e9;
const sigma = 0.5e-9;
const n = 8192;
const t = Float64Array.from({ length: n }, (_, i) => i / fs);
const t0 = n / 2 / fs;
const gauss = Float64Array.from(t, (v) => Math.exp(-0.5 * ((v - t0) / sigma) ** 2));
const mono = Float64Array.from(t, (v) => {
  const u = (v - t0) / sigma;
  return u * Math.exp(0.5) * Math.exp(-0.5 * u * u);
});

describe('pulseWidth on a Gaussian (E8)', () => {
  it('amplitude FWHM = 2√(2 ln2)σ', () => {
    const r = pulseWidth(t, gauss, { basis: 'amplitude', startPct: 50, endPct: 50 });
    expect(r.valid).toBe(true);
    expect(r.width / (2 * Math.sqrt(2 * Math.LN2) * sigma)).toBeCloseTo(1, 3);
  });
  it('power FWHM = 2√(ln2)σ', () => {
    const r = pulseWidth(t, gauss, { basis: 'power', startPct: 50, endPct: 50 });
    expect(r.width / (2 * Math.sqrt(Math.LN2) * sigma)).toBeCloseTo(1, 3);
  });
  it('central 90 % of the energy (5→95 %) = 2.32617σ and holds 90 % of E', () => {
    const r = pulseWidth(t, gauss, { basis: 'energy', startPct: 5, endPct: 95 });
    expect(r.width / (2.3261743 * sigma)).toBeCloseTo(1, 3);
    expect(r.energyFraction).toBeCloseTo(0.9, 3);
  });
});

describe('pulseWidth on a bipolar monocycle', () => {
  it('central picks the lobe around the (first) peak; outer spans both lobes', () => {
    const c = pulseWidth(t, mono, { basis: 'amplitude', startPct: 50, endPct: 50, scope: 'central' });
    const o = pulseWidth(t, mono, { basis: 'amplitude', startPct: 50, endPct: 50, scope: 'outer' });
    // 50 % crossings of u·e^{(1−u²)/2}: u = 0.31911 and 1.92162
    expect(c.width / ((1.9216229 - 0.3191057) * sigma)).toBeCloseTo(1, 2);
    expect(o.width / (2 * 1.9216229 * sigma)).toBeCloseTo(1, 2);
  });
});

describe('pulseWidth validation', () => {
  it('rejects out-of-range percentages', () => {
    const r = pulseWidth(t, gauss, { basis: 'amplitude', startPct: -1, endPct: 50 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/0 and 100/);
  });
  it('energy basis needs end > start', () => {
    const r = pulseWidth(t, gauss, { basis: 'energy', startPct: 60, endPct: 40 });
    expect(r.valid).toBe(false);
  });
  it('a 0 % amplitude level is never crossed', () => {
    const r = pulseWidth(t, gauss, { basis: 'amplitude', startPct: 0, endPct: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/crossing/i);
  });
  it('all-zero waveform is invalid, not NaN-valid', () => {
    expect(pulseWidth(t, new Float64Array(n), { basis: 'power', startPct: 50, endPct: 50 }).valid).toBe(false);
  });
});
