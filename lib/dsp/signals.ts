/**
 * Signal generation (React-free).
 *
 * General model (each term optional):
 *
 *   x(t) = m(t) · Σ_n A_n · a(t − t_n) · cos[ 2π( f_{0,n}u + ½k·u² ) + φ_n + φ_code(u) ],  u = t − t_n
 *
 *   a(·)   pulse envelope (rect/trapezoid, Gaussian family, windows)
 *   m(t)   optional amplitude modulation 1 + μ·cos(2π f_m t)
 *   t_n    pulse centers (PRF grid + optional timing jitter)
 *   A_n    pulse amplitudes (deterministic taper + optional jitter)
 *   f_{0,n} carrier per pulse (optional frequency jitter)
 *   k      linear-FM chirp rate
 *   φ_n    pulse phase (coherence model)
 *   φ_code optional phase code: chip m = ⌊(u + τ/2)/T_c⌋, T_c = τ/L, the same on every pulse
 *          (carrier off: the carrier term becomes cos φ_code, i.e. ±1 for binary codes)
 *
 * The waveform is evaluated analytically at arbitrary instants, so the same
 * model is used for the sampled record and for the dense "physical" reference
 * used by the aliasing demonstration.
 */
import type { EnvelopeType, SignalConfig } from '@/types/signal';
import { RNG_STREAM, createRng } from './random';
import { windowValue } from './windows';
import { resolveSampling } from './sampling';
import { codePhases } from './codes';

export const FWHM_TO_SIGMA = 1 / (2 * Math.sqrt(2 * Math.LN2));
/** 10–90 % transition of a linear ramp spans 80 % of the ramp duration. */
const LINEAR_10_90 = 0.8;
/** 10–90 % transition of a half-cosine ramp 0.5 − 0.5cos(πv) spans 59.03 % of the ramp. */
const COSINE_10_90 = (Math.acos(-0.8) - Math.acos(0.8)) / Math.PI;

export interface PulseShape {
  type: EnvelopeType;
  width: number;
  sigma: number;
  edges: boolean;
  edgeShape: 'linear' | 'cosine';
  riseRamp: number;
  fallRamp: number;
  tukeyAlpha: number;
}

export function pulseShapeFromConfig(cfg: SignalConfig): PulseShape {
  const p = cfg.pulse;
  const k = p.edgeShape === 'cosine' ? COSINE_10_90 : LINEAR_10_90;
  return {
    type: p.envelope,
    width: p.widthSec,
    sigma: p.widthSec * FWHM_TO_SIGMA,
    edges: p.edgesEnabled,
    edgeShape: p.edgeShape,
    riseRamp: Math.max(p.riseTimeSec, 0) / k,
    fallRamp: Math.max(p.fallTimeSec, 0) / k,
    tukeyAlpha: p.tukeyAlpha,
  };
}

function edge(v: number, shape: 'linear' | 'cosine'): number {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return shape === 'cosine' ? 0.5 - 0.5 * Math.cos(Math.PI * c) : c;
}

/** Envelope a(u) evaluated at offset u from the pulse center. Peak ≈ 1. */
export function envelopeAt(s: PulseShape, u: number): number {
  switch (s.type) {
    case 'rect': {
      const h = s.width / 2;
      if (!s.edges || (s.riseRamp <= 0 && s.fallRamp <= 0)) {
        // Samples falling exactly on a discontinuity take the midpoint value.
        const d = Math.abs(u) - h;
        const eps = 1e-9 * h;
        return d < -eps ? 1 : d <= eps ? 0.5 : 0;
      }
      // Trapezoid: the 50 % points sit at ±τ/2, each ramp centered there.
      const r = s.riseRamp > 0 ? edge((u + h) / s.riseRamp + 0.5, s.edgeShape) : u >= -h ? 1 : 0;
      const f = s.fallRamp > 0 ? edge((h - u) / s.fallRamp + 0.5, s.edgeShape) : u <= h ? 1 : 0;
      return r * f;
    }
    case 'gaussian': {
      const z = u / s.sigma;
      return Math.exp(-0.5 * z * z);
    }
    case 'gaussian-d1': {
      // −d/du of the Gaussian, scaled so the peak magnitude is 1 (peak at u = −σ).
      const z = u / s.sigma;
      return -z * Math.exp(0.5 - 0.5 * z * z);
    }
    case 'gaussian-d2': {
      // Ricker / "Mexican hat" (negative 2nd derivative), peak 1 at u = 0.
      const z = u / s.sigma;
      return (1 - z * z) * Math.exp(-0.5 * z * z);
    }
    case 'hann':
    case 'hamming':
    case 'blackman':
    case 'tukey':
      return windowValue(s.type, u / s.width + 0.5, s.tukeyAlpha);
  }
}

