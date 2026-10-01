/**
 * Short-time Fourier transform.
 *
 *   S(t_m, f_k) = Σ_n x[n] · w[n − mH] · e^{−j2πk(n − mH)/N_fft}
 *
 * Frames of L samples advance by hop H = L·(1 − overlap). The record is
 * zero-extended by L/2 at both ends so frame centers span the full record.
 * Magnitudes are coherent-gain normalized (|S|/Σw) and returned in dB
 * relative to the global maximum, positive frequencies only.
 *
 * Resolution trade-off: the window duration T_w = L/fs sets Δt ≈ T_w and
 * Δf ≈ (ENBW·fs)/L ≈ 1/T_w — shortening one lengthens the other.
 */
import type { AnalysisWindow } from '@/types/signal';
import { fftInPlace, nextPowerOfTwo } from './fft';
import { makeWindow, windowStats } from './windows';

export interface StftOptions {
  windowLength: number;
  overlapPct: number;
  nfft: number;
  window: AnalysisWindow;
  maxFrames?: number;
  /** Optional frequency band to keep [fMin, fMax]. */
  fMin?: number;
  fMax?: number;
  maxRows?: number;
}

export interface StftResult {
  times: number[];
  freqs: number[];
  /** dB relative to the global maximum, rows = frequency, cols = time. */
  db: number[][];
  hop: number;
  windowLength: number;
  nfft: number;
  windowDuration: number;
  binSpacing: number;
  /** Noise-equivalent bandwidth of the analysis window (Hz). */
  enbwHz: number;
  frames: number;
  cost: number;
}

export function stftCost(n: number, o: StftOptions): number {
  const L = Math.max(4, Math.round(o.windowLength));
  const hop = Math.max(1, Math.round(L * (1 - o.overlapPct / 100)));
  const frames = Math.ceil(n / hop) + 1;
  const nfft = Math.max(nextPowerOfTwo(o.nfft), nextPowerOfTwo(L));
  return frames * nfft * Math.log2(nfft);
}

export function computeSTFT(x: ArrayLike<number>, fs: number, o: StftOptions): StftResult {
  const n = x.length;
  const L = Math.min(Math.max(4, Math.round(o.windowLength)), n);
  const nfft = Math.max(nextPowerOfTwo(Math.round(o.nfft)), nextPowerOfTwo(L));
  let hop = Math.max(1, Math.round(L * (1 - Math.min(o.overlapPct, 95) / 100)));
  const maxFrames = o.maxFrames ?? 500;
  // Limit frame count for responsiveness; the effective overlap is reduced.
  const framesWanted = Math.floor(n / hop) + 1;
  if (framesWanted > maxFrames) hop = Math.ceil(n / (maxFrames - 1));
  const w = makeWindow(o.window, L, true);
  const ws = windowStats(w);
  const half = Math.floor(L / 2);
  const kMaxAll = Math.floor(nfft / 2);
  const df = fs / nfft;
  let k0 = Math.max(0, Math.floor((o.fMin ?? 0) / df));
  let k1 = Math.min(kMaxAll, Math.ceil((o.fMax ?? fs / 2) / df));
  if (!(k1 > k0)) {
    k0 = 0;
    k1 = kMaxAll;
  }
  const rowsAll = k1 - k0 + 1;
  const maxRows = o.maxRows ?? 384;
  const group = Math.max(1, Math.ceil(rowsAll / maxRows));
  const rows = Math.ceil(rowsAll / group);

  const times: number[] = [];
  const cols: Float64Array[] = [];
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  let globalMax = 0;
  for (let c = -half; c <= n - half; c += hop) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < L; i++) {
      const idx = c + i;
      if (idx >= 0 && idx < n) re[i] = x[idx] * w[i];
    }
    fftInPlace(re, im, false);
    const col = new Float64Array(rows);
    for (let r = 0; r < rows; r++) {
      let m = 0;
      // Max-pool groups of bins so narrow features survive display decimation.
      for (let g = 0; g < group; g++) {
        const k = k0 + r * group + g;
        if (k > k1) break;
        const v = (re[k] * re[k] + im[k] * im[k]) / (ws.sum * ws.sum);
        if (v > m) m = v;
      }
      col[r] = m;
      if (m > globalMax) globalMax = m;
    }
    cols.push(col);
    times.push((c + L / 2) / fs);
  }
  const freqs: number[] = [];
  for (let r = 0; r < rows; r++) freqs.push((k0 + r * group + (group - 1) / 2) * df);
  const ref = globalMax > 0 ? globalMax : 1;
  const db: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = new Array<number>(cols.length);
    for (let c = 0; c < cols.length; c++) row[c] = 10 * Math.log10(Math.max(cols[c][r] / ref, 1e-30));
    db.push(row);
  }
  return {
    times,
    freqs,
    db,
    hop,
    windowLength: L,
    nfft,
    windowDuration: L / fs,
    binSpacing: df,
    enbwHz: (ws.enbwBins * fs) / L,
    frames: cols.length,
    cost: cols.length * nfft * Math.log2(nfft),
  };
}
