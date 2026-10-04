import { describe, expect, it } from 'vitest';
import { RISE_BW_PRODUCT, SINGLE_POLE_RISE_BW_PRODUCT, combineRise, extractRise, powerUncertainty, riseFromBandwidth } from '@/lib/dsp/budget';
import { lowpassFirstOrder } from '@/lib/dsp/instrument';

describe('rise-time budget (E3, E6)', () => {
  it('constants', () => {
    expect(RISE_BW_PRODUCT).toBe(0.35);
    expect(SINGLE_POLE_RISE_BW_PRODUCT).toBeCloseTo(0.3497, 4);
  });
  it('0.35/BW and quadrature sum', () => {
    expect(riseFromBandwidth(1e9)).toBeCloseTo(0.35e-9, 15);
    expect(combineRise([1e-9, riseFromBandwidth(1e9), riseFromBandwidth(2e9)])).toBeCloseTo(Math.hypot(1e-9, 0.35e-9, 0.175e-9), 18);
  });
  it('extraction by square subtraction is NaN when the instrument dominates', () => {
    expect(extractRise(1.2e-9, 0.5e-9)).toBeCloseTo(Math.sqrt(1.2e-9 ** 2 - 0.5e-9 ** 2), 18);
    expect(extractRise(0.5e-9, 0.6e-9)).toBeNaN();
  });
  it('DOCUMENTS the limit: quadrature under-estimates two identical single poles by ≈ 8 %', () => {
    const fs = 200e9;
    const tau = 1e-9;
    const n = 6000;
    const step = Float64Array.from({ length: n }, (_, i) => (i >= 5 ? 1 : 0));
    const y = lowpassFirstOrder(lowpassFirstOrder(step, 1 / fs, tau), 1 / fs, tau);
    const cross = (lvl: number) => {
      for (let i = 1; i < n; i++) if (y[i - 1] < lvl && y[i] >= lvl) return (i - 1 + (lvl - y[i - 1]) / (y[i] - y[i - 1])) / fs;
      return NaN;
    };
    const exact = cross(0.9) - cross(0.1);
    const quad = Math.SQRT2 * Math.log(9) * tau;
    expect(exact / quad).toBeGreaterThan(1.07);
    expect(exact / quad).toBeLessThan(1.09);
  });
});

describe('power uncertainty (E7)', () => {
  it('3 % voltage, 1 % load → u = 6.083 %, U(k=2) = 12.166 %', () => {
    const u = powerUncertainty(3, 1);
    expect(u.relStdPct).toBeCloseTo(6.0828, 3);
    expect(u.relExpandedPct).toBeCloseTo(12.1655, 3);
    expect(u.low).toBeCloseTo(2 * (1 - 0.121655), 4);
    expect(u.high).toBeCloseTo(2 * (1 + 0.121655), 4);
  });
  it('is dominated by the voltage term (factor 2 from squaring)', () => {
    expect(powerUncertainty(1, 0).relStdPct).toBeCloseTo(2, 12);
    expect(powerUncertainty(0, 1).relStdPct).toBeCloseTo(1, 12);
  });
});
