/**
 * Validates and clamps an experiment coming from untrusted sources (URL,
 * imported JSON). Unknown keys are dropped by merging onto defaults; enums
 * fall back to defaults; numbers are clamped to physically sensible ranges.
 */
import type { Experiment } from '@/types/signal';
import { DEFAULT_EXPERIMENT } from '@/lib/presets/defaults';
import { MAX_SAMPLES, MIN_SAMPLES } from '@/lib/dsp/sampling';
import { getPath, isPlainObject, setPath } from './path';

type Rule = { path: string; min?: number; max?: number; int?: boolean; values?: readonly string[] };

export const ENUMS = {
  signalType: ['sinusoid', 'rect', 'gaussian', 'gaussian-derivative', 'burst', 'pulse-train', 'chirp', 'composite'],
  envelope: ['rect', 'gaussian', 'gaussian-d1', 'gaussian-d2', 'hann', 'hamming', 'blackman', 'tukey'],
  edgeShape: ['linear', 'cosine'],
  coherence: ['coherent', 'increment', 'partial', 'incoherent'],
  reference: ['continuous', 'pulse'],
  ampVar: ['none', 'ramp', 'alternating'],
  jitterMode: ['random', 'periodic'],
  samplingMode: ['auto', 'manual'],
  display: ['magnitude', 'normalized', 'db', 'power', 'psd'],
  scaling: ['ft', 'amplitude'],
  sided: ['one', 'two'],
  window: ['rect', 'hann', 'hamming', 'blackman', 'blackman-harris', 'flattop'],
  wavelet: ['morlet', 'mexican-hat'],
  tfView: ['stft', 'cwt', 'compare'],
  rangeMode: ['full', 'manual'],
  estimator: ['periodogram', 'welch'],
  kind: ['auto', 'baseband', 'bandpass'],
  phaseUnit: ['deg', 'rad'],
  phaseRef: ['center', 'start'],
  ampUnit: ['normalized', 'V'],
} as const;

