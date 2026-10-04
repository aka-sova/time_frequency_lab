/** Rise-time budget and first-order uncertainty propagation (React-free). */

/** Textbook rise-time × bandwidth product (a rounded value). */
export const RISE_BW_PRODUCT = 0.35;
/** Exact 10–90 % rise-time × bandwidth product of a single pole: ln9 / 2π. */
export const SINGLE_POLE_RISE_BW_PRODUCT = Math.log(9) / (2 * Math.PI);

export function riseFromBandwidth(bandwidthHz: number, product = RISE_BW_PRODUCT): number {
  return product / bandwidthHz;
}

/** √(Σ t²): exact for Gaussian responses, ≈ 8 % low for two identical single poles. */
export function combineRise(parts: number[]): number {
  return Math.sqrt(parts.reduce((s, v) => s + v * v, 0));
}

/** Removes an instrument rise time by square subtraction; NaN when the instrument dominates. */
export function extractRise(measured: number, instrument: number): number {
  const d = measured * measured - instrument * instrument;
  return d > 0 ? Math.sqrt(d) : NaN;
}

export interface PowerUncertainty {
  /** Relative standard uncertainty of P = V²/R (%). */
  relStdPct: number;
  /** Expanded uncertainty k·u (%). */
  relExpandedPct: number;
  low: number;
  high: number;
}

/**
 * u_P/P = √((2·u_V/V)² + (u_R/R)²) for small, independent relative standard
 * uncertainties (first order, no covariance). `nominal` is the power the
 * interval is drawn around.
 */
export function powerUncertainty(uVoltagePct: number, uResistancePct: number, k = 2, nominal = 2): PowerUncertainty {
  const relStdPct = Math.hypot(2 * uVoltagePct, uResistancePct);
  const relExpandedPct = k * relStdPct;
  return { relStdPct, relExpandedPct, low: nominal * (1 - relExpandedPct / 100), high: nominal * (1 + relExpandedPct / 100) };
}
