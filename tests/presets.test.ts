import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/lib/presets/presets';
import { buildPresetExperiment, buildCompareExperiment, compareAfterPreset } from '@/lib/presets/apply';
import { estimateSpectralExtent, resolveSampling } from '@/lib/dsp/sampling';
import { analyzeLight } from '@/lib/dsp/analyze';
import { experimentToQuery, queryToExperiment } from '@/lib/state/url';
import { sanitizeExperiment } from '@/lib/state/sanitize';
import { DEFAULT_EXPERIMENT } from '@/lib/presets/defaults';
import { isolate } from '@/lib/presets/isolate';
import { setPath } from '@/lib/state/path';
import { formatEngineering, parseEngineering } from '@/lib/units/format';
import { collectWarnings } from '@/lib/dsp/warnings';
import { ETA0, energyStats, periodicStats, powerContext } from '@/lib/dsp/power';
import { simulateInstrument } from '@/lib/dsp/instrument';
import { generateSignal } from '@/lib/dsp/signals';
import { analyzeCompression } from '@/lib/dsp/compression';

describe('presets', () => {
  it('has at least 20 presets with unique ids', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s respects Nyquist unless it demonstrates aliasing', (_id, p) => {
    const exp = buildPresetExperiment(p);
    const { fs } = resolveSampling(exp.signal);
    const ext = estimateSpectralExtent(exp.signal);
    if (p.intentional === 'aliasing' && p.id === 'aliasing') expect(ext.carrierMaxHz).toBeGreaterThan(fs / 2);
    else expect(ext.carrierMaxHz).toBeLessThan(fs / 2);
    const a = analyzeLight(exp);
    const w = collectWarnings(exp.signal, exp.analysis, a.signal, a.measurements, { stft: false, cwt: false });
    if (!p.intentional) expect(w.filter((x) => x.id.startsWith('nyquist') || x.id === 'truncated').map((x) => x.id)).toEqual([]);
    const cmp = buildCompareExperiment(p);
    if (cmp) expect(estimateSpectralExtent(cmp.signal).fMaxHz).toBeLessThan(resolveSampling(cmp.signal).fs / 2);
  });

  it('default experiment shows ≈20 carrier cycles and a finite envelope at f0', () => {
    const { measurements: m } = analyzeLight(DEFAULT_EXPERIMENT);
    expect(m.time.cycles).toBeCloseTo(20, 0);
    expect(m.full.peakFrequency).toBeCloseTo(1e9, -7);
    expect(m.full.bw3.valid).toBe(true);
  });

  it('isolate keeps the studied parameter', () => {
    const e = setPath(DEFAULT_EXPERIMENT, 'signal.pulse.widthSec', 7e-9);
    expect(isolate('pulseWidth', e).signal.pulse.widthSec).toBe(7e-9);
    const p = setPath(setPath(DEFAULT_EXPERIMENT, 'signal.repetition.prfHz', 3e6), 'signal.jitter.timingEnabled', true);
    const iso = isolate('prf', p);
    expect(iso.signal.repetition.prfHz).toBe(3e6);
    expect(iso.signal.repetition.enabled).toBe(true);
    expect(iso.signal.jitter.timingEnabled).toBe(false);
  });
});

describe('isolate phase code', () => {
  it('keeps family and length and clears unrelated effects', () => {
    let e = setPath(DEFAULT_EXPERIMENT, 'signal.code', { enabled: true, family: 'frank', length: 36 });
    e = setPath(setPath(e, 'signal.repetition.enabled', true), 'signal.jitter.timingEnabled', true);
    const iso = isolate('code', e);
    expect(iso.signal.code).toEqual({ enabled: true, family: 'frank', length: 36 });
    expect(iso.signal.signalType).toBe('phase-code');
    expect(iso.signal.carrier.enabled).toBe(true);
    expect(iso.signal.repetition.enabled).toBe(false);
    expect(iso.signal.jitter.timingEnabled).toBe(false);
    expect(isolate('chirp', e).signal.code.enabled).toBe(false);
  });
});

