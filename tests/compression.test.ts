import { describe, expect, it } from 'vitest';
import { analyzeCompression, type CompressionSettings } from '@/lib/dsp/compression';
import { generateSignal } from '@/lib/dsp/signals';
import { makeWindow, windowStats } from '@/lib/dsp/windows';
import { DEFAULT_EXPERIMENT, mergeExperiment } from '@/lib/presets/defaults';
import type { DeepPartial, Experiment, SignalConfig } from '@/types/signal';

const manual = (fs: number, n: number) => ({ mode: 'manual' as const, sampleRateHz: fs, sampleCount: n });
const db = (x: number) => 20 * Math.log10(x);

/** 1 µs rectangular RF pulse at 1 GHz, 4 GS/s, 16384 samples (4.1 µs record). */
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

const lfm = (f1: number, f2: number, signal: DeepPartial<SignalConfig> = {}) =>
  rfPulse({ signalType: 'chirp', chirp: { enabled: true, startFrequencyHz: f1, endFrequencyHz: f2 }, ...signal });

function run(e: Experiment, s: Partial<CompressionSettings> = {}) {
  return analyzeCompression(generateSignal(e.signal), e.signal, { reference: 'pulse', weighting: 'rect', dopplerHz: 0, ...s });
}

describe('matched filter: single pulses', () => {
  it('rect RF pulse: triangle output, τ_c = (2 − √2)·τ, no compression', () => {
    const r = run(rfPulse());
    expect(r.mag[r.metrics.peakIndex]).toBeCloseTo(1, 6);
    expect(r.metrics.peakDelay).toBeCloseTo(0, 12);
    expect(Math.abs(r.metrics.widthSec / ((2 - Math.SQRT2) * 1e-6) - 1)).toBeLessThan(0.01);
    expect(r.metrics.ratio).toBeCloseTo(1 / (2 - Math.SQRT2), 1);
    expect(r.metrics.pslrDb).toBeLessThan(-30);
    expect(r.metrics.tb).toBeNull();
    // Base of the triangle is 2τ: half amplitude at |τ| = τ/2.
    const half = r.mag[r.metrics.peakIndex + 2000];
    expect(half).toBeCloseTo(0.5, 2);
  });

  it('LFM, TB = 200: τ_c = 0.886/B and −13.26 dB sidelobes', () => {
    const r = run(lfm(0.9e9, 1.1e9));
    expect(r.metrics.widthSec / (0.886 / 200e6)).toBeCloseTo(1, 1);
    expect(Math.abs(r.metrics.widthSec / (0.886 / 200e6) - 1)).toBeLessThan(0.02);
    expect(Math.abs(r.metrics.pslrDb + 13.26)).toBeLessThan(0.3);
    expect(r.metrics.tb).toBeCloseTo(200, 6);
    expect(Math.abs(r.metrics.ratio / (1.13 * 200) - 1)).toBeLessThan(0.03);
    expect(r.metrics.rangeResolutionM).toBeCloseTo((299792458 * r.metrics.widthSec) / 2, 6);
  });

  it('Hamming weighting: low sidelobes, wider mainlobe, loss = 10·log10(ENBW)', () => {
    const plain = run(lfm(0.9e9, 1.1e9));
    const r = run(lfm(0.9e9, 1.1e9), { weighting: 'hamming' });
    expect(r.metrics.pslrDb).toBeLessThan(-40);
    const enbw = windowStats(makeWindow('hamming', 4000, false)).enbwBins;
    expect(Math.abs(r.metrics.weightingLossDb - 10 * Math.log10(enbw))).toBeLessThan(0.02);
    expect(r.metrics.weightingLossDb).toBeCloseTo(1.34, 1);
    expect(Math.abs(r.metrics.widthSec / plain.metrics.widthSec / 1.47 - 1)).toBeLessThan(0.05);
    expect(r.mag[r.metrics.peakIndex]).toBeCloseTo(10 ** (-r.metrics.weightingLossDb / 20), 6);
    expect(r.magUnweighted).not.toBeNull();
  });

  it('Doppler on an LFM moves the peak by −ν/k (range–Doppler coupling)', () => {
    const e = lfm(0.99e9, 1.01e9, { pulse: { widthSec: 2.5e-6 }, sampling: manual(4e9, 32768) });
    const r = run(e, { dopplerHz: 2e6 });
    const k = 20e6 / 2.5e-6;
    expect(Math.abs(r.metrics.delayShift / (-2e6 / k) - 1)).toBeLessThan(0.02);
    expect(r.metrics.dopplerLossDb).toBeCloseTo(-db(0.9), 1);
    expect(r.narrowband.exceeded).toBe(false);
    expect(r.narrowband.ratio).toBeGreaterThan(0);
  });

  it('flags the narrowband limit for a large Doppler', () => {
    const r = run(lfm(0.95e9, 1.05e9), { dopplerHz: 10e6 });
    expect(r.narrowband.exceeded).toBe(true);
    expect(r.narrowband.nuLimitHz).toBeLessThan(10e6);
  });

  it('Barker-13 on a carrier: PSLR = 1/13 (−22.28 dB)', () => {
    // τ = 1.3 µs: 400 samples per chip (non-integer chips add ≈ ±0.15 dB of discretization error).
    const r = run(rfPulse({ signalType: 'phase-code', pulse: { widthSec: 1.3e-6 }, code: { enabled: true, family: 'barker', length: 13 } }));
    expect(Math.abs(r.metrics.pslrDb + 22.28)).toBeLessThan(0.1);
    expect(r.metrics.tb).toBe(13);
  });

  it('baseband Barker-13 uses the real correlation and has the same PSLR', () => {
    const e = rfPulse({ signalType: 'phase-code', carrier: { enabled: false }, pulse: { widthSec: 1.3e-6 }, code: { enabled: true, family: 'barker', length: 13 }, sampling: manual(1e9, 8192) });
    const r = run(e);
    expect(r.reference.signal.kind).toBe('baseband');
    expect(Math.abs(r.metrics.pslrDb + 22.28)).toBeLessThan(0.1);
    expect(r.narrowband.baseband).toBe(true);
  });
});

