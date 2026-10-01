/**
 * Continuous wavelet transform evaluated in the frequency domain.
 *
 * For each analysis frequency f_c (log-spaced), the wavelet's Fourier
 * transform Ψ(f; f_c) is applied as a band-pass filter:
 *
 *   W(t, f_c) = IFFT{ X(f) · 2Ψ(f; f_c) · 1[f > 0] }
 *
 * Morlet:       Ψ(f) = exp(−½ (ω₀(f − f_c)/f_c)²)
 *               → spectral σ_f = f_c/ω₀, temporal σ_t = ω₀/(2π f_c),
 *                 σ_t·σ_f = 1/(4π) at every scale (Gaussian = minimum uncertainty).
 * Mexican hat:  Ψ(f) = (f/f_c)² · exp(1 − (f/f_c)²)   (peak 1 at f_c)
 *
 * Normalization: Ψ has unit peak gain and only positive frequencies are kept
 * (×2), so a real sinusoid A·cos(2πf_c t) produces |W| = A at f = f_c for any
 * scale ("amplitude-preserving" L¹ normalization). This is convenient for
 * display; energy-preserving L² normalization would weight scales by √s.
 *
 * Resolution adapts with scale: high f_c → short σ_t, wide σ_f; low f_c →
 * long σ_t, narrow σ_f. The uncertainty bound is never violated.
 */
import type { WaveletType } from '@/types/signal';
import { fftInPlace, nextPowerOfTwo } from './fft';

export interface CwtOptions {
  wavelet: WaveletType;
  omega0: number;
  fMin: number;
  fMax: number;
  scales: number;
  maxCols?: number;
}

export interface CwtResult {
  times: number[];
  freqs: number[];
  /** dB relative to the global maximum, rows = frequency, cols = time. */
  db: number[][];
  sigmaT: number[];
  sigmaF: number[];
  cost: number;
}

export function waveletResponse(type: WaveletType, f: number, fc: number, omega0: number): number {
  if (f <= 0) return 0;
  if (type === 'morlet') {
    const z = (omega0 * (f - fc)) / fc;
    return Math.exp(-0.5 * z * z);
  }
  const r = f / fc;
  return r * r * Math.exp(1 - r * r);
}

export function cwtCost(n: number, scales: number): number {
  const m = nextPowerOfTwo(n);
  return scales * m * Math.log2(m);
}

export function computeCWT(x: ArrayLike<number>, fs: number, o: CwtOptions): CwtResult {
  const n = x.length;
  const m = nextPowerOfTwo(n);
  const xr = new Float64Array(m);
  const xi = new Float64Array(m);
  for (let i = 0; i < n; i++) xr[i] = x[i];
  fftInPlace(xr, xi, false);

  const ns = Math.max(2, Math.round(o.scales));
  const fMin = Math.max(o.fMin, fs / m);
  const fMax = Math.min(Math.max(o.fMax, fMin * 1.01), fs / 2);
  const freqs: number[] = [];
  for (let s = 0; s < ns; s++) freqs.push(fMin * (fMax / fMin) ** (s / (ns - 1)));

  const maxCols = o.maxCols ?? 700;
  const group = Math.max(1, Math.ceil(n / maxCols));
  const cols = Math.ceil(n / group);
  const times: number[] = [];
  for (let c = 0; c < cols; c++) times.push(((c * group + (group - 1) / 2) / fs));

  const rows: Float64Array[] = [];
  const re = new Float64Array(m);
  const im = new Float64Array(m);
  const half = m / 2;
  let gmax = 0;
  for (const fc of freqs) {
    re.fill(0);
    im.fill(0);
    for (let k = 1; k < half; k++) {
      const g = 2 * waveletResponse(o.wavelet, (k * fs) / m, fc, o.omega0);
      if (g < 1e-12) continue;
      re[k] = xr[k] * g;
      im[k] = xi[k] * g;
    }
    fftInPlace(re, im, true);
    const row = new Float64Array(cols);
    for (let c = 0; c < cols; c++) {
      let mx = 0;
      for (let g = 0; g < group; g++) {
        const i = c * group + g;
        if (i >= n) break;
        const v = Math.hypot(re[i], im[i]) / m;
        if (v > mx) mx = v;
      }
      row[c] = mx;
      if (mx > gmax) gmax = mx;
    }
    rows.push(row);
  }
  const ref = gmax > 0 ? gmax : 1;
  const db = rows.map((r) => Array.from(r, (v) => 20 * Math.log10(Math.max(v / ref, 1e-15))));
  const spread = waveletSpread(o.wavelet, o.omega0);
  const sigmaF = freqs.map((fc) => spread.sigmaF * fc);
  const sigmaT = freqs.map((fc) => spread.sigmaT / fc);
  return { times, freqs, db, sigmaT, sigmaF, cost: cwtCost(n, ns) };
}

const spreadCache = new Map<string, { sigmaT: number; sigmaF: number }>();

/**
 * Energy-based RMS spreads of the analytic wavelet at f_c = 1 Hz, computed
 * numerically from |Ψ(f)|² and |ψ(t)|². Both scale with f_c (σ_f ∝ f_c,
 * σ_t ∝ 1/f_c), so their product is scale invariant and ≥ 1/(4π).
 */
export function waveletSpread(type: WaveletType, omega0: number): { sigmaT: number; sigmaF: number } {
  const key = `${type}:${omega0}`;
  const hit = spreadCache.get(key);
  if (hit) return hit;
  const fs = 64;
  const m = 8192;
  const re = new Float64Array(m);
  const im = new Float64Array(m);
  let p0 = 0;
  let p1 = 0;
  for (let k = 1; k < m / 2; k++) {
    const f = (k * fs) / m;
    const g = 2 * waveletResponse(type, f, 1, omega0);
    re[k] = g;
    p0 += g * g;
    p1 += f * g * g;
  }
  const fc = p1 / p0;
  let p2 = 0;
  for (let k = 1; k < m / 2; k++) {
    const f = (k * fs) / m;
    p2 += (f - fc) ** 2 * re[k] * re[k];
  }
  const sigmaF = Math.sqrt(p2 / p0);
  fftInPlace(re, im, true);
  let e0 = 0;
  let e2 = 0;
  for (let i = 0; i < m; i++) {
    const t = (i < m / 2 ? i : i - m) / fs;
    const e = re[i] * re[i] + im[i] * im[i];
    e0 += e;
    e2 += t * t * e;
  }
  const out = { sigmaT: Math.sqrt(e2 / e0), sigmaF };
  spreadCache.set(key, out);
  return out;
}
