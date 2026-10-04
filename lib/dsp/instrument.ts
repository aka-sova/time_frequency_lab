/**
 * Measurement-instrument model (React-free). The "true" waveform is the lab's
 * own noiseless record; the instrument is
 *
 *   1. trigger-jitter averaging    x ⊛ N(0, σ_j²)   — the *expectation* of an
 *                                  infinite average, i.e. no noise is shown
 *   2. causal single-pole low-pass H(f) = 1/(1 + jf/BW),  τ = 1/(2π·BW)
 *   3. sampling at f_s,scope with a phase offset (cubic interpolation)
 *   4. optional hard ADC clip at ±clipRatio × true peak
 */
import { fftReal, ifft, nextPowerOfTwo } from './fft';
import { edgeTimes, fwhm } from './measurements';
import { hilbertEnvelope } from './spectrum';

export interface InstrumentSettings {
  bandwidthHz: number;
  sampleRateHz: number;
  samplePhasePct: number;
  triggerJitterRmsSec: number;
  clipEnabled: boolean;
  clipRatio: number;
}

/**
 * Causal single-pole low-pass, exact for piecewise-linear input:
 *   y_i = a·y_{i−1} + (1−a)·x_{i−1} + m·(Δt − τ(1−a)),   a = e^{−Δt/τ},  m = (x_i − x_{i−1})/Δt
 * The record starts at rest (y_0 = x_0).
 */
export function lowpassFirstOrder(x: ArrayLike<number>, dt: number, tau: number): Float64Array {
  const n = x.length;
  const y = new Float64Array(n);
  if (n === 0) return y;
  const a = Math.exp(-dt / tau);
  const b = dt - tau * (1 - a);
  y[0] = x[0];
  for (let i = 1; i < n; i++) y[i] = a * y[i - 1] + (1 - a) * x[i - 1] + ((x[i] - x[i - 1]) / dt) * b;
  return y;
}

/** Convolution with a unit-area Gaussian of standard deviation `sigma` (s), done in the frequency domain. */
export function gaussianAverage(x: ArrayLike<number>, dt: number, sigma: number): Float64Array {
  const n = x.length;
  if (!(sigma > 0)) return Float64Array.from(x);
  const nfft = nextPowerOfTwo(2 * n);
  const { re, im } = fftReal(x, nfft);
  const c = 2 * Math.PI * Math.PI * sigma * sigma;
  for (let k = 0; k < nfft; k++) {
    const kk = k <= nfft / 2 ? k : k - nfft;
    const f = kk / (nfft * dt);
    const g = Math.exp(-c * f * f);
    re[k] *= g;
    im[k] *= g;
  }
  return ifft(re, im).re.slice(0, n);
}

/** Catmull-Rom cubic interpolation at fractional index `pos` (clamped to the record). */
export function interpolateCubic(y: ArrayLike<number>, pos: number): number {
  const n = y.length;
  if (pos <= 0) return y[0];
  if (pos >= n - 1) return y[n - 1];
  const i = Math.floor(pos);
  const u = pos - i;
  const p0 = y[Math.max(i - 1, 0)];
  const p1 = y[i];
  const p2 = y[i + 1];
  const p3 = y[Math.min(i + 2, n - 1)];
  return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
}

/** Indices of the first and last samples with |x| > rel·peak. */
export function activeRange(x: ArrayLike<number>, rel = 1e-4): [number, number] {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const thr = rel * peak;
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) <= thr) a++;
  while (b > a && Math.abs(x[b]) <= thr) b--;
  return [a, b];
}

export interface InstrumentMetrics {
  peakTrue: number;
  peakDisplayed: number;
  peakSampled: number;
  peakErrorDisplayedPct: number;
  peakErrorSampledPct: number;
  fwhmTrue: number;
  fwhmDisplayed: number;
  fwhmSampled: number;
  riseTrue: number;
  riseDisplayed: number;
  samplesAcrossFwhm: number;
}

