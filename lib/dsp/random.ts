/**
 * Deterministic, seedable random numbers so that experiments are repeatable.
 *
 * mulberry32 is a small 32-bit generator with good statistical quality for
 * visualization purposes. Each physical effect (timing, amplitude, frequency,
 * phase, noise) draws from its own stream, derived from the user seed with a
 * splitmix-style hash. Enabling one effect therefore never changes the
 * realization of another one.
 */

export interface Rng {
  /** Uniform on [0, 1). */
  uniform(): number;
  /** Standard normal N(0, 1) via Box–Muller. */
  normal(): number;
}

function hash32(a: number): number {
  let h = a | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const RNG_STREAM = {
  timing: 1,
  amplitude: 2,
  frequency: 3,
  phase: 4,
  noise: 5,
  incoherentPhase: 6,
} as const;

export function createRng(seed: number, stream = 0): Rng {
  let state = hash32(hash32(Math.floor(seed) >>> 0) + 0x9e3779b9 * (stream + 1));
  let spare: number | null = null;
  const uniform = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u <= 1e-300) u = uniform();
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return { uniform, normal };
}
