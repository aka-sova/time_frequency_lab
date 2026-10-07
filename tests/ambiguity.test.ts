import { describe, expect, it } from 'vitest';
import { ambiguity, autoAmbiguitySpan, referenceSupport, type AmbiguityResult } from '@/lib/dsp/ambiguity';
import { analyzeCompression, type CompressionSettings } from '@/lib/dsp/compression';
import { generateSignal } from '@/lib/dsp/signals';
import { DEFAULT_EXPERIMENT, mergeExperiment } from '@/lib/presets/defaults';
import type { DeepPartial, Experiment, SignalConfig } from '@/types/signal';

const manual = (fs: number, n: number) => ({ mode: 'manual' as const, sampleRateHz: fs, sampleCount: n });

function rfPulse(signal: DeepPartial<SignalConfig> = {}): Experiment {
  return mergeExperiment(
    mergeExperiment(DEFAULT_EXPERIMENT, {
      signal: {
        signalType: 'burst',
        carrier: { enabled: true, frequencyHz: 1e9 },
        pulse: { enabled: true, envelope: 'rect', widthSec: 1e-6, edgesEnabled: false },
        repetition: { enabled: false },
        sampling: manual(4e9, 16384),
      },
    }),
    { signal },
  );
}

function compress(e: Experiment, s: Partial<CompressionSettings> = {}) {
  return analyzeCompression(generateSignal(e.signal), e.signal, { reference: 'pulse', weighting: 'rect', dopplerHz: 0, ...s });
}

const row = (a: AmbiguityResult, nu: number) => {
  let best = 0;
  for (let i = 0; i < a.nu.length; i++) if (Math.abs(a.nu[i] - nu) < Math.abs(a.nu[best] - nu)) best = i;
  return a.mag[best];
};
const at = (a: AmbiguityResult, r: Float32Array, tau: number) => {
  let best = 0;
  for (let i = 0; i < a.tau.length; i++) if (Math.abs(a.tau[i] - tau) < Math.abs(a.tau[best] - tau)) best = i;
  return r[best];
};
const argmax = (r: Float32Array) => r.reduce((b, v, i, arr) => (v > arr[b] ? i : b), 0);

