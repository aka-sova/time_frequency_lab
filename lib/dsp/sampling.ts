/**
 * Sampling configuration and spectral-extent estimates.
 *
 * Sampling never creates bandwidth: the estimates below are properties of the
 * continuous-time waveform model. They are used to (a) pick an adequate
 * sample rate in "auto" mode and (b) warn when the existing spectrum extends
 * beyond the Nyquist frequency fs/2.
 */
import type { SignalConfig } from '@/types/signal';
import { snapCodeLength } from './codes';

export const MIN_SAMPLES = 64;
export const MAX_SAMPLES = 1 << 17; // 131072
export const AUTO_MAX_SAMPLES = 1 << 16;

const NICE = [1, 2, 2.5, 4, 5, 8, 10];

/** Smallest "nice" value (1, 2, 2.5, 4, 5, 8 × 10ⁿ) ≥ x. */
export function niceCeil(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const e = Math.floor(Math.log10(x));
  const base = 10 ** e;
  for (const m of NICE) if (m * base >= x * (1 - 1e-12)) return m * base;
  return 10 * base;
}

export interface SpectralExtent {
  /** Highest carrier/instantaneous frequency of the model. */
  carrierMaxHz: number;
  /** One-sided envelope bandwidth beyond which content is ≲ −60 dB (heuristic). */
  envelopeExtentHz: number;
  /** Estimated highest significant frequency of the waveform. */
  fMaxHz: number;
  /** True when the ideal waveform has slowly decaying tails (discontinuities). */
  unbounded: boolean;
}

/** Chip duration T_c = τ/L of the phase code. */
export function codeChipSec(cfg: SignalConfig): number {
  return Math.max(cfg.pulse.widthSec, 1e-15) / snapCodeLength(cfg.code.family, cfg.code.length);
}

/** Characteristic duration used for observation sizing. */
export function pulseDuration(cfg: SignalConfig): number {
  const p = cfg.pulse;
  const tau = Math.max(p.widthSec, 1e-15);
  if (p.envelope === 'rect' && p.edgesEnabled) return tau + (p.riseTimeSec + p.fallTimeSec) / 0.8;
  if (p.envelope.startsWith('gaussian')) return 2.5 * tau;
  return tau;
}

export function estimateSpectralExtent(cfg: SignalConfig): SpectralExtent {
  const carrierOn = cfg.carrier.enabled || cfg.chirp.enabled;
  let carrierMax = 0;
  if (carrierOn) {
    carrierMax = cfg.chirp.enabled
      ? Math.max(Math.abs(cfg.chirp.startFrequencyHz), Math.abs(cfg.chirp.endFrequencyHz))
      : Math.abs(cfg.carrier.frequencyHz);
    if (cfg.jitter.frequencyEnabled && cfg.repetition.enabled) carrierMax += 3 * cfg.jitter.frequencyRmsHz;
  }
  let env = 0;
  let unbounded = false;
  if (cfg.pulse.enabled) {
    const tau = Math.max(cfg.pulse.widthSec, 1e-15);
    switch (cfg.pulse.envelope) {
      case 'rect':
        if (cfg.pulse.edgesEnabled) {
          const edge = Math.max(Math.min(cfg.pulse.riseTimeSec, cfg.pulse.fallTimeSec), 1e-15);
          env = Math.min(1.5 / edge, 10 / tau) + 2 / tau;
          if (cfg.pulse.edgeShape === 'linear') env = Math.max(env, 4 / tau);
        } else {
          env = 10 / tau;
          unbounded = true;
        }
        break;
      case 'gaussian':
        env = 1.4 / tau;
        break;
      case 'gaussian-d1':
        env = 2.0 / tau;
        break;
      case 'gaussian-d2':
        env = 2.3 / tau;
        break;
      case 'hann':
        env = 6 / tau;
        break;
      case 'blackman':
        env = 4 / tau;
        break;
      case 'hamming':
        env = 8 / tau;
        unbounded = true;
        break;
      case 'tukey': {
        const a = Math.max(cfg.pulse.tukeyAlpha, 0);
        if (a < 0.02) {
          env = 10 / tau;
          unbounded = true;
        } else env = 3 / tau + 2 / (a * tau);
        break;
      }
    }
  }
  if (cfg.code.enabled && cfg.pulse.enabled) {
    // Rectangular chips: phase steps behave like rect edges at the chip scale.
    env = Math.max(env, 10 / codeChipSec(cfg));
    unbounded = true;
  }
  const am = cfg.am.enabled ? cfg.am.frequencyHz : 0;
  return { carrierMaxHz: carrierMax, envelopeExtentHz: env, fMaxHz: carrierMax + env + am, unbounded };
}

/** Sample rate and record length chosen automatically from the waveform model. */
export function autoSampling(cfg: SignalConfig): { sampleRateHz: number; sampleCount: number } {
  const ext = estimateSpectralExtent(cfg);
  const carrierOn = cfg.carrier.enabled || cfg.chirp.enabled;
  // ≥ 10 samples per carrier cycle keeps the time-domain display legible;
  // ≥ 2.5·f_max keeps the significant spectrum well inside Nyquist.
  const fsMin = Math.max(carrierOn ? 10 * ext.carrierMaxHz : 0, 2.5 * ext.fMaxHz, 1);
  const fs = niceCeil(fsMin);

  let tNeeded: number;
  if (cfg.pulse.enabled) {
    const d = pulseDuration(cfg);
    const span = cfg.repetition.enabled ? (Math.max(cfg.repetition.pulseCount, 1) - 1) / Math.max(cfg.repetition.prfHz, 1e-30) : 0;
    tNeeded = span + Math.max(16 * d, 4 * d);
    if (cfg.repetition.enabled) tNeeded = Math.max(tNeeded, span + 2 / cfg.repetition.prfHz);
  } else {
    const fLow = carrierOn ? Math.max(Math.min(ext.carrierMaxHz, cfg.carrier.frequencyHz || ext.carrierMaxHz), 1e-30) : fs / 1024;
    tNeeded = 256 / fLow;
  }
  if (cfg.am.enabled && cfg.am.frequencyHz > 0) tNeeded = Math.max(tNeeded, 8 / cfg.am.frequencyHz);
  let n = 1024;
  while (n < tNeeded * fs && n < AUTO_MAX_SAMPLES) n *= 2;
  return { sampleRateHz: fs, sampleCount: n };
}

export function resolveSampling(cfg: SignalConfig): { fs: number; n: number } {
  if (cfg.sampling.mode === 'auto') {
    const a = autoSampling(cfg);
    return { fs: a.sampleRateHz, n: a.sampleCount };
  }
  const fs = Math.max(cfg.sampling.sampleRateHz, 1e-6);
  const n = Math.min(Math.max(Math.round(cfg.sampling.sampleCount), MIN_SAMPLES), MAX_SAMPLES);
  return { fs, n };
}

/** Frequency at which a real tone at f appears after sampling at fs (folded into [0, fs/2]). */
export function aliasFrequency(f: number, fs: number): number {
  const r = ((f % fs) + fs) % fs;
  return r > fs / 2 ? fs - r : r;
}