describe('matched filter: pulse trains', () => {
  /** 100 ns bursts at 1 GHz, PRF 2 MHz, 8 pulses, 4 GS/s, 32768 samples. */
  const train = (signal: DeepPartial<SignalConfig> = {}) =>
    rfPulse({
      signalType: 'pulse-train',
      pulse: { widthSec: 100e-9 },
      repetition: { enabled: true, prfHz: 2e6, pulseCount: 8 },
      coherence: { mode: 'coherent', reference: 'continuous' },
      sampling: manual(4e9, 32768),
      ...signal,
    });

  it('train reference: 10·log10(N) integration gain and range ambiguities (N−|m|)/N', () => {
    const r = run(train(), { reference: 'train' });
    expect(r.reference.train).toBe(true);
    expect(r.metrics.integrationGainDb).toBeCloseTo(10 * Math.log10(8), 1);
    expect(Math.abs(r.metrics.integrationGainDb! - 9.031)).toBeLessThan(0.05);
    expect(r.metrics.integrationLossDb).toBeCloseTo(0, 6);
    const m1 = r.metrics.ambiguities.find((a) => Math.abs(a.delay - 500e-9) < 5e-9)!;
    expect(m1).toBeDefined();
    expect(Math.abs(m1.db - db(7 / 8))).toBeLessThan(0.05);
  });

  it('random pulse-to-pulse phase costs integration', () => {
    const r = run(train({ coherence: { mode: 'incoherent' } }), { reference: 'train' });
    expect(r.metrics.integrationLossDb!).toBeGreaterThan(3);
  });

  it('single-pulse reference on a train has no integration figures', () => {
    const r = run(train());
    expect(r.reference.train).toBe(false);
    expect(r.metrics.integrationGainDb).toBeNull();
  });

  it("'train' without a train falls back to the single pulse", () => {
    const r = run(rfPulse(), { reference: 'train' });
    expect(r.reference.train).toBe(false);
  });
});

describe('matched filter: detection in noise', () => {
  const noisy = (e: Experiment) => mergeExperiment(e, { signal: { amplitude: 1, noise: { enabled: true, rms: 1 }, jitter: { seed: 3 } } });

  it('measured output SNR matches Σx²/σ² and depends only on energy', () => {
    const a = run(noisy(rfPulse()));
    const b = run(noisy(lfm(0.95e9, 1.05e9)));
    expect(a.snr).not.toBeNull();
    expect(b.snr).not.toBeNull();
    // A wideband filter has many independent output samples, so one realization is accurate.
    expect(b.snr!.scatterDb).toBeLessThan(0.3);
    expect(Math.abs(b.snr!.outMeasuredDb - b.snr!.outTheoryDb)).toBeLessThan(0.5);
    // The 1 µs unmodulated pulse has few: its single-realization estimate scatters by ≈ ±2 dB, the seed average does not.
    expect(a.snr!.scatterDb).toBeGreaterThan(1);
    // Average the noise-variance estimate (∝ 1/SNR), which is unbiased; averaging SNR itself is not.
    // A 32 µs record gives ≈ 50 independent output samples per realization.
    let inv = 0;
    for (let seed = 1; seed <= 8; seed++) inv += 10 ** (-run(mergeExperiment(noisy(rfPulse({ sampling: manual(4e9, 131072) })), { signal: { jitter: { seed } } })).snr!.outMeasuredDb / 10);
    expect(Math.abs(-10 * Math.log10(inv / 8) - a.snr!.outTheoryDb)).toBeLessThan(0.5);
    expect(Math.abs(a.snr!.outTheoryDb - b.snr!.outTheoryDb)).toBeLessThan(0.01);
    expect(a.snr!.outTheoryDb).toBeCloseTo(10 * Math.log10(2000 / a.snr!.sigma ** 2), 1);
    expect(a.metrics.widthSec / b.metrics.widthSec).toBeGreaterThan(60); // 586 ns vs 8.9 ns
    expect(a.magNoisy).not.toBeNull();
  });

  it('no noise → no SNR block', () => {
    expect(run(rfPulse()).snr).toBeNull();
  });
});
