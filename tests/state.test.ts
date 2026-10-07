import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPERIMENT } from '@/lib/presets/defaults';
import { sanitizeExperiment } from '@/lib/state/sanitize';
import { experimentToQuery, queryToExperiment } from '@/lib/state/url';
import { setPath } from '@/lib/state/path';
import { amplitudeUnitLabel, formatEngineering } from '@/lib/units/format';
import { waveformCsv } from '@/lib/export';
import { generateSignal } from '@/lib/dsp/signals';

describe('new config groups', () => {
  it('defaults: 50 Ω load and a 1 GHz / 10 GS/s instrument', () => {
    expect(DEFAULT_EXPERIMENT.analysis.load.resistanceOhm).toBe(50);
    expect(DEFAULT_EXPERIMENT.analysis.instrument).toMatchObject({
      bandwidthHz: 1e9,
      sampleRateHz: 10e9,
      samplePhasePct: 0,
      triggerJitterRmsSec: 0,
      clipEnabled: false,
      clipRatio: 1.2,
    });
  });
  it('sanitize accepts V/m and clamps instrument/load ranges', () => {
    let e = setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'V/m');
    expect(sanitizeExperiment(e).signal.amplitudeUnit).toBe('V/m');
    e = setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'furlongs');
    expect(sanitizeExperiment(e).signal.amplitudeUnit).toBe('normalized');
    e = setPath(setPath(setPath(DEFAULT_EXPERIMENT, 'analysis.load.resistanceOhm', -5), 'analysis.instrument.samplePhasePct', 400), 'analysis.instrument.bandwidthHz', 1);
    const s = sanitizeExperiment(e).analysis;
    expect(s.load.resistanceOhm).toBe(0.1);
    expect(s.instrument.samplePhasePct).toBe(100);
    expect(s.instrument.bandwidthHz).toBe(1e6);
  });
  it('URL round-trips the new keys', () => {
    let e = setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'V/m');
    e = setPath(e, 'analysis.load.resistanceOhm', 75);
    e = setPath(e, 'analysis.instrument.bandwidthHz', 3e8);
    e = setPath(e, 'analysis.instrument.clipEnabled', true);
    const q = experimentToQuery(e, 'default');
    const back = queryToExperiment(q)!.experiment;
    expect(back.signal.amplitudeUnit).toBe('V/m');
    expect(back.analysis.load.resistanceOhm).toBe(75);
    expect(back.analysis.instrument.bandwidthHz).toBe(3e8);
    expect(back.analysis.instrument.clipEnabled).toBe(true);
  });
});

describe('units', () => {
  it('formats W, J, V/m, W/m², J/m², Ω with SI prefixes', () => {
    expect(formatEngineering(1.77245e-9, 'J')).toBe('1.77 nJ');
    expect(formatEngineering(177.245e-6, 'W')).toBe('177 µW');
    expect(formatEngineering(0.2654, 'W/m²')).toBe('265 mW/m²');
    expect(formatEngineering(10e3, 'V/m')).toBe('10.0 kV/m');
    expect(formatEngineering(50, 'Ω')).toBe('50.0 Ω');
  });
  it('amplitudeUnitLabel', () => {
    expect(amplitudeUnitLabel('normalized')).toBe('norm.');
    expect(amplitudeUnitLabel('V')).toBe('V');
    expect(amplitudeUnitLabel('V/m')).toBe('V/m');
  });
  it('CSV header names the field unit', () => {
    const sig = generateSignal(setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'V/m').signal);
    expect(waveformCsv(sig, 'V/m').split('\n')[0]).toContain('V_per_m');
  });
});

describe('phase-code config', () => {
  it('defaults to a disabled Barker-13', () => {
    expect(DEFAULT_EXPERIMENT.signal.code).toEqual({ enabled: false, family: 'barker', length: 13 });
  });
  it('sanitize snaps the length to the family and rejects unknown families', () => {
    let e = setPath(DEFAULT_EXPERIMENT, 'signal.code', { enabled: true, family: 'frank', length: 50 });
    expect(sanitizeExperiment(e).signal.code).toEqual({ enabled: true, family: 'frank', length: 49 });
    e = setPath(DEFAULT_EXPERIMENT, 'signal.code', { enabled: true, family: 'golay', length: 7 });
    expect(sanitizeExperiment(e).signal.code.family).toBe('barker');
    e = setPath(DEFAULT_EXPERIMENT, 'signal.code', { enabled: true, family: 'p4', length: 1e6 });
    expect(sanitizeExperiment(e).signal.code.length).toBe(256);
    e = setPath(DEFAULT_EXPERIMENT, 'signal.signalType', 'phase-code');
    expect(sanitizeExperiment(e).signal.signalType).toBe('phase-code');
  });
  it('URL round-trips a P4-37 code', () => {
    const e = setPath(DEFAULT_EXPERIMENT, 'signal.code', { enabled: true, family: 'p4', length: 37 });
    const q = experimentToQuery(e, 'default');
    expect(q).toContain('pce=1');
    expect(q).toContain('pcf=p4');
    expect(q).toContain('pcl=37');
    expect(queryToExperiment(q)!.experiment.signal.code).toEqual({ enabled: true, family: 'p4', length: 37 });
  });
});

describe('compression config', () => {
  it('URL round-trips every compression key', () => {
    let e = DEFAULT_EXPERIMENT;
    const entries: [string, unknown][] = [
      ['analysis.compression.reference', 'train'],
      ['analysis.compression.weighting', 'blackman-harris'],
      ['analysis.compression.dopplerHz', -2.5e6],
      ['analysis.compression.displayDb', false],
      ['analysis.compression.dbFloor', -80],
      ['analysis.compression.ambiguity.autoSpan', false],
      ['analysis.compression.ambiguity.delaySpanSec', 3e-7],
      ['analysis.compression.ambiguity.dopplerSpanHz', 7e6],
      ['analysis.compression.ambiguity.dbRange', 55],
    ];
    for (const [p, v] of entries) e = setPath(e, p, v);
    const q = experimentToQuery(e, 'default');
    for (const k of ['mfr=', 'mfw=', 'mfd=', 'mfl=', 'mff=', 'afa=', 'aft=', 'aff=', 'afr=']) expect(q).toContain(k);
    expect(queryToExperiment(q)!.experiment.analysis.compression).toEqual(e.analysis.compression);
  });
  it('sanitize clamps ranges and rejects unknown enums', () => {
    let e = setPath(DEFAULT_EXPERIMENT, 'analysis.compression.ambiguity.dbRange', 500);
    e = setPath(e, 'analysis.compression.dopplerHz', 1e15);
    e = setPath(e, 'analysis.compression.weighting', 'kaiser');
    e = setPath(e, 'analysis.compression.reference', 'echo');
    const c = sanitizeExperiment(e).analysis.compression;
    expect(c.ambiguity.dbRange).toBe(120);
    expect(c.dopplerHz).toBe(1e12);
    expect(c.weighting).toBe('rect');
    expect(c.reference).toBe('pulse');
  });
});
