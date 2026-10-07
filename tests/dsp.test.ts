import { describe, expect, it } from 'vitest';
import { fftFrequencies, fftInPlace, fftReal, fftshift, ifft } from '@/lib/dsp/fft';
import { computeSpectrum, positiveHalf, analyticSignal } from '@/lib/dsp/spectrum';
import { occupiedBandwidth, rmsBandwidth, thresholdBandwidth } from '@/lib/dsp/bandwidth';
import { fwhm, rmsDuration, edgeTimes } from '@/lib/dsp/measurements';
import { generateSignal, envelopeAt, pulseShapeFromConfig } from '@/lib/dsp/signals';
import { aliasFrequency, resolveSampling } from '@/lib/dsp/sampling';
import { analyzeLight } from '@/lib/dsp/analyze';
import { createRng } from '@/lib/dsp/random';
import { collectWarnings } from '@/lib/dsp/warnings';
import { DEFAULT_EXPERIMENT, mergeExperiment } from '@/lib/presets/defaults';
import type { DeepPartial, Experiment } from '@/types/signal';

const exp = (p: DeepPartial<Experiment>) => mergeExperiment(DEFAULT_EXPERIMENT, p);
const manual = (fs: number, n: number) => ({ mode: 'manual' as const, sampleRateHz: fs, sampleCount: n });

function naiveDft(x: number[]) {
  const n = x.length;
  const re: number[] = [];
  const im: number[] = [];
  for (let k = 0; k < n; k++) {
    let r = 0;
    let i = 0;
    for (let t = 0; t < n; t++) {
      r += x[t] * Math.cos((-2 * Math.PI * k * t) / n);
      i += x[t] * Math.sin((-2 * Math.PI * k * t) / n);
    }
    re.push(r);
    im.push(i);
  }
  return { re, im };
}

describe('FFT', () => {
  it.each([8, 64, 12, 100, 37])('matches a naive DFT for N=%i (radix-2 and Bluestein)', (n) => {
    const r = createRng(n);
    const x = Array.from({ length: n }, () => r.normal());
    const a = fftReal(x);
    const b = naiveDft(x);
    for (let k = 0; k < n; k++) {
      expect(a.re[k]).toBeCloseTo(b.re[k], 8);
      expect(a.im[k]).toBeCloseTo(b.im[k], 8);
    }
  });

  it('inverse recovers the input', () => {
    const x = Float64Array.from({ length: 30 }, (_, i) => Math.sin(i) + 0.1 * i);
    const re = Float64Array.from(x);
    const im = new Float64Array(30);
    fftInPlace(re, im);
    const y = ifft(re, im);
    for (let i = 0; i < 30; i++) expect(y.re[i]).toBeCloseTo(x[i], 10);
  });

  it('generates DFT bin frequencies Δf = fs/N in natural order and fftshift centers them', () => {
    const f = fftFrequencies(8, 800);
    expect(Array.from(f)).toEqual([0, 100, 200, 300, -400, -300, -200, -100]);
    expect(Array.from(fftshift(f))).toEqual([-400, -300, -200, -100, 0, 100, 200, 300]);
  });
});

describe('sampling', () => {
  it('Nyquist frequency is fs/2', () => {
    const e = exp({ signal: { sampling: manual(10e9, 4096) } });
    const { measurements } = analyzeLight(e);
    expect(measurements.nyquist).toBe(5e9);
  });

  it('auto sampling keeps the default signal inside Nyquist', () => {
    const { fs } = resolveSampling(DEFAULT_EXPERIMENT.signal);
    expect(fs / 2).toBeGreaterThan(2 * DEFAULT_EXPERIMENT.signal.carrier.frequencyHz);
  });

  it('computes alias frequencies', () => {
    expect(aliasFrequency(1.3e9, 2e9)).toBeCloseTo(0.7e9);
    expect(aliasFrequency(0.4e9, 2e9)).toBeCloseTo(0.4e9);
    expect(aliasFrequency(2.1e9, 2e9)).toBeCloseTo(0.1e9);
  });
});

