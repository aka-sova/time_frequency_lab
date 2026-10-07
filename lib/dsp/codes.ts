/**
 * Pulse-compression phase codes (React-free).
 *
 * Each code is a sequence of chip phases c[m] (radians) applied across the pulse:
 * φ_code(u) = c[⌊(u + τ/2)/T_c⌋], T_c = τ/L (see synthesize() in signals.ts).
 *
 *   Barker  binary 0/π, lengths 2–13; aperiodic autocorrelation sidelobes ≤ 1 (PSLR = 1/L)
 *   Frank   L = M², φ(iM + j) = 2π·i·j/M; perfect periodic autocorrelation
 *   P4      any L, φᵢ = π·i²/L − π·i; a sampled LFM, perfect periodic autocorrelation
 */

import type { CodeFamily } from '@/types/signal';

export type { CodeFamily };

export const CODE_FAMILIES: { id: CodeFamily; label: string }[] = [
  { id: 'barker', label: 'Barker' },
  { id: 'frank', label: 'Frank' },
  { id: 'p4', label: 'P4' },
];

const BARKER: Record<number, string> = {
  2: '+-',
  3: '++-',
  4: '++-+',
  5: '+++-+',
  7: '+++--+-',
  11: '+++---+--+-',
  13: '+++++--++-+-+',
};

export const BARKER_LENGTHS = [2, 3, 4, 5, 7, 11, 13] as const;
/** Frank orders M; the code length is M². */
export const FRANK_ORDERS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const P4_MIN = 2;
export const P4_MAX = 256;

const DEFAULT_LENGTH: Record<CodeFamily, number> = { barker: 13, frank: 16, p4: 16 };

export const isBinaryFamily = (f: CodeFamily): boolean => f === 'barker';

/** Barker sign pattern ('+'/'−') of a valid length, for display. */
export function barkerPattern(length: number): string {
  return (BARKER[snapCodeLength('barker', length)] ?? '').replace(/-/g, '−');
}

function nearest(values: readonly number[], x: number): number {
  let best = values[0];
  for (const v of values) if (Math.abs(v - x) < Math.abs(best - x)) best = v; // strict: ties keep the shorter
  return best;
}

/** Nearest valid length for the family (ties go to the shorter code). */
export function snapCodeLength(family: CodeFamily, length: number): number {
  if (!Number.isFinite(length)) return DEFAULT_LENGTH[family];
  switch (family) {
    case 'barker':
      return nearest(BARKER_LENGTHS, length);
    case 'frank':
      return nearest(
        FRANK_ORDERS.map((m) => m * m),
        length,
      );
    case 'p4':
      return Math.min(Math.max(Math.round(length), P4_MIN), P4_MAX);
  }
}

/** Chip phases in radians, one per chip, for the (snapped) length. */
export function codePhases(family: CodeFamily, length: number): Float64Array {
  const L = snapCodeLength(family, length);
  const ph = new Float64Array(L);
  switch (family) {
    case 'barker': {
      const s = BARKER[L];
      for (let i = 0; i < L; i++) ph[i] = s[i] === '+' ? 0 : Math.PI;
      break;
    }
    case 'frank': {
      const M = Math.round(Math.sqrt(L));
      for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) ph[i * M + j] = (2 * Math.PI * i * j) / M;
      break;
    }
    case 'p4':
      for (let i = 0; i < L; i++) ph[i] = (Math.PI * i * i) / L - Math.PI * i;
      break;
  }
  return ph;
}
