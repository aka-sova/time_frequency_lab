/**
 * One-parameter sweeps: every other parameter is held fixed while one is
 * stepped, and measurements are computed from the actual generated waveform
 * at each step.
 */
import type { Experiment } from '@/types/signal';
import { analyzeLight } from './analyze';
import { setPath } from '@/lib/state/path';

export interface SweepParameter {
  id: string;
  label: string;
  path: string;
  unit: 's' | 'Hz' | 'rad' | '' ;
  min: number;
  max: number;
  log: boolean;
  integer?: boolean;
  /** Extra settings applied so the swept parameter actually takes effect. */
  enable?: Record<string, unknown>;
}

export const SWEEP_PARAMETERS: SweepParameter[] = [
  { id: 'pw', label: 'Pulse width τ', path: 'signal.pulse.widthSec', unit: 's', min: 1e-9, max: 100e-9, log: true, enable: { 'signal.pulse.enabled': true } },
  { id: 'tr', label: 'Rise & fall time', path: 'signal.pulse.riseTimeSec', unit: 's', min: 0.5e-9, max: 20e-9, log: true, enable: { 'signal.pulse.enabled': true, 'signal.pulse.envelope': 'rect', 'signal.pulse.edgesEnabled': true } },
  { id: 'f0', label: 'Carrier frequency f₀', path: 'signal.carrier.frequencyHz', unit: 'Hz', min: 0.5e9, max: 2e9, log: false, enable: { 'signal.carrier.enabled': true } },
  { id: 'prf', label: 'PRF', path: 'signal.repetition.prfHz', unit: 'Hz', min: 5e6, max: 40e6, log: true, enable: { 'signal.repetition.enabled': true, 'signal.pulse.enabled': true } },
  { id: 'np', label: 'Number of pulses', path: 'signal.repetition.pulseCount', unit: '', min: 1, max: 32, log: true, integer: true, enable: { 'signal.repetition.enabled': true, 'signal.pulse.enabled': true } },
  { id: 'pn', label: 'Phase noise σφ', path: 'signal.coherence.phaseNoiseRmsRad', unit: 'rad', min: 0, max: 2, log: false, enable: { 'signal.coherence.mode': 'partial', 'signal.repetition.enabled': true } },
  { id: 'tj', label: 'Timing jitter σt', path: 'signal.jitter.timingRmsSec', unit: 's', min: 0, max: 500e-12, log: false, enable: { 'signal.jitter.timingEnabled': true, 'signal.repetition.enabled': true } },
  { id: 'fs', label: 'Sample rate fₛ', path: 'signal.sampling.sampleRateHz', unit: 'Hz', min: 1e9, max: 20e9, log: true, enable: { 'signal.sampling.mode': 'manual' } },
];

export type SweepMetric =
  | 'bw3'
  | 'bw99'
  | 'bwRms'
  | 'bw40'
  | 'envBw3'
  | 'tbpRms'
  | 'tbpFwhm'
  | 'peak'
  | 'combSpacing'
  | 'combContrast'
  | 'peakFreq';

export const SWEEP_METRICS: { id: SweepMetric; label: string; unit: string }[] = [
  { id: 'envBw3', label: '−3 dB bandwidth (single-pulse envelope)', unit: 'Hz' },
  { id: 'bw3', label: '−3 dB bandwidth (displayed spectrum / line width)', unit: 'Hz' },
  { id: 'bw99', label: '99 % occupied bandwidth', unit: 'Hz' },
  { id: 'bw40', label: '−40 dB bandwidth (tail content)', unit: 'Hz' },
  { id: 'bwRms', label: 'RMS bandwidth σf', unit: 'Hz' },
  { id: 'tbpRms', label: 'σt·σf', unit: '' },
  { id: 'tbpFwhm', label: 'τ_FWHM · B₋₃dB', unit: '' },
  { id: 'peak', label: 'Peak spectral magnitude', unit: '' },
  { id: 'peakFreq', label: 'Spectral peak frequency', unit: 'Hz' },
  { id: 'combSpacing', label: 'Measured comb line spacing', unit: 'Hz' },
  { id: 'combContrast', label: 'Comb line-to-valley contrast', unit: 'dB' },
];

export interface SweepRow {
  value: number;
  metrics: Record<SweepMetric, number>;
}

export function sweepValues(start: number, stop: number, steps: number, log: boolean, integer = false): number[] {
  const n = Math.max(2, Math.min(60, Math.round(steps)));
  const out: number[] = [];
  const useLog = log && start > 0 && stop > 0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let v = useLog ? start * (stop / start) ** u : start + (stop - start) * u;
    if (integer) v = Math.round(v);
    if (!out.length || out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

export function runSweep(base: Experiment, param: SweepParameter, values: number[]): SweepRow[] {
  let exp = base;
  for (const [p, v] of Object.entries(param.enable ?? {})) exp = setPath(exp, p, v);
  return values.map((value) => {
    let e = setPath(exp, param.path, value);
    if (param.id === 'tr') e = setPath(e, 'signal.pulse.fallTimeSec', value);
    const { measurements: m } = analyzeLight(e);
    const env = m.single ?? m.full;
    return {
      value,
      metrics: {
        envBw3: env.bw3.width,
        bw3: m.full.bw3.width,
        bw99: m.full.obw99.width,
        bw40: m.full.bw40.width,
        bwRms: m.uncertainty.sigmaF,
        tbpRms: m.tbp.rms,
        tbpFwhm: m.tbp.fwhm3dB,
        peak: m.full.peakMagnitude,
        peakFreq: m.full.peakFrequency,
        combSpacing: m.comb?.spacing ?? NaN,
        combContrast: m.comb?.contrastDb ?? NaN,
      },
    };
  });
}

/** Runs a sweep and reports the elapsed wall-clock time. */
export function runSweepTimed(base: Experiment, param: SweepParameter, values: number[]): { rows: SweepRow[]; ms: number } {
  const t0 = performance.now();
  const rows = runSweep(base, param, values);
  return { rows, ms: performance.now() - t0 };
}