describe('URL state', () => {
  it('round-trips an experiment through the query string', () => {
    let e = buildPresetExperiment(PRESETS.find((p) => p.id === 'coherent-train')!);
    e = setPath(e, 'signal.repetition.prfHz', 2.5e6);
    e = setPath(e, 'signal.carrier.frequencyHz', 1.2e9);
    const q = experimentToQuery(e, 'coherent-train');
    expect(q).toContain('preset=coherent-train');
    expect(q).toContain('prf=2500000');
    const back = queryToExperiment(q)!;
    expect(back.experiment.signal.repetition.prfHz).toBe(2.5e6);
    expect(back.experiment.signal.carrier.frequencyHz).toBe(1.2e9);
    expect(back.presetId).toBe('coherent-train');
  });

  it('sanitizes hostile input', () => {
    const s = sanitizeExperiment({ signal: { sampling: { sampleCount: 1e12 }, pulse: { envelope: 'nope' } }, extra: 1 });
    expect(s.signal.sampling.sampleCount).toBe(131072);
    expect(s.signal.pulse.envelope).toBe(DEFAULT_EXPERIMENT.signal.pulse.envelope);
    expect('extra' in s).toBe(false);
  });
});

describe('units', () => {
  it('formats engineering values', () => {
    expect(formatEngineering(1.24e-8, 's')).toBe('12.4 ns');
    expect(formatEngineering(1e9, 'Hz', 4)).toBe('1.000 GHz');
    expect(formatEngineering(48.83e3, 'Hz')).toBe('48.8 kHz');
    expect(formatEngineering(0, 'Hz')).toBe('0 Hz');
  });
  it('parses engineering input', () => {
    expect(parseEngineering('2.5 GHz', 'Hz')).toBeCloseTo(2.5e9);
    expect(parseEngineering('10 mhz', 'Hz')).toBeCloseTo(10e6);
    expect(parseEngineering('1 ns', 's')).toBeCloseTo(1e-9);
    expect(parseEngineering('20n', 's')).toBeCloseTo(20e-9);
    expect(parseEngineering('3 us', 's')).toBeCloseTo(3e-6);
    expect(parseEngineering('1e-9', 's')).toBeCloseTo(1e-9);
    expect(parseEngineering('5', 's', 1e-9)).toBeCloseTo(5e-9);
    expect(parseEngineering('45 deg', 'rad')).toBeCloseTo(Math.PI / 4);
    expect(parseEngineering('abc', 's')).toBeNull();
  });
});

describe('time–frequency frequency range', () => {
  it('starts one-sided from the spectrum view and is independent of it', async () => {
    const { buildPresetById } = await import('@/lib/presets/apply');
    const { setPath } = await import('@/lib/state/path');
    const exp = buildPresetById('long-rf-burst');
    const s = exp.analysis.spectrum.range;
    expect(exp.analysis.tfRange).toEqual({ mode: 'manual', min: s.min, max: s.max });
    const full = setPath(exp, 'analysis.tfRange', { mode: 'full', min: 0, max: 0 });
    expect(full.analysis.spectrum.range).toEqual(s);
  });

  it('fitTfRange is never negative, even for a two-sided spectrum', async () => {
    const { buildPresetById, fitTfRange } = await import('@/lib/presets/apply');
    const { setPath } = await import('@/lib/state/path');
    const exp = setPath(buildPresetById('default'), 'analysis.spectrum.sided', 'two');
    const r = fitTfRange(exp);
    expect(r.mode).toBe('manual');
    expect(r.min).toBeGreaterThanOrEqual(0);
    expect(r.max).toBeGreaterThan(r.min);
  });
});