describe('spectrum', () => {
  it('sinusoid peaks at f0 with amplitude scaling A/2 (two-sided)', () => {
    const e = exp({ signal: { signalType: 'sinusoid', amplitude: 2, carrier: { frequencyHz: 10e6 }, pulse: { enabled: false }, sampling: manual(160e6, 4096) } });
    const s = generateSignal(e.signal);
    const sp = computeSpectrum(s.x, s.fs, { window: 'rect', zeroPad: 1, scaling: 'amplitude' });
    const h = positiveHalf(sp);
    let p = 0;
    for (let k = 0; k < h.mag.length; k++) if (h.mag[k] > h.mag[p]) p = k;
    expect(h.f[p]).toBeCloseTo(10e6, 0);
    expect(h.mag[p]).toBeCloseTo(1, 6); // A/2
  });

  it('Fourier-transform scaling gives |X(0)| = A·τ for a rect pulse, independent of zero padding', () => {
    const e = exp({ signal: { carrier: { enabled: false }, pulse: { envelope: 'rect', widthSec: 20e-9 }, sampling: manual(5e9, 4096) } });
    const s = generateSignal(e.signal);
    const a = computeSpectrum(s.x, s.fs, { window: 'rect', zeroPad: 1, scaling: 'ft' });
    const b = computeSpectrum(s.x, s.fs, { window: 'rect', zeroPad: 8, scaling: 'ft' });
    expect(positiveHalf(a).mag[0]).toBeCloseTo(20e-9, 10);
    expect(positiveHalf(b).mag[0]).toBeCloseTo(20e-9, 10);
  });

  it('zero padding interpolates: padded bins at multiples of the pad factor equal the original DFT', () => {
    const e = exp({ signal: { pulse: { widthSec: 10e-9 }, sampling: manual(10e9, 1000) } });
    const s = generateSignal(e.signal);
    const a = positiveHalf(computeSpectrum(s.x, s.fs, { window: 'hann', zeroPad: 1, scaling: 'ft' }));
    const b = positiveHalf(computeSpectrum(s.x, s.fs, { window: 'hann', zeroPad: 4, scaling: 'ft' }));
    expect(b.f[1] - b.f[0]).toBeCloseTo((a.f[1] - a.f[0]) / 4, 3);
    for (let k = 0; k < a.mag.length; k += 37) expect(b.mag[4 * k]).toBeCloseTo(a.mag[k], 14);
  });

  it('periodogram PSD satisfies Parseval (rect window)', () => {
    const r = createRng(3);
    const n = 2048;
    const fs = 1e6;
    const x = Float64Array.from({ length: n }, () => r.normal());
    const sp = computeSpectrum(x, fs, { window: 'rect', zeroPad: 1, scaling: 'amplitude' });
    let sum = 0;
    for (let k = 0; k < n; k++) sum += sp.power[k] * sp.psdScale * sp.binSpacing;
    let p = 0;
    for (let i = 0; i < n; i++) p += x[i] * x[i];
    expect(sum).toBeCloseTo(p / n, 10);
  });

  it('analytic signal envelope of a tone is constant', () => {
    const n = 1024;
    const x = Float64Array.from({ length: n }, (_, i) => 0.7 * Math.cos((2 * Math.PI * 64 * i) / n));
    const z = analyticSignal(x);
    for (let i = 10; i < n - 10; i += 50) expect(Math.hypot(z.re[i], z.im[i])).toBeCloseTo(0.7, 6);
  });
});

describe('bandwidth', () => {
  it('rect baseband pulse: −3 dB edge at 0.443/τ', () => {
    const tau = 20e-9;
    const e = exp({ signal: { carrier: { enabled: false }, pulse: { envelope: 'rect', widthSec: tau }, sampling: manual(5e9, 8192) } });
    const { measurements: m } = analyzeLight(e);
    expect(m.kind).toBe('baseband');
    expect(m.full.bw3.width * tau).toBeCloseTo(0.443, 2);
    expect(m.full.nullToNull.width * tau).toBeCloseTo(1, 1);
  });

  it('RF rect burst: two-sided −3 dB width 0.886/τ around f0', () => {
    const tau = 20e-9;
    const e = exp({ signal: { pulse: { widthSec: tau }, sampling: manual(10e9, 8192) } });
    const { measurements: m } = analyzeLight(e);
    expect(m.kind).toBe('bandpass');
    // Small deviation from 0.886 comes from the negative-frequency image's sidelobes.
    expect(Math.abs(m.full.bw3.width * tau - 0.886)).toBeLessThan(0.886 * 0.015);
    expect((m.full.bw3.low + m.full.bw3.high) / 2).toBeCloseTo(1e9, -6);
  });

  it('pulse-width vs bandwidth: shorter Gaussian → wider spectrum (inverse trend)', () => {
    const bw = (tau: number) =>
      analyzeLight(exp({ signal: { carrier: { enabled: false }, pulse: { envelope: 'gaussian', widthSec: tau }, sampling: manual(2e9, 8192) } }))
        .measurements.full.bw3.width;
    const b1 = bw(40e-9);
    const b2 = bw(10e-9);
    expect(b2).toBeGreaterThan(b1);
    expect(b2 / b1).toBeCloseTo(4, 1);
  });

  it('occupied bandwidth: 90 % / 99 % of a synthetic flat band', () => {
    const f = Float64Array.from({ length: 101 }, (_, i) => i);
    const p = Float64Array.from({ length: 101 }, (_, i) => (i >= 40 && i <= 60 ? 1 : 0));
    const b = occupiedBandwidth(f, p, 0.9, 'bandpass');
    expect(b.width).toBeCloseTo(0.9 * 21, 6);
    expect((b.low + b.high) / 2).toBeCloseTo(50, 6);
  });

  it('threshold bandwidth handles a peaked synthetic spectrum', () => {
    const f = Float64Array.from({ length: 201 }, (_, i) => i);
    const mag = Float64Array.from({ length: 201 }, (_, i) => Math.exp(-(((i - 100) / 10) ** 2)));
    const b = thresholdBandwidth(f, mag, 6.0206, 'bandpass');
    // |X| = 1/2 at (i−100)/10 = √ln2
    expect(b.width).toBeCloseTo(2 * 10 * Math.sqrt(Math.LN2), 0);
  });

  it('RMS bandwidth of a centered flat band', () => {
    const f = Float64Array.from({ length: 1001 }, (_, i) => i);
    const p = Float64Array.from({ length: 1001 }, (_, i) => (i >= 400 && i <= 600 ? 1 : 0));
    const r = rmsBandwidth(f, p, 'bandpass');
    expect(r.centroid).toBeCloseTo(500, 6);
    expect(r.sigma).toBeCloseTo(Math.sqrt((201 * 201 - 1) / 12), 3);
  });
});