const RULES: Rule[] = [
  { path: 'signal.signalType', values: ENUMS.signalType },
  { path: 'signal.amplitudeUnit', values: ENUMS.ampUnit },
  { path: 'signal.amplitude', min: 0, max: 1e6 },
  { path: 'signal.carrier.frequencyHz', min: 0, max: 1e12 },
  { path: 'signal.carrier.phaseRad', min: -100, max: 100 },
  { path: 'signal.pulse.envelope', values: ENUMS.envelope },
  { path: 'signal.pulse.widthSec', min: 1e-15, max: 10 },
  { path: 'signal.pulse.centerSec', min: 0, max: 100 },
  { path: 'signal.pulse.edgeShape', values: ENUMS.edgeShape },
  { path: 'signal.pulse.riseTimeSec', min: 0, max: 10 },
  { path: 'signal.pulse.fallTimeSec', min: 0, max: 10 },
  { path: 'signal.pulse.tukeyAlpha', min: 0, max: 1 },
  { path: 'signal.repetition.prfHz', min: 1e-3, max: 1e12 },
  { path: 'signal.repetition.pulseCount', min: 1, max: 1024, int: true },
  { path: 'signal.repetition.amplitudeVariation', values: ENUMS.ampVar },
  { path: 'signal.repetition.amplitudeVariationDepth', min: 0, max: 1 },
  { path: 'signal.coherence.mode', values: ENUMS.coherence },
  { path: 'signal.coherence.reference', values: ENUMS.reference },
  { path: 'signal.coherence.phaseIncrementRad', min: -100, max: 100 },
  { path: 'signal.coherence.phaseNoiseRmsRad', min: 0, max: 100 },
  { path: 'signal.jitter.timingRmsSec', min: 0, max: 10 },
  { path: 'signal.jitter.timingMode', values: ENUMS.jitterMode },
  { path: 'signal.jitter.timingPeriodPulses', min: 2, max: 1024, int: true },
  { path: 'signal.jitter.amplitudeRms', min: 0, max: 10 },
  { path: 'signal.jitter.frequencyRmsHz', min: 0, max: 1e12 },
  { path: 'signal.jitter.seed', min: 0, max: 2 ** 31, int: true },
  { path: 'signal.chirp.startFrequencyHz', min: 0, max: 1e12 },
  { path: 'signal.chirp.endFrequencyHz', min: 0, max: 1e12 },
  { path: 'signal.am.depth', min: 0, max: 1 },
  { path: 'signal.am.frequencyHz', min: 0, max: 1e12 },
  { path: 'signal.noise.rms', min: 0, max: 1e6 },
  { path: 'signal.sampling.mode', values: ENUMS.samplingMode },
  { path: 'signal.sampling.sampleRateHz', min: 1, max: 1e13 },
  { path: 'signal.sampling.sampleCount', min: MIN_SAMPLES, max: MAX_SAMPLES, int: true },
  { path: 'signal.sampling.bits', min: 1, max: 24, int: true },
  { path: 'analysis.phaseUnit', values: ENUMS.phaseUnit },
  { path: 'analysis.time.range.mode', values: ENUMS.rangeMode },
  { path: 'analysis.spectrum.display', values: ENUMS.display },
  { path: 'analysis.spectrum.scaling', values: ENUMS.scaling },
  { path: 'analysis.spectrum.sided', values: ENUMS.sided },
  { path: 'analysis.spectrum.window', values: ENUMS.window },
  { path: 'analysis.spectrum.zeroPad', min: 1, max: 16 },
  { path: 'analysis.spectrum.dbFloor', min: -200, max: -10 },
  { path: 'analysis.spectrum.range.mode', values: ENUMS.rangeMode },
  { path: 'analysis.tfRange.mode', values: ENUMS.rangeMode },
  { path: 'analysis.spectrum.estimator', values: ENUMS.estimator },
  { path: 'analysis.spectrum.welchSegments', min: 2, max: 64, int: true },
  { path: 'analysis.spectrum.kind', values: ENUMS.kind },
  { path: 'analysis.spectrum.phaseReference', values: ENUMS.phaseRef },
  { path: 'analysis.stft.windowLength', min: 8, max: 16384, int: true },
  { path: 'analysis.stft.overlapPct', min: 0, max: 95 },
  { path: 'analysis.stft.nfft', min: 8, max: 32768, int: true },
  { path: 'analysis.stft.window', values: ENUMS.window },
  { path: 'analysis.stft.dbRange', min: 10, max: 160 },
  { path: 'analysis.cwt.wavelet', values: ENUMS.wavelet },
  { path: 'analysis.cwt.omega0', min: 3, max: 30 },
  { path: 'analysis.cwt.fMinHz', min: 1e-3, max: 1e13 },
  { path: 'analysis.cwt.fMaxHz', min: 1e-3, max: 1e13 },
  { path: 'analysis.cwt.scales', min: 8, max: 256, int: true },
  { path: 'analysis.cwt.dbRange', min: 10, max: 120 },
  { path: 'analysis.tfView', values: ENUMS.tfView },
];

/** Recursively copies only keys present in the template, with matching primitive types. */
function conform(template: unknown, value: unknown): unknown {
  if (isPlainObject(template)) {
    const out: Record<string, unknown> = {};
    const src = isPlainObject(value) ? value : {};
    for (const k of Object.keys(template)) out[k] = conform(template[k], src[k]);
    return out;
  }
  if (typeof template === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : template;
  if (typeof template === 'boolean') return typeof value === 'boolean' ? value : template;
  if (typeof template === 'string') return typeof value === 'string' ? value : template;
  return template;
}

export function sanitizeExperiment(input: unknown, base: Experiment = DEFAULT_EXPERIMENT): Experiment {
  let exp = conform(base, input) as Experiment;
  for (const r of RULES) {
    const v = getPath(exp, r.path);
    const fallback = getPath(base, r.path);
    if (r.values) {
      if (!r.values.includes(v as string)) exp = setPath(exp, r.path, fallback);
      continue;
    }
    if (typeof v === 'number') {
      let x = v;
      if (r.min !== undefined) x = Math.max(r.min, x);
      if (r.max !== undefined) x = Math.min(r.max, x);
      if (r.int) x = Math.round(x);
      if (x !== v) exp = setPath(exp, r.path, x);
    }
  }
  return exp;
}
