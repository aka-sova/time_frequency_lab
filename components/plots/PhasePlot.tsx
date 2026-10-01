'use client';

import { useMemo } from 'react';
import type { Data, Layout } from 'plotly.js-dist-min';
import type { Spectra } from '@/lib/dsp/analyze';
import type { SignalResult } from '@/lib/dsp/signals';
import { indexRange } from '@/lib/dsp/decimate';
import { viewOrder } from '@/lib/dsp/display';
import { phaseAt, unwrapPhase } from '@/lib/dsp/spectrum';
import { FREQ_UNITS, chooseUnit } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import Plot from './Plot';
import { axis, baseLayout } from './theme';
import { usePalette } from '@/components/layout/ThemeProvider';

/** Phase spectrum ∠X(f), masked where |X| is below the display floor (phase of noise is meaningless). */
export default function PhasePlot({ signal, spectra, height }: { signal: SignalResult; spectra: Spectra; height: number }) {
  const C = usePalette();
  const lab = useLab();
  const a = lab.exp.analysis;
  const sp = a.spectrum;
  const nyq = signal.fs / 2;
  const two = sp.sided === 'two';
  const fLo = sp.range.mode === 'manual' ? sp.range.min : two ? (sp.centered ? -nyq : 0) : 0;
  const fHi = sp.range.mode === 'manual' ? sp.range.max : two ? (sp.centered ? nyq : signal.fs) : nyq;
  const unit = chooseUnit(Math.max(Math.abs(fLo), Math.abs(fHi)) / 2, FREQ_UNITS);
  const deg = a.phaseUnit === 'deg';

  const { data, layout } = useMemo(() => {
    const s = spectra.spectrum;
    const o = viewOrder(s, sp.sided, sp.centered);
    const [i0, i1] = indexRange(o.f, fLo, fHi);
    const step = Math.max(1, Math.ceil((i1 - i0 + 1) / 6000));
    let peak = 0;
    for (let k = 0; k < s.nfft; k++) peak = Math.max(peak, s.power[k]);
    const thr = peak * 10 ** (Math.max(sp.dbFloor, -80) / 10);
    const tRef = sp.phaseReference === 'center' && lab.exp.signal.pulse.enabled ? (signal.pulses[Math.floor(signal.pulses.length / 2)]?.tCenter ?? 0) : s.tStart;
    const f: number[] = [];
    const ph: number[] = [];
    for (let i = i0; i <= i1; i += step) {
      const k = o.bins[i];
      f.push(o.f[i] / unit.scale);
      ph.push(s.power[k] >= thr ? phaseAt(s, k, tRef) : NaN);
    }
    const p = sp.phaseUnwrap ? Array.from(unwrapPhase(ph)) : ph;
    const y = p.map((v) => (deg ? (v * 180) / Math.PI : v));
    const traces: Data[] = [
      {
        type: 'scatter',
        mode: 'lines',
        name: `∠X(f) ${sp.phaseUnwrap ? 'unwrapped' : 'wrapped'} (ref. ${sp.phaseReference === 'center' ? 'pulse center' : 'record start'})`,
        x: f,
        y,
        connectgaps: false,
        line: { color: C.extra, width: 1.25 },
        hovertemplate: `f = %{x:.6g} ${unit.label}<br>phase = %{y:.4g}${deg ? '°' : ' rad'}<extra></extra>`,
      },
    ];
    const lay: Partial<Layout> = baseLayout(C, {
      uirevision: `${fLo}:${fHi}:${sp.phaseUnwrap}:${deg}`,
      xaxis: axis(C, `f (${unit.label})`, { range: [fLo / unit.scale, fHi / unit.scale], autorange: false }),
      yaxis: axis(C, `∠X (${deg ? 'deg' : 'rad'})`, sp.phaseUnwrap ? { autorange: true } : { range: deg ? [-190, 190] : [-3.3, 3.3], autorange: false, dtick: deg ? 90 : Math.PI / 2 }),
    });
    return { data: traces, layout: lay };
  }, [spectra, sp, fLo, fHi, unit, deg, signal, lab.exp.signal.pulse.enabled, C]);

  return <Plot data={data} layout={layout} height={height} ariaLabel="Phase spectrum" filename="phase" />;
}
