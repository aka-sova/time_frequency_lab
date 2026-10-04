import { describe, expect, it } from 'vitest';
import { FONT_SCALE_MAX, FONT_SCALE_MIN, clampScale, formatScale, scalePlotLayout, stepScale } from '@/lib/ui/fontScale';

describe('clampScale', () => {
  it('keeps sane values, rounds to 2 decimals, falls back to 1 for junk', () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(1.234)).toBe(1.23);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Infinity)).toBe(1);
  });
  it('is limited only by very wide bounds', () => {
    expect(clampScale(0.01)).toBe(FONT_SCALE_MIN);
    expect(clampScale(99)).toBe(FONT_SCALE_MAX);
    expect(FONT_SCALE_MIN).toBeLessThanOrEqual(0.5);
    expect(FONT_SCALE_MAX).toBeGreaterThanOrEqual(3);
  });
});

describe('stepScale', () => {
  it('moves in 10 % steps without floating-point drift', () => {
    let v = 1;
    for (let i = 0; i < 7; i++) v = stepScale(v, 1);
    expect(v).toBe(1.7);
    for (let i = 0; i < 12; i++) v = stepScale(v, -1);
    expect(v).toBe(0.5);
  });
  it('stops at the bounds', () => {
    expect(stepScale(FONT_SCALE_MAX, 1)).toBe(FONT_SCALE_MAX);
    expect(stepScale(FONT_SCALE_MIN, -1)).toBe(FONT_SCALE_MIN);
  });
});

describe('formatScale', () => {
  it('shows a percentage', () => {
    expect(formatScale(1)).toBe('100%');
    expect(formatScale(1.25)).toBe('125%');
    expect(formatScale(0.7)).toBe('70%');
  });
});

describe('scalePlotLayout', () => {
  const layout = {
    font: { size: 11, color: '#fff' },
    xaxis: { title: { text: 'x', font: { size: 11 } }, tickfont: { size: 10 } },
    legend: { font: { size: 10 } },
    annotations: [{ text: 'a', font: { size: 11 } }, { text: 'b' }],
    hoverlabel: { font: { size: 11 } },
    margin: { l: 56 },
  };

  it('is the identity (same object) at scale 1', () => {
    expect(scalePlotLayout(layout, 1)).toBe(layout);
  });

  it('scales every font size, including nested titles and annotations', () => {
    const s = scalePlotLayout(layout, 2) as typeof layout;
    expect(s.font.size).toBe(22);
    expect(s.xaxis.title.font.size).toBe(22);
    expect(s.xaxis.tickfont.size).toBe(20);
    expect(s.legend.font.size).toBe(20);
    expect(s.annotations[0].font?.size).toBe(22);
    expect(s.hoverlabel.font.size).toBe(22);
  });

  it('leaves non-font numbers (margins, marker sizes) alone and does not mutate the input', () => {
    const s = scalePlotLayout(layout, 2) as typeof layout;
    expect(s.margin.l).toBe(56);
    expect(layout.font.size).toBe(11);
    expect(layout.xaxis.tickfont.size).toBe(10);
  });

  it('gives a layout without a base font a scaled default so unspecified text still scales', () => {
    const s = scalePlotLayout({ margin: { l: 1 } }, 1.5) as unknown as { font: { size: number } };
    expect(s.font.size).toBe(18); // 12 × 1.5
  });
});