describe('power & instrument presets', () => {
  const build = (id: string) => buildPresetExperiment(PRESETS.find((p) => p.id === id)!);

  it('uwb-gaussian-50ohm reproduces 2 W / 1.77245 nJ / 177.245 µW', () => {
    const e = build('uwb-gaussian-50ohm');
    const sig = generateSignal(e.signal);
    const ctx = powerContext(e.signal.amplitudeUnit, e.analysis.load.resistanceOhm)!;
    const s = energyStats(sig.singlePulse, sig.fs, ctx.impedance);
    expect(s.peakPower).toBeCloseTo(2, 4);
    expect(s.energy / 1.77245385e-9).toBeCloseTo(1, 4);
    expect(periodicStats(sig.singlePulse, sig.fs, e.signal.repetition.prfHz, ctx.impedance).averagePower / 177.245385e-6).toBeCloseTo(1, 4);
  });

  it('field-10vm-air: S_pk = 0.26544 W/m² (E²/η₀)', () => {
    const e = build('field-10vm-air');
    expect(e.signal.amplitudeUnit).toBe('V/m');
    const sig = generateSignal(e.signal);
    expect(energyStats(sig.singlePulse, sig.fs, ETA0).peakPower).toBeCloseTo(0.265442, 5);
  });

  it('uwb-monocycle-power has ~zero net area while its Gaussian partner (A side) does not', () => {
    const p = PRESETS.find((q) => q.id === 'uwb-monocycle-power')!;
    const a = generateSignal(buildCompareExperiment(p)!.signal);
    const b = generateSignal(buildPresetExperiment(p).signal);
    expect(Math.abs(energyStats(b.singlePulse, b.fs, 50).netArea)).toBeLessThan(1e-3 * Math.abs(energyStats(a.singlePulse, a.fs, 50).netArea));
  });

  it('prf-overlap-power really overlaps and differs from E·PRF', () => {
    const e = build('prf-overlap-power');
    const sig = generateSignal(e.signal);
    const r = periodicStats(sig.singlePulse, sig.fs, e.signal.repetition.prfHz, 50);
    expect(r.overlap).toBe(true);
    const naive = energyStats(sig.singlePulse, sig.fs, 50).energy * e.signal.repetition.prfHz;
    expect(r.averagePower / naive).toBeGreaterThan(1.2);
  });

  type Metrics = ReturnType<typeof simulateInstrument>['metrics'];
  it.each([
    ['scope-bandwidth-limit', (m: Metrics) => expect(m.peakErrorDisplayedPct).toBeLessThan(-35)],
    ['scope-trigger-jitter', (m: Metrics) => expect(m.peakDisplayed / m.peakTrue).toBeCloseTo(0.8944, 1)],
    ['scope-undersampling', (m: Metrics) => expect(m.peakSampled / m.peakTrue).toBeLessThan(0.95)],
    ['scope-adc-clipping', (m: Metrics) => expect(m.peakSampled / m.peakTrue).toBeCloseTo(0.7, 6)],
  ])('%s demonstrates its effect', (id, check) => {
    const e = build(id as string);
    const sig = generateSignal(e.signal);
    check(simulateInstrument(sig.xIdeal, sig.fs, e.analysis.instrument).metrics);
  });

  it('new presets open the matching tab', () => {
    for (const id of ['uwb-gaussian-50ohm', 'uwb-monocycle-power', 'field-10vm-air', 'prf-overlap-power']) expect(PRESETS.find((p) => p.id === id)!.tab).toBe('power');
    for (const id of ['scope-bandwidth-limit', 'scope-trigger-jitter', 'scope-undersampling', 'scope-adc-clipping']) expect(PRESETS.find((p) => p.id === id)!.tab).toBe('instrument');
  });
});

