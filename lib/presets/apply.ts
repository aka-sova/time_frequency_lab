import type { AxisRange, Experiment } from '@/types/signal';
import { analyzeLight } from '@/lib/dsp/analyze';
import { pulseDuration } from '@/lib/dsp/sampling';
import { getPath, setPath } from '@/lib/state/path';
import { DEFAULT_EXPERIMENT, mergeExperiment } from './defaults';
import { getPreset, type Preset } from './presets';

/** Time view covering all pulses with a margin (or a few carrier periods for CW). */
export function fitTimeRange(exp: Experiment): AxisRange {
  const { signal } = analyzeLight(exp);
  const T = signal.observation;
  const cfg = exp.signal;
  if (!cfg.pulse.enabled) {
    const f = signal.carrier.on ? Math.max(signal.carrier.centerHz, 1) : 1 / T;
    if (signal.carrier.chirpRate !== 0) return { mode: 'full', min: 0, max: T };
    return { mode: 'manual', min: 0, max: Math.min(T, 8 / f) };
  }
  const d = pulseDuration(cfg);
  const first = signal.pulses[0].tCenter;
  const last = signal.pulses[signal.pulses.length - 1].tCenter;
  const margin = Math.max(1.5 * d, 0.05 * (last - first));
  const min = Math.max(0, first - margin);
  const max = Math.min(T, last + margin);
  if (max - min > 0.8 * T) return { mode: 'full', min: 0, max: T };
  return { mode: 'manual', min, max };
}

/** Frequency view around the (single-pulse) spectral envelope. */
export function fitFrequencyRange(exp: Experiment): AxisRange {
  const { signal, measurements: m } = analyzeLight(exp);
  const nyq = signal.fs / 2;
  const env = m.single ?? m.full;
  const bins = 40 * m.recordBinSpacing;
  const w = Math.max(env.obw90.valid ? env.obw90.width : 0, bins);
  if (m.kind === 'baseband') {
    const hi = Math.min(nyq, Math.max(env.obw90.valid ? 6 * env.obw90.high : 0, bins));
    return { mode: 'manual', min: 0, max: hi };
  }
  const c = Number.isFinite(env.peakFrequency) ? env.peakFrequency : nyq / 2;
  const min = Math.max(0, c - 3.5 * w);
  const max = Math.min(nyq, c + 3.5 * w);
  if (exp.analysis.spectrum.sided === 'two') return { mode: 'manual', min: -max, max };
  return { mode: 'manual', min, max };
}

/** Fold a (possibly two-sided) spectrum range onto 0 … f_N for the time–frequency panel. */
export function oneSidedRange(r: AxisRange): AxisRange {
  if (r.mode !== 'manual') return { mode: 'full', min: 0, max: 0 };
  const lo = r.min < 0 && r.max > 0 ? 0 : Math.min(Math.abs(r.min), Math.abs(r.max));
  const hi = Math.max(Math.abs(r.min), Math.abs(r.max));
  return { mode: 'manual', min: lo, max: hi };
}

/** Time–frequency view around the spectral envelope (always one-sided). */
export function fitTfRange(exp: Experiment): AxisRange {
  return oneSidedRange(fitFrequencyRange(exp));
}

export function applyLocks(next: Experiment, current: Experiment, locks: string[]): Experiment {
  let out = next;
  for (const p of locks) out = setPath(out, `signal.${p}`, getPath(current, `signal.${p}`));
  return out;
}

export function buildPresetExperiment(preset: Preset, current?: Experiment, locks: string[] = []): Experiment {
  let exp = mergeExperiment(DEFAULT_EXPERIMENT, preset.experiment);
  if (current && locks.length) exp = applyLocks(exp, current, locks);
  const hasTime = preset.experiment.analysis?.time?.range !== undefined;
  const hasFreq = preset.experiment.analysis?.spectrum?.range !== undefined;
  if (preset.fitTime ?? !hasTime) exp = setPath(exp, 'analysis.time.range', fitTimeRange(exp));
  if (preset.fitFrequency ?? !hasFreq) exp = setPath(exp, 'analysis.spectrum.range', fitFrequencyRange(exp));
  // The time–frequency axis starts where the spectrum view does, unless the preset sets its own.
  if (preset.experiment.analysis?.tfRange === undefined) exp = setPath(exp, 'analysis.tfRange', oneSidedRange(exp.analysis.spectrum.range));
  return exp;
}

const presetCache = new Map<string, Experiment>();

/** Preset experiment without locks (cached: fitting runs a full analysis). */
export function buildPresetById(id: string): Experiment {
  const hit = presetCache.get(id);
  if (hit) return hit;
  const p = getPreset(id);
  const exp = p ? buildPresetExperiment(p) : DEFAULT_EXPERIMENT;
  presetCache.set(id, exp);
  return exp;
}

export function buildCompareExperiment(preset: Preset): Experiment | null {
  if (!preset.compareWith) return null;
  return mergeExperiment(DEFAULT_EXPERIMENT, preset.compareWith);
}

/** Who put the current A side there: a preset's `compareWith`, or the user (Save as A, swap). */
export type CompareOrigin = 'preset' | 'user';

export interface CompareState {
  exp: Experiment;
  origin: CompareOrigin;
}

/**
 * The A side after loading `preset`. A preset's own A always replaces the current one. An A that
 * belonged to the previous preset is cleared when the new preset has none (it would compare two
 * unrelated lessons); an A the user saved is kept, so presets can be compared against it.
 * `note` is a sentence for the message bar when the user should know what happened to A.
 */
export function compareAfterPreset(preset: Preset, current: CompareState | null): { compare: CompareState | null; note: string | null } {
  const own = buildCompareExperiment(preset);
  if (own) return { compare: { exp: own, origin: 'preset' }, note: current?.origin === 'user' ? 'Your saved A was replaced by this preset’s A side.' : null };
  if (current?.origin === 'preset') return { compare: null, note: 'The previous preset’s A/B comparison was cleared.' };
  return { compare: current, note: null };
}
