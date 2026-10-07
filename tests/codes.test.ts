import { describe, expect, it } from 'vitest';
import { BARKER_LENGTHS, codePhases, snapCodeLength } from '@/lib/dsp/codes';

function aperiodicPeakSidelobe(ph: Float64Array): number {
  const L = ph.length;
  let pk = 0;
  for (let k = 1; k < L; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i + k < L; i++) {
      re += Math.cos(ph[i + k] - ph[i]);
      im += Math.sin(ph[i + k] - ph[i]);
    }
    pk = Math.max(pk, Math.hypot(re, im));
  }
  return pk;
}

function periodicPeakSidelobe(ph: Float64Array): number {
  const L = ph.length;
  let pk = 0;
  for (let k = 1; k < L; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < L; i++) {
      const d = ph[(i + k) % L] - ph[i];
      re += Math.cos(d);
      im += Math.sin(d);
    }
    pk = Math.max(pk, Math.hypot(re, im));
  }
  return pk;
}

describe('phase codes', () => {
  it.each(BARKER_LENGTHS.map((l) => [l]))('Barker-%i has aperiodic sidelobes ≤ 1', (L) => {
    const ph = codePhases('barker', L);
    expect(ph.length).toBe(L);
    expect(aperiodicPeakSidelobe(ph)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('Barker-13 peak sidelobe ratio is 1/13 (−22.28 dB)', () => {
    expect(20 * Math.log10(aperiodicPeakSidelobe(codePhases('barker', 13)) / 13)).toBeCloseTo(-22.28, 2);
  });

  it.each([4, 9, 16, 64, 100])('Frank L=%i has zero periodic autocorrelation sidelobes', (L) => {
    const ph = codePhases('frank', L);
    expect(ph.length).toBe(L);
    expect(periodicPeakSidelobe(ph)).toBeLessThan(1e-9 * L);
  });

  it.each([2, 7, 16, 64, 255])('P4 L=%i has zero periodic autocorrelation sidelobes', (L) => {
    const ph = codePhases('p4', L);
    expect(ph.length).toBe(L);
    expect(periodicPeakSidelobe(ph)).toBeLessThan(1e-9 * L);
  });

  it('P4-64 aperiodic PSLR ≈ −24.4 dB', () => {
    expect(20 * Math.log10(aperiodicPeakSidelobe(codePhases('p4', 64)) / 64)).toBeCloseTo(-24.36, 1);
  });

  it('snaps lengths per family', () => {
    expect(snapCodeLength('barker', 12.4)).toBe(13);
    expect(snapCodeLength('barker', 12)).toBe(11); // equidistant from 11 and 13
    expect(snapCodeLength('barker', 6)).toBe(5); // ties go to the shorter code
    expect(snapCodeLength('barker', 1)).toBe(2);
    expect(snapCodeLength('barker', NaN)).toBe(13);
    expect(snapCodeLength('frank', 50)).toBe(49);
    expect(snapCodeLength('frank', 2)).toBe(4);
    expect(snapCodeLength('frank', 500)).toBe(100);
    expect(snapCodeLength('p4', 1)).toBe(2);
    expect(snapCodeLength('p4', 70.4)).toBe(70);
    expect(snapCodeLength('p4', 999)).toBe(256);
  });
});
