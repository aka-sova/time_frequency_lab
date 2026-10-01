/**
 * "Isolate effect": keep the parameter under study at its current value and
 * reset everything unrelated to a clean reference state, so that a single
 * cause can be connected to a single effect.
 */
import type { Experiment, SignalConfig } from '@/types/signal';
import { autoSampling } from '@/lib/dsp/sampling';
import { deepMerge } from '@/lib/state/path';
import { DEFAULT_ANALYSIS, DEFAULT_SIGNAL } from './defaults';

export type IsolateKey = 'pulseWidth' | 'riseTime' | 'carrier' | 'prf' | 'coherence' | 'jitter' | 'chirp' | 'sampling';

export const ISOLATE_LABELS: Record<IsolateKey, string> = {
  pulseWidth: 'pulse width',
  riseTime: 'rise/fall time',
  carrier: 'carrier frequency',
  prf: 'PRF',
  coherence: 'coherence',
  jitter: 'jitter',
  chirp: 'chirp',
  sampling: 'sampling rate',
};

const CLEAN: Partial<SignalConfig> = {
  repetition: { ...DEFAULT_SIGNAL.repetition, enabled: false },
  coherence: { ...DEFAULT_SIGNAL.coherence, mode: 'coherent' },
  jitter: { ...DEFAULT_SIGNAL.jitter, timingEnabled: false, amplitudeEnabled: false, frequencyEnabled: false },
  chirp: { ...DEFAULT_SIGNAL.chirp, enabled: false },
  am: { ...DEFAULT_SIGNAL.am, enabled: false },
  noise: { ...DEFAULT_SIGNAL.noise, enabled: false },
};

function withSampling(s: SignalConfig, keepRate = false): SignalConfig {
  const a = autoSampling(s);
  return {
    ...s,
    sampling: {
      ...s.sampling,
      mode: 'manual',
      sampleRateHz: keepRate ? s.sampling.sampleRateHz : a.sampleRateHz,
      sampleCount: a.sampleCount,
      quantizationEnabled: false,
      aliasingDemo: keepRate,
    },
  };
}

export function isolate(key: IsolateKey, exp: Experiment): Experiment {
  const c = exp.signal;
  let s: SignalConfig = deepMerge(c, CLEAN) as SignalConfig;
  const pulse = { ...c.pulse, autoCenter: true, enabled: true };
  switch (key) {
    case 'pulseWidth':
      s = { ...s, pulse: { ...pulse, edgesEnabled: false }, signalType: c.carrier.enabled ? 'burst' : s.signalType };
      break;
    case 'riseTime':
      s = {
        ...s,
        signalType: 'rect',
        carrier: { ...c.carrier, enabled: false },
        pulse: { ...pulse, envelope: 'rect', edgesEnabled: true },
      };
      break;
    case 'carrier':
      s = { ...s, signalType: 'burst', carrier: { ...c.carrier, enabled: true }, pulse: { ...pulse, envelope: 'gaussian', edgesEnabled: false } };
      break;
    case 'prf':
      s = {
        ...s,
        signalType: 'pulse-train',
        pulse,
        repetition: { ...c.repetition, enabled: true, amplitudeVariation: 'none', pulseCount: Math.max(c.repetition.pulseCount, 8) },
      };
      break;
    case 'coherence':
      s = {
        ...s,
        signalType: 'pulse-train',
        carrier: { ...c.carrier, enabled: true },
        pulse,
        repetition: { ...c.repetition, enabled: true, amplitudeVariation: 'none', pulseCount: Math.max(c.repetition.pulseCount, 8) },
        coherence: c.coherence,
      };
      break;
    case 'jitter':
      s = {
        ...s,
        signalType: 'pulse-train',
        pulse,
        repetition: { ...c.repetition, enabled: true, amplitudeVariation: 'none', pulseCount: Math.max(c.repetition.pulseCount, 8) },
        jitter: c.jitter,
      };
      break;
    case 'chirp':
      s = { ...s, signalType: 'chirp', carrier: { ...c.carrier, enabled: true }, pulse: { ...pulse, envelope: 'rect', edgesEnabled: false }, chirp: { ...c.chirp, enabled: true } };
      break;
    case 'sampling':
      s = {
        ...s,
        signalType: 'burst',
        carrier: { ...c.carrier, enabled: true },
        pulse: { ...pulse, envelope: 'gaussian', edgesEnabled: false },
      };
      break;
  }
  s = withSampling(s, key === 'sampling');
  return {
    signal: s,
    analysis: {
      ...exp.analysis,
      spectrum: { ...exp.analysis.spectrum, window: 'rect', fftSelection: false, display: 'db' },
      stft: key === 'chirp' ? { ...exp.analysis.stft, showInstFreq: true } : exp.analysis.stft,
      time: { ...exp.analysis.time, showReference: key === 'sampling' },
      cursors: DEFAULT_ANALYSIS.cursors,
    },
  };
}
