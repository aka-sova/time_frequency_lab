/**
 * Matched filtering and pulse compression (React-free).
 *
 * The record and the reference are taken in complex form z(t): the analytic
 * signal for bandpass waveforms (carrier or chirp on), the real samples
 * themselves at baseband (so a baseband output is the true real correlation).
 *
 *   received   z_r(t) = z(t)·e^{j2πνt}            (narrowband Doppler mismatch ν)
 *   output     y(τ)   = Σ z_r(t)·h*(t − τ)         (h = reference, optionally weighted)
 *   normalized y / √(E_ref · Σ|h|²)                (constant output-noise level)
 *
 * With this normalization the matched, unweighted, zero-Doppler peak is 1 and
 * any drop below 0 dB (weighting, Doppler) is the SNR loss.
 *
 * Reference: one clean pulse (signal.singlePulse) or the nominal train — the
 * receiver knows everything deterministic (taper, Δφ increment, code, chirp)
 * and nothing random (jitter, phase noise, random phase, noise).
 */
import type { CompressionReference, CompressionWeighting, SignalConfig } from '@/types/signal';
import type { SpectrumKind } from './bandwidth';
import { fftInPlace, nextPowerOfTwo } from './fft';
import { activeRange } from './instrument';
import { fwhm } from './measurements';
import { analyticSignal } from './spectrum';
import { carrierModel, envelopeAt, isTrain, pulseShapeFromConfig, realizePulses, synthesize, trainCenter, type SignalResult } from './signals';
import { snapCodeLength } from './codes';
import { windowValue } from './windows';

export const SPEED_OF_LIGHT = 299792458;
/** Sidelobes below this level (dB) are numerical residue (FFT Hilbert/Gibbs) and reported as none. */
export const SIDELOBE_FLOOR_DB = -80;
/** |ν|·B·T/f_c above which the narrowband (frequency-shift) Doppler model is flagged. */
export const NARROWBAND_LIMIT = 0.3;

export type { CompressionReference, CompressionWeighting };

export const COMPRESSION_WEIGHTINGS: { id: CompressionWeighting; label: string }[] = [
  { id: 'rect', label: 'None (matched)' },
  { id: 'hann', label: 'Hann' },
  { id: 'hamming', label: 'Hamming' },
  { id: 'blackman', label: 'Blackman' },
  { id: 'blackman-harris', label: 'Blackman-Harris' },
];

export interface ComplexSignal {
  re: Float64Array;
  im: Float64Array;
  fs: number;
  /** Center frequency removed by downconversion (0 at baseband). */
  fc: number;
  kind: SpectrumKind;
}

export interface CompressionSettings {
  reference: CompressionReference;
  weighting: CompressionWeighting;
  dopplerHz: number;
}

export interface ReferenceInfo {
  /** Weighted reference h. */
  signal: ComplexSignal;
  unweighted: ComplexSignal;
  /** Real-valued unweighted reference (energies, SNR theory). */
  real: Float64Array;
  /** Effective reference type: false when 'train' was requested without a train. */
  train: boolean;
  /** Nominal pulse centers (s). */
  centers: number[];
  /** Weighting span as offsets from a pulse center (s). */
  span: [number, number];
  /** Span width (single pulse) or (N−1)·PRI + span width (train). */
  duration: number;
  /** Per-pulse weighting spans overlap (span > PRI). */
  overlap: boolean;
  /** The reference is not ≈ 0 at the record edges. */
  cut: boolean;
}

export interface CompressionMetrics {
  peakIndex: number;
  peakDelay: number;
  /** Delay of the peak relative to the ν = 0 peak. */
  delayShift: number;
  /** −3 dB mainlobe width τ_c. */
  widthSec: number;
  /** −3 dB crossings [τ₁, τ₂] of the mainlobe. */
  halfPower: [number, number];
  /** τ_c of the zero-Doppler output (independent of ν). */
  widthSecZeroDoppler: number;
  /** FWHM of the single-pulse envelope. */
  pulseFwhm: number;
  /** pulseFwhm / τ_c. */
  ratio: number;
  /** Time–bandwidth product of the modulation (chirp |Δf|·τ, code length L), null without one. */
  tb: number | null;
  pslrDb: number;
  islrDb: number;
  weightingLossDb: number;
  dopplerLossDb: number;
  rangeResolutionM: number;
  /** Trains: the peaks at m·PRI (m ≠ 0) relative to the main peak. */
  ambiguities: { m: number; delay: number; db: number }[];
  integrationGainDb: number | null;
  integrationLossDb: number | null;
  /** Σx² of the real, unweighted reference (2E/N₀ = Σx²/σ² for white noise of variance σ²). */
  referenceSumSq: number;
}

