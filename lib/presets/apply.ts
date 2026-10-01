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
