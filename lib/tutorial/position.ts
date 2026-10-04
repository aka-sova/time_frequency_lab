/**
 * Where to put the tutorial card relative to the highlighted element (React-free).
 * All numbers are viewport pixels.
 */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
export interface Size {
  w: number;
  h: number;
}
export type Placement = 'top' | 'bottom' | 'left' | 'right';
export type Placed = { top: number; left: number; placement: Placement | 'center' | 'fallback' };

const OPPOSITE: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Tries the preferred side first, then its opposite, then the remaining sides, and takes the
 * first one where the card fits entirely inside the viewport without covering the target.
 * The card is centred on the target along the other axis and clamped to the viewport. When
 * nothing fits (a target that fills the screen) it sits at the bottom centre of the viewport
 * ('fallback'); the user can still drag it.
 */
export function placeCard(target: Rect | null, card: Size, vp: Size, prefer: Placement = 'bottom', gap = 14, margin = 12): Placed {
  if (!target) return { top: (vp.h - card.h) / 2, left: (vp.w - card.w) / 2, placement: 'center' };

  const order: Placement[] = [prefer, OPPOSITE[prefer], 'bottom', 'top', 'right', 'left'].filter((p, i, a) => a.indexOf(p) === i) as Placement[];
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  const maxLeft = vp.w - card.w - margin;
  const maxTop = vp.h - card.h - margin;

  for (const side of order) {
    let top: number;
    let left: number;
    let fits: boolean;
    if (side === 'bottom') {
      top = target.top + target.height + gap;
      left = clamp(cx - card.w / 2, margin, maxLeft);
      fits = top + card.h <= vp.h - margin;
    } else if (side === 'top') {
      top = target.top - gap - card.h;
      left = clamp(cx - card.w / 2, margin, maxLeft);
      fits = top >= margin;
    } else if (side === 'right') {
      left = target.left + target.width + gap;
      top = clamp(cy - card.h / 2, margin, maxTop);
      fits = left + card.w <= vp.w - margin;
    } else {
      left = target.left - gap - card.w;
      top = clamp(cy - card.h / 2, margin, maxTop);
      fits = left >= margin;
    }
    if (fits) return { top, left, placement: side };
  }
  return { top: Math.max(margin, maxTop), left: clamp((vp.w - card.w) / 2, margin, maxLeft), placement: 'fallback' };
}