export interface SnrResult {
  sigma: number;
  /** Expected 1σ scatter (dB) of the single-realization estimate: 4.34/√(independent output samples). */
  scatterDb: number;
  inDb: number;
  outTheoryDb: number;
  outMeasuredDb: number;
  gainDb: number;
}

export interface NarrowbandCheck {
  ratio: number;
  nuLimitHz: number;
  exceeded: boolean;
  baseband: boolean;
}

export interface CompressionResult {
  tau: Float64Array;
  /** Normalized |y| of the noiseless record at the selected ν. */
  mag: Float64Array;
  magNoisy: Float64Array | null;
  /** Unweighted output at the selected ν (only when a weighting is selected). */
  magUnweighted: Float64Array | null;
  /** Lag window used for PSLR/ISLR: [first, last] index. */
  window: [number, number];
  /** Mainlobe: [first, last] index. */
  mainlobe: [number, number];
  metrics: CompressionMetrics;
  snr: SnrResult | null;
  reference: ReferenceInfo;
  narrowband: NarrowbandCheck;
  /** Pulse repetition interval when the record is a train, else 0. */
  pri: number;
}

export function isBandpass(cfg: SignalConfig): boolean {
  return cfg.carrier.enabled || cfg.chirp.enabled;
}

export function toComplex(x: ArrayLike<number>, fs: number, cfg: SignalConfig): ComplexSignal {
  if (isBandpass(cfg)) {
    const z = analyticSignal(x);
    return { re: z.re, im: z.im, fs, fc: carrierModel(cfg, x.length / fs).centerHz, kind: 'bandpass' };
  }
  return { re: Float64Array.from(x), im: new Float64Array(x.length), fs, fc: 0, kind: 'baseband' };
}

/** The transmitted waveform as the receiver knows it: deterministic effects kept, random ones removed. */
export function nominalConfig(cfg: SignalConfig): SignalConfig {
  const mode = cfg.coherence.mode === 'partial' || cfg.coherence.mode === 'incoherent' ? 'coherent' : cfg.coherence.mode;
  return {
    ...cfg,
    jitter: { ...cfg.jitter, timingEnabled: false, amplitudeEnabled: false, frequencyEnabled: false },
    coherence: { ...cfg.coherence, mode },
    noise: { ...cfg.noise, enabled: false },
    sampling: { ...cfg.sampling, quantizationEnabled: false },
  };
}

function magnitude(z: { re: Float64Array; im: Float64Array }): Float64Array {
  const m = new Float64Array(z.re.length);
  for (let i = 0; i < m.length; i++) m[i] = Math.hypot(z.re[i], z.im[i]);
  return m;
}

function energy(z: { re: Float64Array; im: Float64Array }): number {
  let e = 0;
  for (let i = 0; i < z.re.length; i++) e += z.re[i] * z.re[i] + z.im[i] * z.im[i];
  return e;
}

function realEnergy(x: ArrayLike<number>): number {
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  return e;
}

/** Center of the single reference pulse, as used by generateSignal(). */
function referenceCenter(signal: SignalResult, cfg: SignalConfig): number {
  return cfg.pulse.enabled || signal.carrier.chirpRate !== 0 ? trainCenter(cfg, signal.observation) : 0;
}

