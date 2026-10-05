/**
 * Plot view helpers (React-free).
 *
 * Plotly's built-in double-click ("reset+autosize") restores the axis range it saw when the
 * plot was FIRST drawn and never refreshes it. This app changes the intended range all the
 * time (presets, Fit, Full record, unit changes such as MHz → GHz), so the built-in reset
 * brought back stale numbers — e.g. 655–1345 (MHz) shown under a "GHz" axis title.
 * Instead, a double-click returns every axis to what the CURRENT layout asks for.
 *
 * Take the snapshot when the layout is created: Plotly rewrites the ranges of the (nested) layout
 * objects it is given in place when the user zooms, so reading them later returns the zoom.
 */

const AXIS_KEY = /^[xy]axis\d*$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Plotly relayout update that restores each x/y axis to the range the layout specifies:
 * a fixed range stays fixed, an automatic axis returns to autorange.
 */
export function resetAxesUpdate(layout: object): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const [key, ax] of Object.entries(layout as Record<string, unknown>)) {
    if (!AXIS_KEY.test(key) || !isObject(ax)) continue;
    if (Array.isArray(ax.range) && ax.range.length === 2 && ax.autorange !== true) {
      update[`${key}.range`] = [...ax.range];
      update[`${key}.autorange`] = false;
    } else {
      update[`${key}.autorange`] = true;
    }
  }
  return update;
}