describe('radar & pulse-compression presets', () => {
  const compress = (id: string, compare = false) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const e = compare ? buildCompareExperiment(p)! : buildPresetExperiment(p);
    const c = e.analysis.compression;
    return analyzeCompression(generateSignal(e.signal), e.signal, { reference: c.reference, weighting: c.weighting, dopplerHz: c.dopplerHz });
  };
  const near = (v: number, want: number, rel: number) => expect(Math.abs(v / want - 1)).toBeLessThan(rel);

  it('all open the Pulse compression tab', () => {
    for (const p of PRESETS.filter((x) => x.category === 'Radar & pulse compression')) expect(p.tab).toBe('compression');
  });
  it('mf-rect-pulse: triangle, τ_c = (2 − √2)·τ', () => {
    const r = compress('mf-rect-pulse');
    near(r.metrics.widthSec, (2 - Math.SQRT2) * 1e-6, 0.01);
    near(r.metrics.ratio, 1 / (2 - Math.SQRT2), 0.02);
  });
  it('lfm-tb100: τ_c ≈ 0.886/B, PSLR ≈ −13.3 dB, ratio ≈ 113', () => {
    const r = compress('lfm-tb100');
    near(r.metrics.widthSec, 0.886 / 100e6, 0.02);
    expect(Math.abs(r.metrics.pslrDb + 13.26)).toBeLessThan(0.3);
    near(r.metrics.ratio, 113, 0.03);
  });
  it('lfm-hamming: low sidelobes, 1.34 dB loss, wider mainlobe', () => {
    const plain = compress('lfm-tb100');
    const r = compress('lfm-hamming');
    expect(r.metrics.pslrDb).toBeLessThan(-38);
    expect(Math.abs(r.metrics.weightingLossDb - 1.34)).toBeLessThan(0.05);
    near(r.metrics.widthSec / plain.metrics.widthSec, 1.47, 0.05);
  });
  it('lfm-doppler-coupling: −250 ns shift, 0.92 dB loss, inside the narrowband limit', () => {
    const r = compress('lfm-doppler-coupling');
    near(r.metrics.delayShift, -250e-9, 0.02);
    expect(Math.abs(r.metrics.dopplerLossDb - 0.915)).toBeLessThan(0.1);
    expect(r.narrowband.exceeded).toBe(false);
  });
  it('barker-13: PSLR = 1/13', () => {
    expect(Math.abs(compress('barker-13').metrics.pslrDb + 22.28)).toBeLessThan(0.1);
  });
  it('p4-64: PSLR ≈ −24.4 dB', () => {
    expect(Math.abs(compress('p4-64').metrics.pslrDb + 24.36)).toBeLessThan(0.4);
  });
  it('coherent-train-ambiguity: 9.03 dB integration gain, −1.16 dB ambiguities at ±PRI', () => {
    const r = compress('coherent-train-ambiguity');
    expect(Math.abs(r.metrics.integrationGainDb! - 9.031)).toBeLessThan(0.05);
    for (const m of [-1, 1]) {
      const a = r.metrics.ambiguities.find((x) => x.m === m)!;
      expect(Math.abs(a.db - 20 * Math.log10(7 / 8))).toBeLessThan(0.05);
    }
  });
  it('same-energy-detection: equal energy (equal 2E/N₀), very different resolution', () => {
    const b = compress('same-energy-detection');
    const a = compress('same-energy-detection', true);
    expect(Math.abs(10 * Math.log10(a.metrics.referenceSumSq / b.metrics.referenceSumSq))).toBeLessThan(0.01);
    expect(10 * Math.log10(b.metrics.referenceSumSq)).toBeCloseTo(33.01, 1); // σ = 1
    expect(a.metrics.widthSec / b.metrics.widthSec).toBeGreaterThan(60);
  });
});

describe('A/B comparison when a preset is loaded', () => {
  const preset = (id: string) => PRESETS.find((p) => p.id === id)!;
  const withA = preset('same-energy-detection');
  const withoutA = preset('barker-13');
  const mine = setPath(DEFAULT_EXPERIMENT, 'signal.pulse.widthSec', 7e-9);

  it("a preset's own A replaces a previous preset's A silently", () => {
    const r = compareAfterPreset(preset('uwb-monocycle-power'), { exp: mine, origin: 'preset' });
    expect(r.compare?.origin).toBe('preset');
    expect(r.compare?.exp).toEqual(buildCompareExperiment(preset('uwb-monocycle-power')));
    expect(r.note).toBeNull();
  });
  it("a preset's own A replaces an A the user saved, and says so", () => {
    const r = compareAfterPreset(withA, { exp: mine, origin: 'user' });
    expect(r.compare?.exp).toEqual(buildCompareExperiment(withA));
    expect(r.note).toMatch(/replaced/i);
  });
  it('an A that came from a preset is cleared when the next preset has none', () => {
    const r = compareAfterPreset(withoutA, { exp: buildCompareExperiment(withA)!, origin: 'preset' });
    expect(r.compare).toBeNull();
    expect(r.note).toMatch(/cleared/i);
  });
  it('an A the user saved is kept when the next preset has none', () => {
    const r = compareAfterPreset(withoutA, { exp: mine, origin: 'user' });
    expect(r.compare).toEqual({ exp: mine, origin: 'user' });
    expect(r.note).toBeNull();
  });
  it('no A before and none in the preset → none after', () => {
    expect(compareAfterPreset(withoutA, null)).toEqual({ compare: null, note: null });
  });
});