export function buildReference(signal: SignalResult, cfg: SignalConfig, s: CompressionSettings): ReferenceInfo {
  const { fs, n, observation } = signal;
  const train = s.reference === 'train' && isTrain(cfg) && signal.pulseCount > 1;
  const tc = referenceCenter(signal, cfg);
  const nominal = nominalConfig(cfg);
  const pulses = train ? realizePulses(nominal, observation) : [];
  const real = train ? synthesize(nominal, pulses, fs, n, observation).x : Float64Array.from(signal.singlePulse);
  const centers = train ? pulses.map((p) => p.tNominal) : [tc];

  // Weighting span from the model envelope a(u) (the Hilbert envelope of a gated carrier has Gibbs tails).
  let a = 0;
  let b = n - 1;
  if (cfg.pulse.enabled) {
    const shape = pulseShapeFromConfig(cfg);
    const env = new Float64Array(n);
    for (let i = 0; i < n; i++) env[i] = Math.abs(envelopeAt(shape, i / fs - tc));
    [a, b] = activeRange(env, 1e-3);
  }
  const lo = a / fs - tc;
  const hi = b / fs - tc;
  const width = Math.max(hi - lo, 1 / fs);
  const pri = 1 / Math.max(cfg.repetition.prfHz, 1e-30);

  let weighted = real;
  if (s.weighting !== 'rect') {
    weighted = new Float64Array(n);
    for (const c of centers) {
      const i0 = Math.max(0, Math.ceil((c + lo) * fs));
      const i1 = Math.min(n - 1, Math.floor((c + hi) * fs));
      for (let i = i0; i <= i1; i++) weighted[i] = Math.max(weighted[i], windowValue(s.weighting, (i / fs - c - lo) / width));
    }
    for (let i = 0; i < n; i++) weighted[i] *= real[i];
  }

  const unweighted = toComplex(real, fs, cfg);
  const env = magnitude(unweighted);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, env[i]);
  const cut = peak > 0 && (env[0] > 1e-3 * peak || env[n - 1] > 1e-3 * peak);

  return {
    signal: s.weighting === 'rect' ? unweighted : toComplex(weighted, fs, cfg),
    unweighted,
    real,
    train,
    centers,
    span: [lo, hi],
    duration: width + (train ? (centers.length - 1) * pri : 0),
    overlap: train && width > pri,
    cut,
  };
}

/** FFT of a reference, zero-padded for linear correlation against records of the same length. */
interface PreparedFilter {
  n: number;
  len: number;
  re: Float64Array;
  im: Float64Array;
}

function prepare(h: ComplexSignal): PreparedFilter {
  const n = h.re.length;
  const len = nextPowerOfTwo(2 * n);
  const re = new Float64Array(len);
  const im = new Float64Array(len);
  re.set(h.re);
  im.set(h.im);
  fftInPlace(re, im, false);
  return { n, len, re, im };
}

/** Raw (unnormalized) complex correlation at lags −(N−1)…(N−1). */
function correlateWith(rx: ComplexSignal, H: PreparedFilter, dopplerHz: number): { re: Float64Array; im: Float64Array } {
  const { n, len } = H;
  const ar = new Float64Array(len);
  const ai = new Float64Array(len);
  const w = (2 * Math.PI * dopplerHz) / rx.fs;
  for (let i = 0; i < n; i++) {
    if (dopplerHz === 0) {
      ar[i] = rx.re[i];
      ai[i] = rx.im[i];
    } else {
      const c = Math.cos(w * i);
      const s = Math.sin(w * i);
      ar[i] = rx.re[i] * c - rx.im[i] * s;
      ai[i] = rx.re[i] * s + rx.im[i] * c;
    }
  }
  fftInPlace(ar, ai, false);
  for (let k = 0; k < len; k++) {
    const r = ar[k] * H.re[k] + ai[k] * H.im[k];
    const m = ai[k] * H.re[k] - ar[k] * H.im[k];
    ar[k] = r;
    ai[k] = m;
  }
  fftInPlace(ar, ai, true);
  const out = { re: new Float64Array(2 * n - 1), im: new Float64Array(2 * n - 1) };
  for (let j = 0; j < 2 * n - 1; j++) {
    const k = j - (n - 1);
    const src = k >= 0 ? k : len + k;
    out.re[j] = ar[src] / len;
    out.im[j] = ai[src] / len;
  }
  return out;
}

