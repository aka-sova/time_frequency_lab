import { describe, expect, it } from 'vitest';
import { computeSTFT } from '@/lib/dsp/stft';
import { computeCWT, waveletSpread } from '@/lib/dsp/wavelet';
import { measureWindow, toneSpectrum } from '@/lib/dsp/leakage';
import { synthesize } from '@/lib/dsp/synthesis';
import { generateSignal } from '@/lib/dsp/signals';
import { DEFAULT_EXPERIMENT, mergeExperiment } from '@/lib/presets/defaults';
import { computeSpectra } from '@/lib/dsp/analyze';
import { runSweep, SWEEP_PARAMETERS, sweepValues } from '@/lib/dsp/sweep';

describe('STFT', () => {
  it('ridge follows the instantaneous frequency of a linear chirp', () => {
    const e = mergeExperiment(DEFAULT_EXPERIMENT, {
      signal: { pulse: { envelope: 'rect', widthSec: 200e-9 }, chirp: { enabled: true, startFrequencyHz: 0.5e9, endFrequencyHz: 1.5e9 }, sampling: { mode: 'manual', sampleRateHz: 10e9, sampleCount: 4096 } },
    });
    const s = generateSignal(e.signal);
    const st = computeSTFT(s.x, s.fs, { windowLength: 128, overlapPct: 75, nfft: 512, window: 'hann' });
    const tc = s.observation / 2;
    for (const dtFrac of [-0.3, 0, 0.3]) {
      const t = tc + dtFrac * 200e-9;
      const c = st.times.reduce((b, v, i) => (Math.abs(v - t) < Math.abs(st.times[b] - t) ? i : b), 0);
      let best = 0;
      for (let r = 0; r < st.freqs.length; r++) if (st.db[r][c] > st.db[best][c]) best = r;
      const expected = 1e9 + (1e9 / 200e-9) * (st.times[c] - tc);
      expect(Math.abs(st.freqs[best] - expected)).toBeLessThan(40e6);
    }
  });

  it('longer windows give finer frequency resolution (ENBW ∝ 1/L)', () => {
    const x = new Float64Array(4096).map((_, i) => Math.cos(0.3 * i));
    const a = computeSTFT(x, 1, { windowLength: 64, overlapPct: 50, nfft: 256, window: 'hann' });
    const b = computeSTFT(x, 1, { windowLength: 256, overlapPct: 50, nfft: 256, window: 'hann' });
    expect(a.enbwHz / b.enbwHz).toBeCloseTo(4, 6);
    expect(b.windowDuration / a.windowDuration).toBeCloseTo(4, 6);
  });
});

describe('CWT', () => {
  it('Morlet response peaks at the tone frequency with amplitude-preserving normalization', () => {
    const fs = 1000;
    const x = new Float64Array(4096).map((_, i) => 0.8 * Math.cos((2 * Math.PI * 50 * i) / fs));
    const w = computeCWT(x, fs, { wavelet: 'morlet', omega0: 6, fMin: 10, fMax: 200, scales: 80, maxCols: 64 });
    const col = 32;
    let best = 0;
    for (let r = 0; r < w.freqs.length; r++) if (w.db[r][col] > w.db[best][col]) best = r;
    expect(w.freqs[best]).toBeGreaterThan(46);
    expect(w.freqs[best]).toBeLessThan(54);
  });

  it('Morlet wavelet sits at the uncertainty bound at every scale', () => {
    const k = waveletSpread('morlet', 6);
    expect(k.sigmaT * k.sigmaF * 4 * Math.PI).toBeCloseTo(1, 2);
    const m = waveletSpread('mexican-hat', 6);
    expect(m.sigmaT * m.sigmaF * 4 * Math.PI).toBeGreaterThan(1);
  });
});

describe('windows and leakage', () => {
  it('measures classic window properties', () => {
    const rect = measureWindow('rect');
    const hann = measureWindow('hann');
    const black = measureWindow('blackman');
    expect(rect.mainLobeBins).toBeCloseTo(2, 1);
    expect(rect.peakSidelobeDb).toBeCloseTo(-13.3, 0);
    expect(hann.mainLobeBins).toBeCloseTo(4, 1);
    expect(hann.peakSidelobeDb).toBeCloseTo(-31.5, 0);
    expect(hann.enbwBins).toBeCloseTo(1.5, 3);
    expect(black.peakSidelobeDb).toBeLessThan(-57);
    expect(rect.scallopLossDb).toBeCloseTo(-3.92, 1);
  });

  it('a bin-centered tone does not leak with a rectangular window; an off-bin tone does', () => {
    const on = toneSpectrum(64, 10, 1, 'rect');
    const off = toneSpectrum(64, 10.5, 1, 'rect');
    expect(on.rawDb[20]).toBeLessThan(-100);
    expect(off.rawDb[20]).toBeGreaterThan(-40);
  });
});

describe('Fourier synthesis', () => {
  it('more harmonics approximate the rect pulse better', () => {
    const err = (k: number) => {
      const r = synthesize('rect', 0.2, k, { points: 801 });
      return r.sum.reduce((s, v, i) => s + (v - r.target[i]) ** 2, 0) / r.sum.length;
    };
    expect(err(50)).toBeLessThan(err(5));
  });
});

describe('analysis helpers', () => {
  it('FFT of a cursor selection shortens the analyzed segment', () => {
    const e = DEFAULT_EXPERIMENT;
    const s = generateSignal(e.signal);
    const sel = { enabled: true, t1: 100e-9, t2: 300e-9, f1: 0, f2: 0 };
    const sp = computeSpectra(s, e.signal, { ...e.analysis.spectrum, fftSelection: true }, sel);
    expect(sp.segment.end - sp.segment.start).toBe(Math.round(200e-9 * s.fs));
  });

  it('sweep over pulse width yields an inverse bandwidth trend', () => {
    const p = SWEEP_PARAMETERS.find((q) => q.id === 'pw')!;
    const rows = runSweep(DEFAULT_EXPERIMENT, p, sweepValues(5e-9, 40e-9, 4, true));
    for (let i = 1; i < rows.length; i++) expect(rows[i].metrics.envBw3).toBeLessThan(rows[i - 1].metrics.envBw3);
  });
});
