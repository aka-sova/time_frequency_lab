import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/lib/presets/presets';
import { buildPresetExperiment, buildCompareExperiment } from '@/lib/presets/apply';
import { estimateSpectralExtent, resolveSampling } from '@/lib/dsp/sampling';
import { analyzeLight } from '@/lib/dsp/analyze';
import { experimentToQuery, queryToExperiment } from '@/lib/state/url';
import { sanitizeExperiment } from '@/lib/state/sanitize';
import { DEFAULT_EXPERIMENT } from '@/lib/presets/defaults';
import { isolate } from '@/lib/presets/isolate';
import { setPath } from '@/lib/state/path';
import { formatEngineering, parseEngineering } from '@/lib/units/format';
import { collectWarnings } from '@/lib/dsp/warnings';

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