/** Complex correlation y(τ) = Σ z_r(t)·h*(t − τ), lags −(N−1)…(N−1). */
export function correlate(rx: ComplexSignal, h: ComplexSignal, dopplerHz: number): { tau: Float64Array; re: Float64Array; im: Float64Array } {
  const y = correlateWith(rx, prepare(h), dopplerHz);
  return { tau: lagAxis(h.re.length, h.fs), ...y };
}

function lagAxis(n: number, fs: number): Float64Array {
  const tau = new Float64Array(2 * n - 1);
  for (let j = 0; j < tau.length; j++) tau[j] = (j - (n - 1)) / fs;
  return tau;
}

function scaledMagnitude(y: { re: Float64Array; im: Float64Array }, norm: number): Float64Array {
  const m = new Float64Array(y.re.length);
  for (let i = 0; i < m.length; i++) m[i] = Math.hypot(y.re[i], y.im[i]) / norm;
  return m;
}

function argMaxIn(a: Float64Array, i0: number, i1: number): number {
  let p = i0;
  for (let i = i0; i <= i1; i++) if (a[i] > a[p]) p = i;
  return p;
}

/** Index of the main peak: the largest value, ties broken by the smallest |lag|. */
function mainPeak(mag: Float64Array, zero: number): number {
  let m = 0;
  for (let i = 0; i < mag.length; i++) m = Math.max(m, mag[i]);
  let best = zero;
  let bestDist = Infinity;
  for (let i = 0; i < mag.length; i++) {
    if (mag[i] >= m * (1 - 1e-9) && Math.abs(i - zero) < bestDist) {
      best = i;
      bestDist = Math.abs(i - zero);
    }
  }
  return best;
}

function crossing(tau: Float64Array, mag: Float64Array, p: number, dir: 1 | -1, thr: number, limit: number): number {
  for (let i = p; dir > 0 ? i < limit : i > limit; i += dir) {
    const j = i + dir;
    if (mag[j] < thr) return tau[i] + ((thr - mag[i]) / (mag[j] - mag[i])) * (tau[j] - tau[i]);
  }
  return NaN;
}

function codeOrChirpTb(cfg: SignalConfig): number | null {
  if (!cfg.pulse.enabled) return null;
  if (cfg.chirp.enabled) return Math.abs(cfg.chirp.endFrequencyHz - cfg.chirp.startFrequencyHz) * cfg.pulse.widthSec;
  if (cfg.code.enabled) return snapCodeLength(cfg.code.family, cfg.code.length);
  return null;
}

