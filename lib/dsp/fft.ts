/**
 * Complex FFT for the browser.
 *
 * Convention (unscaled DFT):
 *   forward  X[k] = Σ_{n=0}^{N-1} x[n] · e^{-j2πkn/N}
 *   inverse  x[n] = (1/N) Σ_{k=0}^{N-1} X[k] · e^{+j2πkn/N}
 *
 * The FFT is only an algorithm for evaluating the DFT; every physical scaling
 * (Δt for a Fourier-transform estimate, 1/Σw for amplitude, 1/(fs·Σw²) for
 * PSD) is applied by the caller in spectrum.ts.
 *
 * Power-of-two lengths use an iterative radix-2 Cooley–Tukey transform.
 * Any other length uses Bluestein's chirp-z algorithm, which re-expresses the
 * DFT as a convolution evaluated with power-of-two FFTs.
 */

interface Radix2Tables {
  cos: Float64Array;
  sin: Float64Array;
  rev: Uint32Array;
}

const radix2Cache = new Map<number, Radix2Tables>();

export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function radix2Tables(n: number): Radix2Tables {
  let t = radix2Cache.get(n);
  if (t) return t;
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n);
    sin[k] = Math.sin((2 * Math.PI * k) / n);
  }
  const bits = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    let v = i;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (v & 1);
      v >>= 1;
    }
    rev[i] = r;
  }
  t = { cos, sin, rev };
  if (radix2Cache.size > 32) radix2Cache.clear();
  radix2Cache.set(n, t);
  return t;
}

/** In-place unscaled radix-2 transform. `inverse` flips the twiddle sign only. */
function radix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;
  const { cos, sin, rev } = radix2Tables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; j < i + half; j++, k += step) {
        const l = j + half;
        const c = cos[k];
        const s = sign * sin[k];
        const tre = re[l] * c - im[l] * s;
        const tim = re[l] * s + im[l] * c;
        re[l] = re[j] - tre;
        im[l] = im[j] - tim;
        re[j] += tre;
        im[j] += tim;
      }
    }
  }
}

interface BluesteinTables {
  m: number;
  wRe: Float64Array; // chirp w[n] = e^{-jπn²/N}
  wIm: Float64Array;
  bRe: Float64Array; // FFT of conj(w) arranged circularly
  bIm: Float64Array;
}

const bluesteinCache = new Map<number, BluesteinTables>();

function bluesteinTables(n: number): BluesteinTables {
  let t = bluesteinCache.get(n);
  if (t) return t;
  const m = nextPowerOfTwo(2 * n - 1);
  const wRe = new Float64Array(n);
  const wIm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // n² mod 2N keeps the angle small, preserving precision for large n.
    const idx = (i * i) % (2 * n);
    const ang = (Math.PI * idx) / n;
    wRe[i] = Math.cos(ang);
    wIm[i] = -Math.sin(ang);
  }
  const bRe = new Float64Array(m);
  const bIm = new Float64Array(m);
  bRe[0] = wRe[0];
  bIm[0] = -wIm[0];
  for (let i = 1; i < n; i++) {
    bRe[i] = bRe[m - i] = wRe[i];
    bIm[i] = bIm[m - i] = -wIm[i];
  }
  radix2(bRe, bIm, false);
  t = { m, wRe, wIm, bRe, bIm };
  if (bluesteinCache.size > 16) bluesteinCache.clear();
  bluesteinCache.set(n, t);
  return t;
}

function bluestein(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  // Inverse DFT via conjugation: IDFT(x) = conj(DFT(conj(x))) (unscaled).
  if (inverse) for (let i = 0; i < n; i++) im[i] = -im[i];
  const { m, wRe, wIm, bRe, bIm } = bluesteinTables(n);
  const aRe = new Float64Array(m);
  const aIm = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    aRe[i] = re[i] * wRe[i] - im[i] * wIm[i];
    aIm[i] = re[i] * wIm[i] + im[i] * wRe[i];
  }
  radix2(aRe, aIm, false);
  for (let i = 0; i < m; i++) {
    const r = aRe[i] * bRe[i] - aIm[i] * bIm[i];
    const q = aRe[i] * bIm[i] + aIm[i] * bRe[i];
    aRe[i] = r;
    aIm[i] = q;
  }
  radix2(aRe, aIm, true);
  for (let i = 0; i < n; i++) {
    const cr = aRe[i] / m;
    const ci = aIm[i] / m;
    re[i] = cr * wRe[i] - ci * wIm[i];
    im[i] = cr * wIm[i] + ci * wRe[i];
  }
  if (inverse) for (let i = 0; i < n; i++) im[i] = -im[i];
}

/** In-place unscaled complex DFT of any length. */
export function fftInPlace(re: Float64Array, im: Float64Array, inverse = false): void {
  if (re.length !== im.length) throw new Error('fft: re/im length mismatch');
  if (isPowerOfTwo(re.length)) radix2(re, im, inverse);
  else bluestein(re, im, inverse);
}

export interface ComplexArray {
  re: Float64Array;
  im: Float64Array;
}

/** Forward DFT of a real sequence, zero-padded to `nfft` (≥ x.length). */
export function fftReal(x: ArrayLike<number>, nfft = x.length): ComplexArray {
  const n = Math.max(nfft, x.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) re[i] = x[i];
  fftInPlace(re, im, false);
  return { re, im };
}

/** Scaled inverse DFT (includes the 1/N factor). Returns new arrays. */
export function ifft(reIn: Float64Array, imIn: Float64Array): ComplexArray {
  const re = Float64Array.from(reIn);
  const im = Float64Array.from(imIn);
  fftInPlace(re, im, true);
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
  return { re, im };
}

/**
 * DFT bin frequencies in natural FFT order: 0, Δf, …, (positive), then the
 * negative frequencies. Δf = fs/N.
 */
export function fftFrequencies(n: number, fs: number): Float64Array {
  const f = new Float64Array(n);
  const df = fs / n;
  const posMax = Math.floor((n - 1) / 2);
  for (let k = 0; k < n; k++) f[k] = (k <= posMax ? k : k - n) * df;
  // For even n, bin n/2 is the Nyquist bin; we label it −fs/2 (numpy convention).
  return f;
}

/** Rotate natural FFT order so that zero frequency is centered. */
export function fftshift<T extends Float64Array | number[]>(a: T): T {
  const n = a.length;
  const shift = Math.floor(n / 2);
  const out = (Array.isArray(a) ? new Array(n) : new Float64Array(n)) as T;
  for (let i = 0; i < n; i++) out[(i + shift) % n] = a[i];
  return out;
}