export interface InstrumentResult {
  /** Time constant 1/(2π·BW) (s). */
  tau: number;
  /** 10–90 % rise time of the single pole, ln9·τ (s). */
  riseTimeFilter: number;
  /** Bandwidth-limited, no jitter averaging. */
  filtered: Float64Array;
  /** Jitter-averaged then bandwidth-limited (the trace the instrument "shows"). */
  displayed: Float64Array;
  sampleT: Float64Array;
  sampleV: Float64Array;
  /** Clip level (same unit as x), Infinity when off. */
  clipLevel: number;
  metrics: InstrumentMetrics;
}

const MAX_SCOPE_SAMPLES = 262144;
const pct = (v: number, ref: number) => (ref > 0 ? (100 * (v - ref)) / ref : NaN);
const width = (c: { valid: boolean; width: number }) => (c.valid ? c.width : NaN);

export function simulateInstrument(x: Float64Array, fs: number, s: InstrumentSettings, opts: { bandpass?: boolean } = {}): InstrumentResult {
  const n = x.length;
  const dt = 1 / fs;
  const tau = 1 / (2 * Math.PI * s.bandwidthHz);
  const t = Float64Array.from({ length: n }, (_, i) => i * dt);
  const env = (a: ArrayLike<number>): Float64Array => (opts.bandpass ? hilbertEnvelope(a) : Float64Array.from(a, Math.abs));

  const filtered = lowpassFirstOrder(x, dt, tau);
  const displayed = s.triggerJitterRmsSec > 0 ? lowpassFirstOrder(gaussianAverage(x, dt, s.triggerJitterRmsSec), dt, tau) : filtered;

  let peakTrue = 0;
  let peakDisplayed = 0;
  for (let i = 0; i < n; i++) {
    peakTrue = Math.max(peakTrue, Math.abs(x[i]));
    peakDisplayed = Math.max(peakDisplayed, Math.abs(displayed[i]));
  }

  const dtS = 1 / s.sampleRateHz;
  const tEnd = (n - 1) * dt;
  const t0 = (s.samplePhasePct / 100) * dtS;
  const count = Math.max(0, Math.min(MAX_SCOPE_SAMPLES, Math.floor((tEnd - t0) / dtS) + 1));
  const clipLevel = s.clipEnabled ? s.clipRatio * peakTrue : Infinity;
  const sampleT = new Float64Array(count);
  const sampleV = new Float64Array(count);
  let peakSampled = 0;
  for (let k = 0; k < count; k++) {
    const tk = t0 + k * dtS;
    const v = Math.max(-clipLevel, Math.min(clipLevel, interpolateCubic(displayed, tk * fs)));
    sampleT[k] = tk;
    sampleV[k] = v;
    peakSampled = Math.max(peakSampled, Math.abs(v));
  }

  const eTrue = env(x);
  const eDisp = env(displayed);
  const wTrue = fwhm(t, eTrue);
  const wDisp = fwhm(t, eDisp);
  const wSamp = !opts.bandpass && count >= 3 ? fwhm(sampleT, Float64Array.from(sampleV, Math.abs)) : { valid: false, width: NaN };
  const rTrue = edgeTimes(t, eTrue);
  const rDisp = edgeTimes(t, eDisp);

  return {
    tau,
    riseTimeFilter: Math.log(9) * tau,
    filtered,
    displayed,
    sampleT,
    sampleV,
    clipLevel,
    metrics: {
      peakTrue,
      peakDisplayed,
      peakSampled,
      peakErrorDisplayedPct: pct(peakDisplayed, peakTrue),
      peakErrorSampledPct: pct(peakSampled, peakTrue),
      fwhmTrue: width(wTrue),
      fwhmDisplayed: width(wDisp),
      fwhmSampled: width(wSamp),
      riseTrue: rTrue.rise,
      riseDisplayed: rDisp.rise,
      samplesAcrossFwhm: wTrue.valid ? wTrue.width * s.sampleRateHz : NaN,
    },
  };
}