describe('time measurements', () => {
  it('Gaussian FWHM, RMS duration and minimum uncertainty', () => {
    const tau = 10e-9;
    const e = exp({ signal: { carrier: { enabled: false }, pulse: { envelope: 'gaussian', widthSec: tau }, sampling: manual(4e9, 8192) } });
    const { measurements: m } = analyzeLight(e);
    expect(m.time.fwhm.width).toBeCloseTo(tau, 11);
    // |x|² of a Gaussian with σ has RMS width σ/√2
    const sigma = tau / (2 * Math.sqrt(2 * Math.LN2));
    expect(m.uncertainty.sigmaT / (sigma / Math.SQRT2)).toBeCloseTo(1, 4);
    expect(m.uncertainty.normalized).toBeCloseTo(1, 3);
  });

  it('Gaussian RF burst also reaches the bound (analytic-signal definition)', () => {
    const e = exp({ signal: { pulse: { envelope: 'gaussian', widthSec: 20e-9 }, sampling: manual(10e9, 8192) } });
    const { measurements: m } = analyzeLight(e);
    expect(m.uncertainty.normalized).toBeCloseTo(1, 2);
    expect(m.time.cycles).toBeCloseTo(20, 1);
  });

  it('rect pulse has a larger uncertainty product than a Gaussian', () => {
    const e = exp({ signal: { carrier: { enabled: false }, pulse: { envelope: 'rect', widthSec: 20e-9, edgesEnabled: true, riseTimeSec: 2e-9, fallTimeSec: 2e-9 }, sampling: manual(10e9, 8192) } });
    expect(analyzeLight(e).measurements.uncertainty.normalized).toBeGreaterThan(1.2);
  });

  it('measures configured 10–90 % rise and fall times', () => {
    const e = exp({ signal: { carrier: { enabled: false }, pulse: { envelope: 'rect', widthSec: 50e-9, edgesEnabled: true, riseTimeSec: 4e-9, fallTimeSec: 8e-9 }, sampling: manual(10e9, 4096) } });
    const s = generateSignal(e.signal);
    const t = edgeTimes(s.t, s.xIdeal);
    expect(t.rise).toBeCloseTo(4e-9, 11);
    expect(t.fall).toBeCloseTo(8e-9, 11);
    expect(fwhm(s.t, s.xIdeal).width).toBeCloseTo(50e-9, 11);
  });

  it('cosine edges also honour the 10–90 % definition', () => {
    const cfg = exp({ signal: { pulse: { envelope: 'rect', widthSec: 50e-9, edgesEnabled: true, edgeShape: 'cosine', riseTimeSec: 5e-9, fallTimeSec: 5e-9 } } }).signal;
    const sh = pulseShapeFromConfig(cfg);
    const t = Float64Array.from({ length: 20001 }, (_, i) => -50e-9 + i * 5e-12);
    const e = Float64Array.from(t, (u) => envelopeAt(sh, u));
    expect(edgeTimes(t, e).rise).toBeCloseTo(5e-9, 11);
  });

  it('RMS duration of a sampled rect', () => {
    const t = Float64Array.from({ length: 1000 }, (_, i) => i);
    const e = Float64Array.from({ length: 1000 }, (_, i) => (i >= 400 && i < 600 ? 1 : 0));
    const r = rmsDuration(t, e);
    expect(r.centroid).toBeCloseTo(499.5, 6);
    expect(r.sigma).toBeCloseTo(Math.sqrt((200 * 200 - 1) / 12), 6);
  });
});