/** Half-width beyond which the envelope is (numerically) zero. */
export function supportHalfWidth(s: PulseShape): number {
  switch (s.type) {
    case 'rect':
      return s.width / 2 + (s.edges ? Math.max(s.riseRamp, s.fallRamp) / 2 : 0);
    case 'gaussian':
      return 8.5 * s.sigma;
    case 'gaussian-d1':
    case 'gaussian-d2':
      return 9 * s.sigma;
    default:
      return s.width / 2;
  }
}

export interface PulseRealization {
  index: number;
  tNominal: number;
  tCenter: number;
  amplitude: number;
  frequencyHz: number;
  phaseRad: number;
}

export interface CarrierModel {
  on: boolean;
  centerHz: number;
  chirpRate: number;
  chirpDuration: number;
}

export function carrierModel(cfg: SignalConfig, observation: number): CarrierModel {
  const chirp = cfg.chirp.enabled;
  const on = cfg.carrier.enabled || chirp;
  if (!chirp) return { on, centerHz: cfg.carrier.frequencyHz, chirpRate: 0, chirpDuration: 0 };
  const dur = cfg.pulse.enabled ? Math.max(cfg.pulse.widthSec, 1e-15) : observation;
  return {
    on,
    centerHz: 0.5 * (cfg.chirp.startFrequencyHz + cfg.chirp.endFrequencyHz),
    chirpRate: (cfg.chirp.endFrequencyHz - cfg.chirp.startFrequencyHz) / dur,
    chirpDuration: dur,
  };
}

export function trainCenter(cfg: SignalConfig, observation: number): number {
  return cfg.pulse.autoCenter ? observation / 2 : cfg.pulse.centerSec;
}

export function isTrain(cfg: SignalConfig): boolean {
  return cfg.pulse.enabled && cfg.repetition.enabled;
}

export function effectivePulseCount(cfg: SignalConfig): number {
  return cfg.pulse.enabled && cfg.repetition.enabled ? Math.max(1, Math.round(cfg.repetition.pulseCount)) : 1;
}

/**
 * Draws per-pulse parameters. Every effect uses its own seeded stream so the
 * realization is reproducible and independent of which other effects are on.
 */
