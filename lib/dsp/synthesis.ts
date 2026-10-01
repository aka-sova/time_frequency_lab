/**
 * Fourier synthesis of a periodic pulse train (period T = 1, pulse centered
 * at t = 0) from its Fourier-series components:
 *
 *   x_K(t) = c₀ + Σ_{k=1}^{K} c_k cos(2πkt + θ_k)
 *
 * rect, duty d:  c₀ = d,  c_k = 2d·sinc(kd)
 * Gaussian σ:    c₀ = σ√(2π), c_k = 2σ√(2π)·exp(−2π²σ²k²)   (σ ≪ 1)
 *
 * With θ_k = 0 every component peaks at t = 0 (constructive interference)
 * and they cancel elsewhere. Randomizing θ_k keeps |c_k| — the same
 * magnitude spectrum — but destroys the temporal localization.
 */
import { createRng } from './random';

export type SynthesisTarget = 'rect' | 'gaussian';

export function sinc(x: number): number {
  if (Math.abs(x) < 1e-12) return 1;
  const p = Math.PI * x;
  return Math.sin(p) / p;
}

export function seriesCoefficient(target: SynthesisTarget, k: number, width: number): number {
  if (target === 'rect') return k === 0 ? width : 2 * width * sinc(k * width);
  const s = width * 0.4246609; // width = FWHM
  const a = s * Math.sqrt(2 * Math.PI);
  return k === 0 ? a : 2 * a * Math.exp(-2 * Math.PI * Math.PI * s * s * k * k);
}

export function targetValue(target: SynthesisTarget, t: number, width: number): number {
  const u = t - Math.round(t);
  if (target === 'rect') return Math.abs(u) < width / 2 ? 1 : Math.abs(u) === width / 2 ? 0.5 : 0;
  const s = width * 0.4246609;
  return Math.exp(-(u * u) / (2 * s * s));
}

export interface SynthesisResult {
  t: number[];
  target: number[];
  sum: number[];
  components: number[][];
  coefficients: number[];
  phases: number[];
}

export function synthesize(
  target: SynthesisTarget,
  width: number,
  harmonics: number,
  opts: { points?: number; showComponents?: number; randomPhase?: boolean; seed?: number } = {},
): SynthesisResult {
  const points = opts.points ?? 1200;
  const K = Math.max(0, Math.round(harmonics));
  const coeff: number[] = [];
  const phases: number[] = [];
  const rng = createRng(opts.seed ?? 1, 11);
  for (let k = 0; k <= K; k++) {
    coeff.push(seriesCoefficient(target, k, width));
    phases.push(k > 0 && opts.randomPhase ? 2 * Math.PI * rng.uniform() : 0);
  }
  const t: number[] = [];
  const tgt: number[] = [];
  const sum: number[] = [];
  const nComp = Math.min(opts.showComponents ?? 0, K);
  const comps: number[][] = Array.from({ length: nComp }, () => []);
  for (let i = 0; i < points; i++) {
    const ti = -0.5 + i / (points - 1);
    t.push(ti);
    tgt.push(targetValue(target, ti, width));
    let s = coeff[0];
    for (let k = 1; k <= K; k++) {
      const v = coeff[k] * Math.cos(2 * Math.PI * k * ti + phases[k]);
      s += v;
      if (k <= nComp) comps[k - 1].push(v);
    }
    sum.push(s);
  }
  return { t, target: tgt, sum, components: comps, coefficients: coeff, phases };
}
