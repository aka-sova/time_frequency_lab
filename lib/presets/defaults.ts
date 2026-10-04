import type { AnalysisConfig, Experiment, SignalConfig, SignalType } from '@/types/signal';
import { deepMerge } from '@/lib/state/path';
import type { DeepPartial } from '@/types/signal';

/**
 * Default experiment: a 20 ns rectangular RF burst at 1 GHz (≈ 20 carrier
 * cycles), sampled automatically (10 GHz, 4096 samples).
 */
export const DEFAULT_SIGNAL: SignalConfig = {
  signalType: 'burst',
  amplitude: 1,
  amplitudeUnit: 'normalized',
  carrier: { enabled: true, frequencyHz: 1e9, phaseRad: 0 },
  pulse: {
    enabled: true,
    envelope: 'rect',
    widthSec: 20e-9,
    autoCenter: true,
    centerSec: 100e-9,
    edgesEnabled: false,
    edgeShape: 'linear',
    riseTimeSec: 1e-9,
    fallTimeSec: 1e-9,
    tukeyAlpha: 0.5,
  },
  repetition: {
    enabled: false,
    prfHz: 10e6,
    pulseCount: 8,
    amplitudeVariation: 'none',
    amplitudeVariationDepth: 0.3,
  },
  coherence: { mode: 'coherent', reference: 'continuous', phaseIncrementRad: Math.PI / 4, phaseNoiseRmsRad: 0.5 },
  jitter: {
    timingEnabled: false,
    timingRmsSec: 100e-12,
    timingMode: 'random',
    timingPeriodPulses: 8,
    amplitudeEnabled: false,
    amplitudeRms: 0.1,
    frequencyEnabled: false,
    frequencyRmsHz: 2e6,
    seed: 1,
  },
  chirp: { enabled: false, startFrequencyHz: 0.8e9, endFrequencyHz: 1.2e9 },
  am: { enabled: false, depth: 0.5, frequencyHz: 50e6 },
  noise: { enabled: false, rms: 0.05 },
  sampling: {
    mode: 'auto',
    sampleRateHz: 10e9,
    sampleCount: 4096,
    quantizationEnabled: false,
    bits: 8,
    aliasingDemo: false,
  },
};

export const DEFAULT_ANALYSIS: AnalysisConfig = {
  phaseUnit: 'deg',
  time: {
    range: { mode: 'full', min: 0, max: 0 },
    showEnvelope: true,
    showSamples: false,
    showReference: false,
    showMarkers: true,
    showInstFreq: false,
  },
  spectrum: {
    display: 'db',
    powerDb: true,
    scaling: 'ft',
    sided: 'one',
    centered: true,
    logFrequency: false,
    window: 'rect',
    zeroPad: 4,
    dbFloor: -60,
    range: { mode: 'manual', min: 0.7e9, max: 1.3e9 },
    showSinglePulse: true,
    showRawBins: false,
    showBandMarkers: true,
    showNyquist: true,
    showPhase: false,
    phaseUnwrap: false,
    phaseReference: 'center',
    fftSelection: false,
    estimator: 'periodogram',
    welchSegments: 8,
    kind: 'auto',
  },
  cursors: { enabled: false, t1: 0, t2: 0, f1: 0, f2: 0 },
  stft: {
    enabled: true,
    windowLength: 128,
    overlapPct: 75,
    nfft: 512,
    window: 'hann',
    dbRange: 60,
    logFrequency: false,
    showInstFreq: false,
  },
  cwt: { wavelet: 'morlet', omega0: 6, autoRange: true, fMinHz: 50e6, fMaxHz: 4e9, scales: 64, dbRange: 40 },
  tfView: 'stft',
  load: { resistanceOhm: 50 },
  instrument: { bandwidthHz: 1e9, sampleRateHz: 10e9, samplePhasePct: 0, triggerJitterRmsSec: 0, clipEnabled: false, clipRatio: 1.2 },
};

export const DEFAULT_EXPERIMENT: Experiment = { signal: DEFAULT_SIGNAL, analysis: DEFAULT_ANALYSIS };

export function mergeExperiment(base: Experiment, patch?: DeepPartial<Experiment>): Experiment {
  return patch ? deepMerge(base, patch) : base;
}

/**
 * Signal families are templates over the general model: choosing one sets the
 * structural toggles; all parameters remain individually editable.
 */
export const SIGNAL_TYPES: { id: SignalType; label: string; description: string }[] = [
  { id: 'sinusoid', label: 'Continuous sinusoid', description: 'A·cos(2πf₀t + φ) — ideal narrowband signal.' },
  { id: 'rect', label: 'Rectangular pulse', description: 'Baseband A·rect(t/τ); X(f) ∝ τ·sinc(fτ).' },
  { id: 'gaussian', label: 'Gaussian pulse', description: 'Minimum time–frequency uncertainty.' },
  { id: 'gaussian-derivative', label: 'Gaussian monocycle', description: 'Gaussian derivative — representative UWB waveform.' },
  { id: 'burst', label: 'Windowed carrier burst', description: 'a(t)·cos(2πf₀t + φ).' },
  { id: 'pulse-train', label: 'Pulse train', description: 'Σ p(t − nT_r), T_r = 1/PRF.' },
  { id: 'chirp', label: 'Chirped pulse (LFM)', description: 'a(t)·cos[2π(f₀t + ½kt²) + φ].' },
  { id: 'composite', label: 'Composite (custom)', description: 'Combine carrier, envelope, AM, chirp, train and jitter freely.' },
];

export function signalTypeTemplate(type: SignalType, cur: SignalConfig): DeepPartial<SignalConfig> {
  switch (type) {
    case 'sinusoid':
      return { signalType: type, carrier: { enabled: true }, pulse: { enabled: false }, repetition: { enabled: false }, chirp: { enabled: false }, am: { enabled: false } };
    case 'rect':
      return { signalType: type, carrier: { enabled: false }, pulse: { enabled: true, envelope: 'rect' }, repetition: { enabled: false }, chirp: { enabled: false } };
    case 'gaussian':
      return { signalType: type, carrier: { enabled: false }, pulse: { enabled: true, envelope: 'gaussian' }, repetition: { enabled: false }, chirp: { enabled: false } };
    case 'gaussian-derivative':
      return {
        signalType: type,
        carrier: { enabled: false },
        pulse: { enabled: true, envelope: cur.pulse.envelope === 'gaussian-d2' ? 'gaussian-d2' : 'gaussian-d1' },
        repetition: { enabled: false },
        chirp: { enabled: false },
      };
    case 'burst':
      return {
        signalType: type,
        carrier: { enabled: true },
        pulse: { enabled: true, envelope: cur.pulse.envelope.startsWith('gaussian-') ? 'rect' : cur.pulse.envelope },
        repetition: { enabled: false },
        chirp: { enabled: false },
      };
    case 'pulse-train':
      return { signalType: type, pulse: { enabled: true }, repetition: { enabled: true } };
    case 'chirp':
      return { signalType: type, carrier: { enabled: true }, pulse: { enabled: true }, chirp: { enabled: true }, repetition: { enabled: false } };
    case 'composite':
      return { signalType: type };
  }
}
