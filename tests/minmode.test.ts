import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/lib/presets/presets';
import { buildPresetExperiment } from '@/lib/presets/apply';
import { DEFAULT_EXPERIMENT } from '@/lib/presets/defaults';
import { describeRequirements, minimumMode, modeRequirements, planModeUpgrade } from '@/lib/presets/minMode';
import { setPath } from '@/lib/state/path';
import type { Experiment, UiMode } from '@/types/signal';

const set = (e: Experiment, entries: [string, unknown][]) => entries.reduce((acc, [p, v]) => setPath(acc, p, v), e);
const train = (e: Experiment) => set(e, [['signal.repetition.enabled', true]]);

describe('minimumMode (derived from the signal configuration)', () => {
  it('the default experiment needs only Basic', () => {
    expect(minimumMode(DEFAULT_EXPERIMENT)).toBe('basic');
    expect(modeRequirements(DEFAULT_EXPERIMENT)).toEqual([]);
  });

  it('a chirp needs Advanced', () => {
    const e = set(DEFAULT_EXPERIMENT, [['signal.chirp.enabled', true]]);
    expect(minimumMode(e)).toBe('advanced');
    expect(modeRequirements(e)[0].reason).toMatch(/chirp/);
  });

  it('jitter counts only for a pulse train', () => {
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.jitter.timingEnabled', true]]))).toBe('basic');
    expect(minimumMode(set(train(DEFAULT_EXPERIMENT), [['signal.jitter.timingEnabled', true]]))).toBe('advanced');
  });

  it('coherence settings count only for a train with a carrier', () => {
    const incoherent: [string, unknown][] = [['signal.coherence.mode', 'incoherent']];
    expect(minimumMode(set(DEFAULT_EXPERIMENT, incoherent))).toBe('basic'); // no train
    expect(minimumMode(set(train(DEFAULT_EXPERIMENT), incoherent))).toBe('advanced');
    expect(minimumMode(set(train(DEFAULT_EXPERIMENT), [...incoherent, ['signal.carrier.enabled', false]]))).toBe('basic'); // phase has no effect
  });

  it('finite rise/fall time needs Advanced for a rect pulse only', () => {
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.pulse.edgesEnabled', true]]))).toBe('advanced');
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.pulse.edgesEnabled', true], ['signal.pulse.envelope', 'gaussian']]))).toBe('basic');
  });

  it('quantization and the aliasing demonstration need Advanced', () => {
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.sampling.quantizationEnabled', true]]))).toBe('advanced');
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.sampling.aliasingDemo', true]]))).toBe('advanced');
  });

  it('modulation, noise, pulse position and edge shape need Expert', () => {
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.am.enabled', true]]))).toBe('expert');
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.noise.enabled', true]]))).toBe('expert');
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.pulse.autoCenter', false]]))).toBe('expert');
    expect(minimumMode(set(DEFAULT_EXPERIMENT, [['signal.pulse.edgesEnabled', true], ['signal.pulse.edgeShape', 'cosine']]))).toBe('expert');
  });

  it('the highest requirement wins, and preset-declared requirements are included', () => {
    const e = set(DEFAULT_EXPERIMENT, [['signal.chirp.enabled', true], ['signal.noise.enabled', true]]);
    expect(minimumMode(e)).toBe('expert');
    expect(minimumMode(DEFAULT_EXPERIMENT, [{ mode: 'advanced', reason: 'x' }])).toBe('advanced');
    expect(planModeUpgrade(DEFAULT_EXPERIMENT, 'basic', { extra: [{ mode: 'advanced', reason: 'the FFT window options' }] })?.note).toBe('Switched to Advanced mode: this preset uses the FFT window options.');
  });

  it('presentation-only settings do not escalate the mode', () => {
    const e = set(DEFAULT_EXPERIMENT, [
      ['analysis.spectrum.zeroPad', 8],
      ['analysis.spectrum.scaling', 'amplitude'],
      ['analysis.stft.windowLength', 32],
      ['signal.pulse.envelope', 'gaussian'],
    ]);
    expect(minimumMode(e)).toBe('basic');
  });
});

describe('planModeUpgrade', () => {
  const chirp = set(DEFAULT_EXPERIMENT, [['signal.chirp.enabled', true]]);

  it('upgrades Basic → Advanced and says why', () => {
    const u = planModeUpgrade(chirp, 'basic')!;
    expect(u.to).toBe('advanced');
    expect(u.note).toBe('Switched to Advanced mode: this preset uses the chirp parameters.');
  });

  it('never downgrades and does nothing when the current mode already suffices', () => {
    expect(planModeUpgrade(chirp, 'advanced')).toBeNull();
    expect(planModeUpgrade(chirp, 'expert')).toBeNull();
    expect(planModeUpgrade(DEFAULT_EXPERIMENT, 'basic')).toBeNull();
  });

  it('from Advanced it names only what Advanced does not already show', () => {
    const e = set(chirp, [['signal.noise.enabled', true]]);
    const u = planModeUpgrade(e, 'advanced')!;
    expect(u.to).toBe('expert');
    expect(u.note).toBe('Switched to Expert mode: this preset uses the modulation and noise controls.');
  });

  it('wording can be adapted for a link or a plain configuration', () => {
    expect(planModeUpgrade(chirp, 'basic', { verb: 'Opened in', subject: 'configuration' })?.note).toBe('Opened in Advanced mode: this configuration uses the chirp parameters.');
  });

  it('joins several reasons', () => {
    const e = set(train(DEFAULT_EXPERIMENT), [['signal.jitter.timingEnabled', true], ['signal.chirp.enabled', true]]);
    expect(describeRequirements(modeRequirements(e), 'advanced')).toBe('the chirp parameters and the jitter controls');
  });
});

describe('every preset (pinned, so a change here is a conscious decision)', () => {
  // Everything not listed needs only Basic.
  const EXPECTED: Record<string, UiMode> = {
    'incoherent-train': 'advanced',
    'timing-jitter': 'advanced',
    'phase-jitter': 'advanced',
    'linear-chirp': 'advanced',
    aliasing: 'advanced',
    'spectral-leakage': 'advanced',
    'stft-resolution': 'advanced',
    'exp-rise-time': 'advanced',
    'exp-undersample': 'advanced',
  };

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s', (id, p) => {
    expect(minimumMode(buildPresetExperiment(p), p.minMode ? [p.minMode] : [])).toBe(EXPECTED[id] ?? 'basic');
  });

  it('no preset forces Expert mode', () => {
    for (const p of PRESETS) expect(minimumMode(buildPresetExperiment(p), p.minMode ? [p.minMode] : [])).not.toBe('expert');
  });
});