describe('ambiguity function', () => {
  it('is normalized: χ(0, 0) = 1', () => {
    const c = compress(rfPulse());
    const a = ambiguity(c.reference.signal, { delaySpanSec: 1e-6, dopplerSpanHz: 4e6, support: referenceSupport(c.reference) });
    expect(a.peak).toBeCloseTo(1, 9);
    expect(row(a, 0)[argmax(row(a, 0))]).toBeCloseTo(1, 6);
  });

  it('has unit volume (Gaussian RF pulse, Doppler span covering the spectrum)', () => {
    const c = compress(rfPulse({ pulse: { envelope: 'gaussian', widthSec: 20e-9 } }));
    const a = ambiguity(c.reference.signal, { delaySpanSec: 100e-9, dopplerSpanHz: 300e6, dopplerPoints: 301, support: referenceSupport(c.reference) });
    expect(Math.abs(a.volume - 1)).toBeLessThan(0.02);
  });

  it('LFM: −13.3 dB delay sidelobes at ν = 0 and the ridge at τ = −ν/k with |χ| = 1 − |ν|/B', () => {
    const c = compress(rfPulse({ signalType: 'chirp', chirp: { enabled: true, startFrequencyHz: 0.95e9, endFrequencyHz: 1.05e9 } }));
    const a = ambiguity(c.reference.signal, { delaySpanSec: 1e-6, dopplerSpanHz: 100e6, dopplerPoints: 201, support: referenceSupport(c.reference) });
    const r0 = row(a, 0);
    const p0 = argmax(r0);
    expect(Math.abs(a.tau[p0])).toBeLessThan(2 * (a.tau[1] - a.tau[0]));
    // Highest value beyond the first null (1/B ≈ 1.13 τ_c): the first LFM sidelobe.
    let side = 0;
    for (let i = 0; i < r0.length; i++) if (Math.abs(a.tau[i]) > 1.2 * c.metrics.widthSec) side = Math.max(side, r0[i]);
    // The heatmap is band-limited to 99 % of the energy: sidelobe levels within ≈ 1 dB (exact values: compression tests).
    expect(Math.abs(20 * Math.log10(side) + 13.26)).toBeLessThan(1);
    const r20 = row(a, 20e6);
    const k = 100e6 / 1e-6;
    expect(Math.abs(a.tau[argmax(r20)] - -20e6 / k)).toBeLessThan(1.5 * (a.tau[1] - a.tau[0]));
    expect(r20[argmax(r20)]).toBeCloseTo(0.8, 1);
    expect(Math.abs(r20[argmax(r20)] - 0.8)).toBeLessThan(0.02);
  });

  it('rect RF pulse: the zero-delay cut |sinc(νT)| has its first null at 1/T', () => {
    const c = compress(rfPulse());
    const span = autoAmbiguitySpan(c);
    expect(span.dopplerSpanHz).toBeCloseTo(4e6, -3);
    const a = ambiguity(c.reference.signal, { ...span, support: referenceSupport(c.reference) });
    const mid = (a.nu.length - 1) / 2;
    let i = mid;
    while (i < a.nu.length - 1 && a.zeroDelay[i + 1] < a.zeroDelay[i]) i++;
    expect(Math.abs(a.nu[i] / 1e6 - 1)).toBeLessThan(0.03);
  });

  it('coherent train: bed of nails at (m·PRI, 0) with (N − |m|)/N and at (0, ±PRF)', () => {
    const e = rfPulse({
      signalType: 'pulse-train',
      pulse: { widthSec: 100e-9 },
      repetition: { enabled: true, prfHz: 2e6, pulseCount: 8 },
      coherence: { mode: 'coherent', reference: 'continuous' },
      sampling: manual(4e9, 32768),
    });
    const c = compress(e, { reference: 'train' });
    const span = autoAmbiguitySpan(c);
    expect(span.dopplerSpanHz).toBeCloseTo(5e6, -3);
    expect(span.delaySpanSec).toBeCloseTo(3.6e-6, 8);
    const a = ambiguity(c.reference.signal, { ...span, support: referenceSupport(c.reference) });
    const r0 = row(a, 0);
    for (const m of [1, 2, 3, -4]) expect(Math.abs(at(a, r0, m * 500e-9) - (8 - Math.abs(m)) / 8)).toBeLessThan(0.015); // 99 %-band resampling: ≈ 1 %
    const sinc = Math.sin(Math.PI * 0.2) / (Math.PI * 0.2);
    const cut = (nu: number) => a.zeroDelay[a.nu.findIndex((v) => Math.abs(v - nu) < 1)];
    expect(Math.abs(cut(2e6) - sinc)).toBeLessThan(0.005);
    expect(Math.abs(cut(-2e6) - sinc)).toBeLessThan(0.005);
    expect(cut(1e6)).toBeLessThan(0.05); // Doppler resolution of the burst: 1/(N·PRI) = 250 kHz → nulls between the nails
  });

  it('caps the resampled length', () => {
    const e = rfPulse({ signalType: 'pulse-train', pulse: { widthSec: 100e-9 }, repetition: { enabled: true, prfHz: 2e6, pulseCount: 8 }, sampling: manual(4e9, 32768) });
    const c = compress(e, { reference: 'train' });
    const a = ambiguity(c.reference.signal, { delaySpanSec: 1e-6, dopplerSpanHz: 10e9, dopplerPoints: 11, support: referenceSupport(c.reference) });
    expect(a.capped).toBe(true);
    expect(compress(rfPulse()).reference.signal.re.length).toBeGreaterThan(0);
  });
});