/** `prebuilt`: a reference from buildReference() with the same reference/weighting settings (saves rebuilding it when only ν changes). */
export function analyzeCompression(signal: SignalResult, cfg: SignalConfig, s: CompressionSettings, prebuilt?: ReferenceInfo): CompressionResult {
  const { fs, n } = signal;
  const ref = prebuilt ?? buildReference(signal, cfg, s);
  const H = prepare(ref.signal);
  const eRef = energy(ref.unweighted);
  const eH = energy(ref.signal);
  const norm = Math.sqrt(eRef * eH) || 1;
  const zero = n - 1;
  const tau = lagAxis(n, fs);

  // Weighting loss from the zero-lag match of the nominal waveform: |⟨z, h⟩|² / (E·Σ|h|²).
  let dr = 0;
  let di = 0;
  for (let i = 0; i < n; i++) {
    dr += ref.unweighted.re[i] * ref.signal.re[i] + ref.unweighted.im[i] * ref.signal.im[i];
    di += ref.unweighted.im[i] * ref.signal.re[i] - ref.unweighted.re[i] * ref.signal.im[i];
  }
  const nominalPeak = Math.hypot(dr, di) / norm;
  const weightingLossDb = -20 * Math.log10(nominalPeak || 1);

  const rx = toComplex(signal.xIdeal, fs, cfg);
  const nu = s.dopplerHz;
  const y0 = correlateWith(rx, H, 0);
  const mag0 = scaledMagnitude(y0, norm);
  const y = nu === 0 ? y0 : correlateWith(rx, H, nu);
  const mag = nu === 0 ? mag0 : scaledMagnitude(y, norm);

  const recordTrain = isTrain(cfg) && signal.pulseCount > 1;
  const pri = recordTrain ? 1 / cfg.repetition.prfHz : 0;
  const p0 = mainPeak(mag0, zero);
  const halfWin = recordTrain ? Math.floor((pri * fs) / 2) : 2 * n;
  const w0 = Math.max(0, p0 - halfWin);
  const w1 = Math.min(mag.length - 1, p0 + halfWin);
  const p = nu === 0 ? p0 : argMaxIn(mag, w0, w1);
  const peak = mag[p];

  let iL = p;
  while (iL > w0 && mag[iL - 1] < mag[iL]) iL--;
  let iR = p;
  while (iR < w1 && mag[iR + 1] < mag[iR]) iR++;
  const thr = peak / Math.SQRT2;
  const halfPower: [number, number] = [crossing(tau, mag, p, -1, thr, iL), crossing(tau, mag, p, 1, thr, iR)];
  const widthSec = halfPower[1] - halfPower[0];
  let widthSecZeroDoppler = widthSec;
  if (nu !== 0) {
    let a0 = p0;
    while (a0 > w0 && mag0[a0 - 1] < mag0[a0]) a0--;
    let b0 = p0;
    while (b0 < w1 && mag0[b0 + 1] < mag0[b0]) b0++;
    const t0 = mag0[p0] / Math.SQRT2;
    widthSecZeroDoppler = crossing(tau, mag0, p0, 1, t0, b0) - crossing(tau, mag0, p0, -1, t0, a0);
  }

  let side = 0;
  let eIn = 0;
  let eOut = 0;
  for (let i = w0; i <= w1; i++) {
    const v = mag[i] * mag[i];
    if (i >= iL && i <= iR) eIn += v;
    else {
      eOut += v;
      side = Math.max(side, mag[i]);
    }
  }
  const floor = 10 ** (SIDELOBE_FLOOR_DB / 20);
  const pslrDb = side > floor * peak ? 20 * Math.log10(side / peak) : -Infinity;
  const islrDb = eOut > floor * floor * eIn ? 10 * Math.log10(eOut / eIn) : -Infinity;

  const ambiguities: CompressionMetrics['ambiguities'] = [];
  if (recordTrain) {
    const step = pri * fs;
    const search = Math.max(1, Math.floor(step / 4));
    for (let m = -(signal.pulseCount - 1); m <= signal.pulseCount - 1; m++) {
      if (m === 0) continue;
      const c = p + Math.round(m * step);
      if (c - search < 0 || c + search >= mag.length) continue;
      const q = argMaxIn(mag, c - search, c + search);
      if (mag[q] > 0) ambiguities.push({ m, delay: tau[q] - tau[p], db: 20 * Math.log10(mag[q] / peak) });
    }
  }

  const single = toComplex(signal.singlePulse, fs, cfg);
  const pulseFwhm = fwhm(signal.t, magnitude(single)).width;

  let integrationGainDb: number | null = null;
  let integrationLossDb: number | null = null;
  if (ref.train) {
    integrationGainDb = 10 * Math.log10(realEnergy(ref.real) / realEnergy(signal.singlePulse));
    integrationLossDb = 20 * Math.log10(nominalPeak / mag0[p0]);
  }

  let magUnweighted: Float64Array | null = null;
  if (s.weighting !== 'rect') magUnweighted = scaledMagnitude(correlateWith(rx, prepare(ref.unweighted), nu), eRef || 1);

  let snr: SnrResult | null = null;
  let magNoisy: Float64Array | null = null;
  if (cfg.noise.enabled || cfg.sampling.quantizationEnabled) {
    const noise = new Float64Array(n);
    for (let i = 0; i < n; i++) noise[i] = signal.x[i] - signal.xIdeal[i];
    const sigma2 = realEnergy(noise) / n;
    if (sigma2 > 0) {
      const yn = correlateWith(toComplex(noise, fs, cfg), H, nu);
      // Lags at which the whole reference (model support, not its Hilbert tails) overlaps the record.
      const ha = Math.max(0, Math.ceil((Math.min(...ref.centers) + ref.span[0]) * fs));
      const hb = Math.min(n - 1, Math.floor((Math.max(...ref.centers) + ref.span[1]) * fs));
      let k0 = Math.max(0, zero - ha);
      let k1 = Math.min(yn.re.length - 1, zero + (n - 1 - hb));
      if (k1 - k0 < 16) {
        k0 = 0;
        k1 = yn.re.length - 1;
      }
      let v = 0;
      for (let k = k0; k <= k1; k++) v += yn.re[k] * yn.re[k] + yn.im[k] * yn.im[k];
      v /= k1 - k0 + 1;
      let xPeak = 0;
      for (let i = 0; i < n; i++) xPeak = Math.max(xPeak, signal.xIdeal[i] * signal.xIdeal[i]);
      const yPeak2 = y.re[p] * y.re[p] + y.im[p] * y.im[p];
      const dopplerLoss = 20 * Math.log10(mag0[p0] / peak);
      const inDb = 10 * Math.log10(xPeak / sigma2);
      // Referred to the real output (peak² / mean noise power — the convention of 2E/N₀): the complex (I+Q) output
      // of a bandpass record carries twice the noise power relative to its peak², an exact factor of 2.
      const outMeasuredDb = 10 * Math.log10(yPeak2 / v) + (ref.signal.kind === 'bandpass' ? 10 * Math.log10(2) : 0);
      // Output noise is correlated over T_corr = Σ|R_h|²/R_h(0)² (R_h: autocorrelation of h, via Σ|H|⁴/L);
      // for a train reference this includes the repeats at m·PRI. Real (baseband) noise has half the dof.
      let h4 = 0;
      for (let k = 0; k < H.len; k++) {
        const p2 = H.re[k] * H.re[k] + H.im[k] * H.im[k];
        h4 += p2 * p2;
      }
      const tCorr = h4 / H.len / (eH * eH) / fs;
      const dof = Math.max(1, ((k1 - k0 + 1) / fs / tCorr) * (ref.signal.kind === 'bandpass' ? 1 : 0.5));
      snr = {
        sigma: Math.sqrt(sigma2),
        scatterDb: 4.34 / Math.sqrt(dof),
        inDb,
        outTheoryDb: 10 * Math.log10(realEnergy(ref.real) / sigma2) - weightingLossDb - dopplerLoss,
        outMeasuredDb,
        gainDb: outMeasuredDb - inDb,
      };
      magNoisy = new Float64Array(y.re.length);
      for (let i = 0; i < magNoisy.length; i++) magNoisy[i] = Math.hypot(y.re[i] + yn.re[i], y.im[i] + yn.im[i]) / norm;
    }
  }

  const bandwidth = 1 / widthSec;
  const fc = ref.signal.fc;
  const narrowband: NarrowbandCheck =
    ref.signal.kind === 'baseband' || !(fc > 0)
      ? { ratio: NaN, nuLimitHz: Infinity, exceeded: false, baseband: true }
      : {
          ratio: (Math.abs(nu) * bandwidth * ref.duration) / fc,
          nuLimitHz: (NARROWBAND_LIMIT * fc) / (bandwidth * ref.duration),
          exceeded: (Math.abs(nu) * bandwidth * ref.duration) / fc >= NARROWBAND_LIMIT,
          baseband: false,
        };

  return {
    tau,
    mag,
    magNoisy,
    magUnweighted,
    window: [w0, w1],
    mainlobe: [iL, iR],
    metrics: {
      peakIndex: p,
      peakDelay: tau[p],
      delayShift: tau[p] - tau[p0],
      widthSec,
      halfPower,
      widthSecZeroDoppler,
      pulseFwhm,
      ratio: pulseFwhm / widthSec,
      tb: codeOrChirpTb(cfg),
      pslrDb,
      islrDb,
      weightingLossDb,
      dopplerLossDb: 20 * Math.log10(mag0[p0] / peak),
      rangeResolutionM: (SPEED_OF_LIGHT * widthSec) / 2,
      ambiguities,
      integrationGainDb,
      integrationLossDb,
      referenceSumSq: realEnergy(ref.real),
    },
    snr,
    reference: ref,
    narrowband,
    pri,
  };
}