export function realizePulses(cfg: SignalConfig, observation: number): PulseRealization[] {
  const carrier = carrierModel(cfg, observation);
  const count = effectivePulseCount(cfg);
  const train = isTrain(cfg);
  const center = cfg.pulse.enabled || carrier.chirpRate !== 0 ? trainCenter(cfg, observation) : 0;
  const pri = 1 / Math.max(cfg.repetition.prfHz, 1e-30);
  const j = cfg.jitter;
  const seed = j.seed;
  const rT = createRng(seed, RNG_STREAM.timing);
  const rA = createRng(seed, RNG_STREAM.amplitude);
  const rF = createRng(seed, RNG_STREAM.frequency);
  const rP = createRng(seed, RNG_STREAM.phase);
  const rI = createRng(seed, RNG_STREAM.incoherentPhase);
  const coh = cfg.coherence;
  const out: PulseRealization[] = [];

  for (let n = 0; n < count; n++) {
    const tNominal = train ? center + (n - (count - 1) / 2) * pri : center;
    let dt = 0;
    let ampFactor = 1;
    let fOffset = 0;
    if (train) {
      if (j.timingEnabled) {
        dt =
          j.timingMode === 'periodic'
            ? Math.SQRT2 * j.timingRmsSec * Math.sin((2 * Math.PI * n) / Math.max(j.timingPeriodPulses, 2))
            : j.timingRmsSec * rT.normal();
      }
      const v = cfg.repetition;
      if (v.amplitudeVariation === 'ramp' && count > 1) ampFactor *= 1 - v.amplitudeVariationDepth * (n / (count - 1));
      else if (v.amplitudeVariation === 'alternating') ampFactor *= n % 2 === 0 ? 1 : 1 - v.amplitudeVariationDepth;
      if (j.amplitudeEnabled) ampFactor *= 1 + j.amplitudeRms * rA.normal();
      if (j.frequencyEnabled) fOffset = j.frequencyRmsHz * rF.normal();
    }
    const tCenter = tNominal + dt;
    const f = carrier.centerHz + fOffset;
    let phase = cfg.carrier.phaseRad;
    if (train) {
      if (coh.reference === 'continuous') phase += 2 * Math.PI * carrier.centerHz * tCenter;
      if (coh.mode === 'increment') phase += n * coh.phaseIncrementRad;
      if (coh.mode === 'partial') phase += coh.phaseNoiseRmsRad * rP.normal();
      if (coh.mode === 'incoherent') phase = 2 * Math.PI * rI.uniform();
    }
    out.push({ index: n, tNominal, tCenter, amplitude: cfg.amplitude * ampFactor, frequencyHz: f, phaseRad: phase });
  }
  return out;
}

export interface Synthesis {
  x: Float64Array;
  envelope: Float64Array;
  instFreq: Float64Array;
}

/** Evaluates the noiseless model on the grid t_i = i/fs, i = 0…n−1. */
export function synthesize(cfg: SignalConfig, pulses: PulseRealization[], fs: number, n: number, observation: number): Synthesis {
  const x = new Float64Array(n);
  const env = new Float64Array(n);
  const finst = new Float64Array(n).fill(NaN);
  const best = new Float64Array(n);
  const carrier = carrierModel(cfg, observation);
  const shape = pulseShapeFromConfig(cfg);
  const pulseOn = cfg.pulse.enabled;
  const half = pulseOn ? supportHalfWidth(shape) : Infinity;
  const k = carrier.chirpRate;
  const am = cfg.am.enabled;
  const twoPi = 2 * Math.PI;
  const code = cfg.code.enabled && pulseOn ? codePhases(cfg.code.family, cfg.code.length) : null;
  const chips = code ? code.length : 0;
  const codeHalf = 0.5 * cfg.pulse.widthSec;
  const chipSec = code ? cfg.pulse.widthSec / chips : 1;

  for (const p of pulses) {
    const i0 = pulseOn ? Math.max(0, Math.ceil((p.tCenter - half) * fs)) : 0;
    const i1 = pulseOn ? Math.min(n - 1, Math.floor((p.tCenter + half) * fs)) : n - 1;
    for (let i = i0; i <= i1; i++) {
      const t = i / fs;
      const u = t - p.tCenter;
      const a = pulseOn ? envelopeAt(shape, u) : 1;
      if (a === 0) continue;
      const pc = code ? code[Math.min(chips - 1, Math.max(0, Math.floor((u + codeHalf) / chipSec)))] : 0;
      const c = carrier.on ? Math.cos(twoPi * (p.frequencyHz * u + 0.5 * k * u * u) + p.phaseRad + pc) : code ? Math.cos(pc) : 1;
      x[i] += p.amplitude * a * c;
      const mag = Math.abs(p.amplitude * a);
      env[i] += mag;
      if (carrier.on && mag > best[i]) {
        best[i] = mag;
        finst[i] = p.frequencyHz + k * u;
      }
    }
  }
  if (am) {
    const mu = cfg.am.depth;
    const fm = cfg.am.frequencyHz;
    for (let i = 0; i < n; i++) {
      const m = 1 + mu * Math.cos((twoPi * fm * i) / fs);
      x[i] *= m;
      env[i] *= Math.abs(m);
    }
  }
  return { x, envelope: env, instFreq: finst };
}

