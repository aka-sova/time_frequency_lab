import { describe, expect, it } from 'vitest';
import { resetAxesUpdate } from '@/lib/ui/plotView';

describe('resetAxesUpdate', () => {
  it('restores a manual range the app set (and turns autorange off)', () => {
    const u = resetAxesUpdate({ xaxis: { range: [197.3, 212.3], autorange: false } });
    expect(u).toEqual({ 'xaxis.range': [197.3, 212.3], 'xaxis.autorange': false });
  });

  it('restores autorange for axes the app leaves automatic', () => {
    expect(resetAxesUpdate({ xaxis: { autorange: true }, yaxis: { autorange: true } })).toEqual({ 'xaxis.autorange': true, 'yaxis.autorange': true });
  });

  it('treats an axis with a range but no explicit autorange as manual', () => {
    expect(resetAxesUpdate({ yaxis: { range: [-60, 4] } })).toEqual({ 'yaxis.range': [-60, 4], 'yaxis.autorange': false });
  });

  it('falls back to autorange for an axis that specifies neither', () => {
    expect(resetAxesUpdate({ yaxis2: { title: { text: 'f_inst' } } })).toEqual({ 'yaxis2.autorange': true });
  });

  it('handles several axes at once, including log-axis ranges (log10 units are passed through)', () => {
    const u = resetAxesUpdate({
      xaxis: { type: 'log', range: [8.8, 9.2], autorange: false },
      yaxis: { range: [-80, 4], autorange: false },
      yaxis2: { autorange: true },
    });
    expect(u).toEqual({ 'xaxis.range': [8.8, 9.2], 'xaxis.autorange': false, 'yaxis.range': [-80, 4], 'yaxis.autorange': false, 'yaxis2.autorange': true });
  });

  it('ignores everything that is not an x/y axis', () => {
    const u = resetAxesUpdate({ margin: { l: 1 }, legend: {}, shapes: [], xaxis: { autorange: true } });
    expect(Object.keys(u)).toEqual(['xaxis.autorange']);
  });

  it('returns copies, not references to the layout arrays', () => {
    const layout = { xaxis: { range: [1, 2], autorange: false } };
    const u = resetAxesUpdate(layout) as Record<string, number[]>;
    u['xaxis.range'][0] = 99;
    expect(layout.xaxis.range[0]).toBe(1);
  });

  it('returns an empty update when there are no axes', () => {
    expect(resetAxesUpdate({})).toEqual({});
  });
});
