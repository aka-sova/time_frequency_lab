/**
 * UI text scale (React-free). The scale multiplies the root font size, so every
 * rem-based size follows; Plotly font sizes are scaled separately (they are
 * numbers in the figure layout, not CSS).
 */

/** Shared by the inline init script (app/layout.tsx) and the provider. */
export const FONT_SCALE_STORAGE_KEY = 'tf-lab-font-scale';
/** CSS custom property read by `html { font-size }` in globals.css. */
export const FONT_SCALE_CSS_VAR = '--ui-scale';

// Wide on purpose: the user is not limited to a few fixed steps.
export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 3;
export const FONT_SCALE_STEP = 0.1;

/** Clamps to the allowed range and rounds to 2 decimals (so repeated steps never drift). */
export function clampScale(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.round(Math.min(Math.max(v, FONT_SCALE_MIN), FONT_SCALE_MAX) * 100) / 100;
}

export function stepScale(current: number, direction: 1 | -1): number {
  return clampScale(current + direction * FONT_SCALE_STEP);
}

export function formatScale(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Runs before first paint so the page never flashes at the wrong size. */
export const FONT_SCALE_INIT_SCRIPT = `(function(){try{var v=parseFloat(localStorage.getItem('${FONT_SCALE_STORAGE_KEY}'));if(isFinite(v)){v=Math.min(Math.max(v,${FONT_SCALE_MIN}),${FONT_SCALE_MAX});document.documentElement.style.setProperty('${FONT_SCALE_CSS_VAR}',String(v));}}catch(e){}})();`;

const DEFAULT_PLOT_FONT = 12; // Plotly's own default when a layout sets none

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null; // not arrays, typed arrays, Dates …
}

/** Keys whose object value is a Plotly font spec: font, tickfont, titlefont, textfont, … */
const isFontKey = (k: string) => /font$/i.test(k);

function scaleNode(node: unknown, scale: number): unknown {
  if (Array.isArray(node)) return node.length > 0 && typeof node[0] !== 'object' ? node : node.map((n) => scaleNode(n, scale));
  if (!isPlainObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (isFontKey(k) && isPlainObject(v) && typeof v.size === 'number') out[k] = { ...v, size: Math.round(v.size * scale * 10) / 10 };
    else out[k] = scaleNode(v, scale);
  }
  return out;
}

/**
 * Returns a copy of a Plotly layout with every font size multiplied by `scale`
 * (axis ticks/titles, legend, annotations, hover labels, colorbars). Marker
 * sizes, margins and line widths are untouched. At scale 1 the input is
 * returned as is.
 */
export function scalePlotLayout<T extends object>(layout: T, scale: number): T {
  if (scale === 1) return layout;
  const base = layout as Record<string, unknown>;
  const withFont = isPlainObject(base.font) && typeof base.font.size === 'number' ? base : { ...base, font: { ...(isPlainObject(base.font) ? base.font : {}), size: DEFAULT_PLOT_FONT } };
  return scaleNode(withFont, scale) as T;
}