export interface ReferenceWaveform {
  fs: number;
  t: Float64Array;
  x: Float64Array;
  oversample: number;
}

export interface SignalResult {
  fs: number;
  n: number;
  observation: number;
  t: Float64Array;
  /** Sampled record including noise and quantization. */
  x: Float64Array;
  /** Noiseless, unquantized samples of the model. */
  xIdeal: Float64Array;
  envelope: Float64Array;
  instFreq: Float64Array;
  /** One clean, unjittered pulse at the train center (amplitude A, phase φ0). */
  singlePulse: Float64Array;
  pulses: PulseRealization[];
  carrier: CarrierModel;
  pulseCount: number;
  reference: ReferenceWaveform | null;
  quantizationStep: number;
}

export const MAX_REFERENCE_SAMPLES = 1 << 17;

export function generateSignal(cfg: SignalConfig, opts: { reference?: boolean; referenceOversample?: number } = {}): SignalResult {
  const { fs, n } = resolveSampling(cfg);
  const observation = n / fs;
  const pulses = realizePulses(cfg, observation);
  const syn = synthesize(cfg, pulses, fs, n, observation);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i / fs;

  const xIdeal = syn.x;
  const x = Float64Array.from(xIdeal);
  if (cfg.noise.enabled && cfg.noise.rms > 0) {
    const r = createRng(cfg.jitter.seed, RNG_STREAM.noise);
    for (let i = 0; i < n; i++) x[i] += cfg.noise.rms * r.normal();
  }
  let q = 0;
  if (cfg.sampling.quantizationEnabled) {
    // Mid-tread quantizer whose full scale matches the record peak (an ideal ADC range setting).
    let fsAbs = 0;
    for (let i = 0; i < n; i++) fsAbs = Math.max(fsAbs, Math.abs(x[i]));
    const bits = Math.min(Math.max(Math.round(cfg.sampling.bits), 1), 24);
    if (fsAbs > 0) {
      q = (2 * fsAbs) / 2 ** bits;
      for (let i = 0; i < n; i++) x[i] = Math.min(Math.max(Math.round(x[i] / q) * q, -fsAbs), fsAbs);
    }
  }

  const carrier = carrierModel(cfg, observation);
  const tc = cfg.pulse.enabled || carrier.chirpRate !== 0 ? trainCenter(cfg, observation) : 0;
  const ref: PulseRealization = {
    index: 0,
    tNominal: tc,
    tCenter: tc,
    amplitude: cfg.amplitude,
    frequencyHz: carrier.centerHz,
    phaseRad:
      cfg.carrier.phaseRad +
      (isTrain(cfg) && cfg.coherence.reference === 'continuous' ? 2 * Math.PI * carrier.centerHz * tc : 0),
  };
  const single = synthesize(cfg, [ref], fs, n, observation).x;

  let reference: ReferenceWaveform | null = null;
  if (opts.reference) {
    const want = Math.max(2, Math.round(opts.referenceOversample ?? 16));
    const m = Math.max(2, Math.min(want, Math.floor(MAX_REFERENCE_SAMPLES / n)));
    const fsRef = fs * m;
    const nRef = n * m;
    const rx = synthesize(cfg, pulses, fsRef, nRef, observation).x;
    const rt = new Float64Array(nRef);
    for (let i = 0; i < nRef; i++) rt[i] = i / fsRef;
    reference = { fs: fsRef, t: rt, x: rx, oversample: m };
  }

  return {
    fs,
    n,
    observation,
    t,
    x,
    xIdeal,
    envelope: syn.envelope,
    instFreq: syn.instFreq,
    singlePulse: single,
    pulses,
    carrier,
    pulseCount: pulses.length,
    reference,
    quantizationStep: q,
  };
}