describe('pulse trains', () => {
  const train = (p: DeepPartial<Experiment['signal']>) =>
    exp({
      signal: {
        signalType: 'pulse-train',
        pulse: { envelope: 'rect', widthSec: 20e-9 },
        repetition: { enabled: true, prfHz: 1e6, pulseCount: 16 },
        sampling: manual(10e9, 1 << 17),
        ...p,
      },
      analysis: { spectrum: { zeroPad: 1 } },
    });

  it('coherent train with PRF = 1 MHz has lines at f0 + n·1 MHz', () => {
    const { measurements: m, spectra } = analyzeLight(train({}));
    expect(m.comb).not.toBeNull();
    expect(m.comb!.spacing).toBeCloseTo(1e6, -4);
    const df = spectra.spectrum.binSpacing;
    for (const f of m.comb!.lines.slice(0, 10)) {
      const n = Math.round((f - 1e9) / 1e6);
      expect(Math.abs(f - (1e9 + n * 1e6))).toBeLessThanOrEqual(df);
    }
  });

  it('PRF comb spacing follows PRF', () => {
    const e = exp({
      signal: {
        signalType: 'pulse-train',
        carrier: { enabled: false },
        pulse: { envelope: 'rect', widthSec: 10e-9 },
        repetition: { enabled: true, prfHz: 20e6, pulseCount: 32 },
        sampling: manual(2e9, 8192),
      },
    });
    const { measurements: m } = analyzeLight(e);
    expect(m.comb!.spacing).toBeCloseTo(20e6, -5);
  });

  it('coherent combs are sharper than incoherent ones; single-pulse bandwidth is unchanged', () => {
    const a = analyzeLight(train({ coherence: { mode: 'coherent' } })).measurements;
    const b = analyzeLight(train({ coherence: { mode: 'incoherent' } })).measurements;
    expect(a.comb!.contrastDb).toBeGreaterThan(b.comb!.contrastDb + 6);
    expect(a.single!.bw3.width).toBeCloseTo(b.single!.bw3.width, 0);
  });

  it('more pulses → narrower lines (Δf_line ~ 1/T_burst)', () => {
    const w = (n: number) =>
      analyzeLight(
        exp({
          signal: {
            carrier: { enabled: false },
            pulse: { envelope: 'rect', widthSec: 10e-9 },
            repetition: { enabled: true, prfHz: 10e6, pulseCount: n },
            sampling: manual(1e9, 8192),
          },
          analysis: { spectrum: { zeroPad: 8 } },
        }),
      ).measurements.full.bw3.width;
    const w8 = w(8);
    const w32 = w(32);
    expect(w32).toBeLessThan(w8);
    expect(w8 / w32).toBeCloseTo(4, 0);
  });

  it('non-DC line width of a coherent baseband comb ≈ 0.886·PRF/N', () => {
    const N = 32;
    const e = exp({
      signal: {
        signalType: 'pulse-train',
        carrier: { enabled: false },
        pulse: { envelope: 'rect', widthSec: 10e-9 },
        repetition: { enabled: true, prfHz: 10e6, pulseCount: N },
        sampling: manual(2e9, 8192),
      },
      analysis: { spectrum: { zeroPad: 8 } },
    });
    const { measurements: m } = analyzeLight(e);
    expect(m.lineWidth!.valid).toBe(true);
    expect(m.lineWidth!.width / ((0.886 * 10e6) / N)).toBeCloseTo(1, 1);
  });

  it('seeded jitter is deterministic and seed-dependent', () => {
    const j = { timingEnabled: true, timingRmsSec: 1e-9, seed: 7 };
    const a = generateSignal(train({ jitter: j }).signal).pulses.map((p) => p.tCenter);
    const b = generateSignal(train({ jitter: j }).signal).pulses.map((p) => p.tCenter);
    const c = generateSignal(train({ jitter: { ...j, seed: 8 } }).signal).pulses.map((p) => p.tCenter);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('enabling amplitude jitter does not change the timing realization', () => {
    const a = generateSignal(train({ jitter: { timingEnabled: true, timingRmsSec: 1e-9 } }).signal).pulses.map((p) => p.tCenter);
    const b = generateSignal(train({ jitter: { timingEnabled: true, timingRmsSec: 1e-9, amplitudeEnabled: true } }).signal).pulses.map((p) => p.tCenter);
    expect(a).toEqual(b);
  });
});

describe('phase codes in the signal model', () => {
  const coded = (p: DeepPartial<Experiment>) =>
    exp({ signal: { signalType: 'phase-code', repetition: { enabled: false }, ...p.signal, code: { enabled: true, ...p.signal?.code } } });

  it('baseband Barker-13 is exactly ±1 inside the pulse, with the Barker sign sequence', () => {
    const e = coded({ signal: { carrier: { enabled: false }, pulse: { envelope: 'rect', widthSec: 1.3e-6 }, code: { family: 'barker', length: 13 }, sampling: manual(100e6, 1024) } });
    const s = generateSignal(e.signal);
    const tc = s.observation / 2;
    for (let i = 0; i < s.n; i++) {
      const u = s.t[i] - tc;
      if (Math.abs(u) < 0.65e-6 - 1e-12) expect(Math.abs(s.x[i])).toBe(1);
    }
    const signs = Array.from({ length: 13 }, (_, m) => (s.x[452 + 10 * m] > 0 ? '+' : '-')).join('');
    expect(signs).toBe('+++++--++-+-+');
  });

  it('adds the chip phase to the carrier phase', () => {
    const e = coded({ signal: { carrier: { enabled: true, frequencyHz: 1e9 }, pulse: { envelope: 'rect', widthSec: 100e-9 }, code: { family: 'barker', length: 5 }, sampling: manual(10e9, 4096) } });
    const s = generateSignal(e.signal);
    const tc = s.observation / 2;
    const pattern = '+++-+';
    for (let m = 0; m < 5; m++) {
      const i = 2048 - 500 + 100 + 200 * m;
      const u = s.t[i] - tc;
      const want = Math.cos(2 * Math.PI * 1e9 * u + (pattern[m] === '+' ? 0 : Math.PI));
      expect(s.x[i]).toBeCloseTo(want, 9);
    }
  });

  it('applies the same code to every pulse of a train', () => {
    const e = coded({
      signal: {
        signalType: 'pulse-train',
        carrier: { enabled: true, frequencyHz: 1e9 },
        pulse: { envelope: 'rect', widthSec: 100e-9 },
        repetition: { enabled: true, prfHz: 5e6, pulseCount: 4 },
        coherence: { mode: 'coherent', reference: 'pulse' },
        code: { family: 'barker', length: 7 },
        sampling: manual(10e9, 16384),
      },
    });
    const s = generateSignal(e.signal);
    for (const shift of [-3000, -1000, 1000, 3000]) {
      for (let i = 8192 - 499; i <= 8192 + 499; i++) expect(s.xIdeal[i + shift]).toBeCloseTo(s.singlePulse[i], 9);
    }
  });

  it('has no effect without a pulse envelope', () => {
    const base = exp({ signal: { signalType: 'sinusoid', pulse: { enabled: false }, repetition: { enabled: false }, sampling: manual(10e9, 1024) } });
    const withCode = mergeExperiment(base, { signal: { code: { enabled: true, family: 'p4', length: 16 } } });
    expect(Array.from(generateSignal(withCode.signal).x)).toEqual(Array.from(generateSignal(base.signal).x));
  });
});

describe('phase codes: sampling and warnings', () => {
  it('auto sampling resolves Barker-13 chips with ≥ 4 samples each', () => {
    const e = exp({ signal: { signalType: 'phase-code', carrier: { enabled: true, frequencyHz: 1e9 }, pulse: { envelope: 'rect', widthSec: 1e-6 }, code: { enabled: true, family: 'barker', length: 13 } } });
    const { fs } = resolveSampling(e.signal);
    expect(fs * (1e-6 / 13)).toBeGreaterThanOrEqual(4);
  });

  it('warns about a polyphase code without a carrier and about too few samples per chip', () => {
    const e = exp({
      signal: { signalType: 'phase-code', carrier: { enabled: false }, pulse: { envelope: 'rect', widthSec: 1e-6 }, code: { enabled: true, family: 'p4', length: 64 }, sampling: manual(100e6, 1024) },
    });
    const a = analyzeLight(e);
    const ids = collectWarnings(e.signal, e.analysis, a.signal, a.measurements, { stft: false, cwt: false }).map((w) => w.id);
    expect(ids).toContain('code-polyphase-baseband');
    expect(ids).toContain('code-chip-samples');
  });
});
