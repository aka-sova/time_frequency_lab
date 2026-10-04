'use client';

import { useMemo, useState } from 'react';
import type { Annotation, Data, Layout, Shape } from 'plotly.js-dist-min';
import type { AmplitudeUnit } from '@/types/signal';
import type { Spectra, Measurements } from '@/lib/dsp/analyze';
import type { SignalResult } from '@/lib/dsp/signals';
import { indexRange, minMaxIndices, pick } from '@/lib/dsp/decimate';
import { spectrumView, valuesFromMag, viewOrder } from '@/lib/dsp/display';
import { phaseAt } from '@/lib/dsp/spectrum';
import { aliasFrequency } from '@/lib/dsp/sampling';
import { FREQ_UNITS, chooseUnit, formatEngineering, formatNumber, formatPhase } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import Plot, { type RelayoutEvent } from './Plot';
import { axis, baseLayout } from './theme';
import { usePalette } from '@/components/layout/ThemeProvider';

const MAX_POINTS = 5000;

interface Props {
  signal: SignalResult;
  spectra: Spectra;
  measurements: Measurements;
  compare: Spectra | null;
  height: number;
}

function num(e: RelayoutEvent, k: string): number | undefined {
  const v = e[k];
  return typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : undefined;
}

export function unitLabels(amplitudeUnit: AmplitudeUnit) {
  if (amplitudeUnit === 'V') return { ft: 'V/Hz', amp: 'V', psd: 'V²/Hz' };
  if (amplitudeUnit === 'V/m') return { ft: 'V/m/Hz', amp: 'V/m', psd: '(V/m)²/Hz' };
  return { ft: 'a.u.·s', amp: 'a.u.', psd: 'a.u.²/Hz' };
}

export default function SpectrumPlot({ signal, spectra, measurements: m, compare, height }: Props) {
  const C = usePalette();
  const lab = useLab();
  const a = lab.exp.analysis;
  const sp = a.spectrum;
  const cfg = lab.exp.signal;
  const nyq = signal.fs / 2;
  const range = sp.range;
  const two = sp.sided === 'two';
  const full: [number, number] = two ? (sp.centered ? [-nyq, nyq] : [0, signal.fs]) : [0, nyq];
  const fLo = range.mode === 'manual' ? range.min : full[0];
  const fHi = range.mode === 'manual' ? range.max : full[1];
  const unit = chooseUnit(Math.max(Math.abs(fLo), Math.abs(fHi)) / 2, FREQ_UNITS);
  const logX = sp.logFrequency && !two;
  const revision = `${range.mode}:${range.min}:${range.max}:${unit.label}:${sp.sided}:${sp.centered}:${logX}:${sp.display}:${sp.powerDb}:${sp.dbFloor}`;
  const [view, setView] = useState<{ key: string; lo: number; hi: number } | null>(null);
  const v = view && view.key === revision ? view : null;
  const lo = v ? v.lo : fLo;
  const hi = v ? v.hi : fHi;
  const units = unitLabels(cfg.amplitudeUnit);
  const cursors = a.cursors;
  const train = spectra.single !== null;

  const { data, layout } = useMemo(() => {
    const s = unit.scale;
    // Shapes and annotations on a log axis are positioned in log10 units.
    const sx = (f: number) => (logX ? Math.log10(Math.max(f, 1e-30) / s) : f / s);
    const useWelch = sp.display === 'psd' && sp.estimator === 'welch' && spectra.welch;
    const base = useWelch ? spectra.welch! : spectra.spectrum;
    const opts = { sided: sp.sided, centered: sp.centered, display: sp.display, powerDb: sp.powerDb, unitLabel: units };
    const view = spectrumView(base, opts);
    const margin = (hi - lo) * 0.25;
    const [i0, i1] = indexRange(view.f, lo - margin, hi + margin);
    const isDb = view.db;
    let yPeak = -Infinity;
    for (let i = 0; i < view.y.length; i++) if (view.y[i] > yPeak) yPeak = view.y[i];
    const floorAbs = sp.display === 'db' ? sp.dbFloor : yPeak + sp.dbFloor;
    const clip = (y: number) => (isDb ? Math.max(y, floorAbs - 3) : y);
    const idx = minMaxIndices(view.y, i0, i1, MAX_POINTS).filter((i) => !logX || view.f[i] > 0);
    const traces: Data[] = [];
    const xs = (arr: Float64Array, ids: number[]) => pick(arr, ids, 1 / s);

    // Band shading
    const shapes: Partial<Shape>[] = [];
    const ann: Partial<Annotation>[] = [];
    if (cursors.enabled) {
      for (const [k, f] of [
        ['f₁', cursors.f1],
        ['f₂', cursors.f2],
      ] as const) {
        shapes.push({
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: sx(f),
          x1: sx(f),
          y0: 0,
          y1: 1,
          line: { color: C.cursor, width: 1.5 },
          editable: true,
          label: { text: k, textposition: 'end', font: { color: C.cursor, size: 11 } },
        } as Partial<Shape>);
      }
    }
    const env = m.single ?? m.full;
    if (sp.showBandMarkers && !useWelch) {
      const bands: [typeof env.bw3, string, string][] = [
        [env.obw99, C.band99, '99 %'],
        [env.bw3, C.band, '−3 dB'],
      ];
      for (const [b, color, label] of bands) {
        if (!b.valid) continue;
        const spans: [number, number][] = [[b.low, b.high]];
        if (two && sp.centered) spans.push([-b.high, -b.low]);
        for (const [x0, x1] of spans)
          shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: sx(x0), x1: sx(x1), y0: 0, y1: 1, fillcolor: color, line: { width: 0 }, layer: 'below', editable: false } as Partial<Shape>);
        ann.push({
          x: sx((b.high + Math.max(b.low, 0)) / 2),
          y: label === '99 %' ? 0.02 : 0.08,
          xref: 'x',
          yref: 'paper',
          text: `${label}${m.single ? ' (pulse)' : ''}: ${formatEngineering(b.width, 'Hz')}`,
          showarrow: false,
          font: { size: 10, color: C.ink2 },
          bgcolor: C.labelBg,
        });
      }
    }
    if (sp.showNyquist) {
      const marks = two ? (sp.centered ? [-nyq, nyq] : [nyq]) : [nyq];
      for (const f of marks) {
        shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: sx(f), x1: sx(f), y0: 0, y1: 1, line: { color: C.muted, width: 1, dash: 'dash' }, editable: false } as Partial<Shape>);
        if (f >= lo && f <= hi) ann.push({ x: sx(f), y: 1, xref: 'x', yref: 'paper', yanchor: 'bottom', text: two && !sp.centered ? 'fₛ/2' : f < 0 ? '−f_N' : 'f_N = fₛ/2', showarrow: false, font: { size: 10, color: C.ink2 } });
      }
      if (!two && hi > nyq)
        shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: sx(nyq), x1: sx(hi), y0: 0, y1: 1, fillcolor: C.beyondNyquist, line: { width: 0 }, layer: 'below', editable: false } as Partial<Shape>);
    }

    // Physical (pre-sampling) spectrum
    if (spectra.reference) {
      const rv = spectrumView(spectra.reference, { ...opts, sided: two ? 'two' : 'one', centered: true });
      const [r0, r1] = indexRange(rv.f, lo - margin, hi + margin);
      const ridx = minMaxIndices(rv.y, r0, r1, MAX_POINTS).filter((i) => !logX || rv.f[i] > 0);
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Physical spectrum (before sampling)',
        x: xs(rv.f, ridx),
        y: ridx.map((i) => clip(rv.y[i])),
        line: { color: C.reference, width: 1.25 },
        hovertemplate: `f = %{x:.5g} ${unit.label}<br>physical: %{y:.4g}<extra></extra>`,
      });
      if (signal.carrier.on && signal.carrier.centerHz > nyq) {
        const fa = aliasFrequency(signal.carrier.centerHz, signal.fs);
        ann.push({ x: sx(fa), y: 0.9, xref: 'x', yref: 'paper', text: `alias of f₀ → ${formatEngineering(fa, 'Hz')}`, showarrow: true, arrowcolor: C.ink2, ax: 0, ay: -22, font: { size: 10, color: C.ink } });
        ann.push({ x: sx(signal.carrier.centerHz), y: 0.9, xref: 'x', yref: 'paper', text: `true f₀ = ${formatEngineering(signal.carrier.centerHz, 'Hz')}`, showarrow: true, arrowcolor: C.reference, ax: 0, ay: -22, font: { size: 10, color: C.ink } });
      }
    }

    // Single-pulse envelope overlays (coherent N·|P|, incoherent √N·|P|)
    if (train && sp.showSinglePulse && spectra.single && !useWelch) {
      const N = signal.pulseCount;
      const so = viewOrder(spectra.single, sp.sided, sp.centered);
      const smag = new Float64Array(so.f.length);
      for (let i = 0; i < so.f.length; i++) smag[i] = Math.sqrt(spectra.single.power[so.bins[i]]) * spectra.single.magScale;
      const [s0, s1] = indexRange(so.f, lo - margin, hi + margin);
      for (const [factor, name, dash] of [
        [N, `Single pulse × N (coherent line envelope)`, 'dash'],
        [Math.sqrt(N), `Single pulse × √N (incoherent mean level)`, 'dot'],
      ] as const) {
        const vals = valuesFromMag(smag.map((q) => q * factor), so.doubled, spectra.single, sp.display, sp.powerDb, view.magPeak);
        const sidx = minMaxIndices(vals, s0, s1, 2500).filter((i) => !logX || so.f[i] > 0);
        traces.push({
          type: 'scatter',
          mode: 'lines',
          name,
          x: xs(so.f, sidx),
          y: sidx.map((i) => clip(vals[i])),
          line: { color: C.envelope, width: 1.25, dash },
          hoverinfo: 'skip',
        });
      }
    }

    // Main spectrum
    const peakDb = (i: number) => 20 * Math.log10(Math.max(view.mag[i] / (view.magPeak || 1), 1e-15));
    const tRef = sp.phaseReference === 'center' && cfg.pulse.enabled ? (signal.pulses[Math.floor(signal.pulses.length / 2)]?.tCenter ?? 0) : base.tStart;
    const custom = idx.map((i) => [
      formatNumber(peakDb(i), 4),
      formatNumber(view.mag[i] * view.mag[i], 4),
      useWelch ? '—' : formatPhase(phaseAt(base, view.bins[i], tRef), a.phaseUnit),
    ]);
    const label =
      sp.display === 'psd' ? (useWelch ? 'Welch PSD' : 'Periodogram PSD') : sp.display === 'power' ? (base.scaling === 'ft' ? '|X(f)|² (ESD)' : '|X|² power') : base.scaling === 'ft' ? '|X(f)| — DFT estimate of the Fourier transform' : '|X| amplitude spectrum';
    traces.push({
      type: 'scatter',
      mode: 'lines',
      name: label,
      x: xs(view.f, idx),
      y: idx.map((i) => clip(view.y[i])),
      line: { color: C.signal, width: 1.5 },
      customdata: custom,
      hovertemplate: `f = %{x:.6g} ${unit.label}<br>Magnitude = %{customdata[0]} dB re peak<br>Power |X|² = %{customdata[1]}<br>Phase = %{customdata[2]}<extra></extra>`,
    });

    // Raw (un-padded) DFT bins
    if (sp.showRawBins && sp.zeroPad > 1 && !useWelch) {
      const pad = Math.round(base.nfft / base.nSeg);
      if (pad > 1 && Number.isInteger(base.nfft / base.nSeg)) {
        const raw: number[] = [];
        for (let i = i0; i <= i1; i++) if (view.bins[i] % pad === 0 && (!logX || view.f[i] > 0)) raw.push(i);
        if (raw.length < 3000)
          traces.push({
            type: 'scatter',
            mode: 'markers',
            name: `Un-padded DFT bins (Δf = ${formatEngineering(base.recordBinSpacing, 'Hz')})`,
            x: xs(view.f, raw),
            y: raw.map((i) => clip(view.y[i])),
            marker: { color: C.cursor, size: 6, line: { color: C.surface, width: 1 } },
            hovertemplate: `bin f = %{x:.6g} ${unit.label}<extra>raw DFT bin</extra>`,
          });
      }
    }

    if (compare) {
      const cv = spectrumView(compare.spectrum, opts);
      const [c0, c1] = indexRange(cv.f, lo - margin, hi + margin);
      const cidx = minMaxIndices(cv.y, c0, c1, MAX_POINTS).filter((i) => !logX || cv.f[i] > 0);
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: '|X_A(f)| — saved A',
        x: xs(cv.f, cidx),
        y: cidx.map((i) => clip(cv.y[i])),
        line: { color: C.compare, width: 1.25, dash: 'dot' },
        hovertemplate: `f = %{x:.6g} ${unit.label}<br>A: %{y:.4g}<extra></extra>`,
      });
    }

    // Comb spacing annotation
    if (train && m.comb && Number.isFinite(m.comb.spacing) && m.comb.lines.length >= 2) {
      const pk = env.peakFrequency;
      const lines = [...m.comb.lines].sort((p, q) => Math.abs(p - pk) - Math.abs(q - pk));
      const f1 = lines[0];
      const f2 = m.comb.lines.find((f) => f > f1 + 0.5 * m.comb!.spacing) ?? f1 + m.comb.spacing;
      if (f1 >= lo && f2 <= hi) {
        shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: sx(f1), x1: sx(f2), y0: 0.94, y1: 0.94, line: { color: C.ink2, width: 1 }, editable: false } as Partial<Shape>);
        for (const f of [f1, f2])
          shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: sx(f), x1: sx(f), y0: 0.92, y1: 0.96, line: { color: C.ink2, width: 1 }, editable: false } as Partial<Shape>);
        ann.push({ x: sx(f2), y: 0.94, xref: 'x', yref: 'paper', xanchor: 'left', text: ` Δf_comb = ${formatEngineering(m.comb.spacing, 'Hz')} (PRF = ${formatEngineering(cfg.repetition.prfHz, 'Hz')})`, showarrow: false, font: { size: 10, color: C.ink } });
      }
    }

    const toAxis = (x: number) => (logX ? Math.log10(Math.max(x, 1e-30) / s) : x / s);
    const xr: [number, number] | undefined = range.mode === 'manual' || logX ? [toAxis(logX ? Math.max(fLo, base.binSpacing) : fLo), toAxis(fHi)] : undefined;
    const yr: [number, number] | undefined = isDb ? [floorAbs, (sp.display === 'db' ? 0 : yPeak) + 4] : undefined;
    const lay: Partial<Layout> = baseLayout(C, {
      uirevision: revision,
      xaxis: axis(C, `f (${unit.label})`, { type: logX ? 'log' : 'linear', ...(xr ? { range: xr, autorange: false } : { autorange: true }) }),
      yaxis: axis(C, view.yLabel, yr ? { range: yr, autorange: false } : { autorange: true, rangemode: sp.display === 'normalized' || sp.display === 'magnitude' ? 'tozero' : 'normal' }),
      shapes,
      annotations: ann,
    });
    return { data: traces, layout: lay };
  }, [signal, spectra, m, compare, lo, hi, unit, revision, sp, cfg.pulse.enabled, cfg.repetition.prfHz, cursors, units, nyq, two, logX, fLo, fHi, range.mode, train, a.phaseUnit, C]);

  const onRelayout = (e: RelayoutEvent) => {
    const s = unit.scale;
    if (e['xaxis.autorange']) {
      setView(null);
      return;
    }
    const r0 = num(e, 'xaxis.range[0]');
    const r1 = num(e, 'xaxis.range[1]');
    if (r0 !== undefined && r1 !== undefined) {
      const conv = (x: number) => (logX ? 10 ** x * s : x * s);
      setView({ key: revision, lo: conv(r0), hi: conv(r1) });
    }
    for (const [i, key] of [
      [0, 'analysis.cursors.f1'],
      [1, 'analysis.cursors.f2'],
    ] as const) {
      const x0 = num(e, `shapes[${i}].x0`);
      const x1 = num(e, `shapes[${i}].x1`);
      if (x0 !== undefined && cursors.enabled) {
        const xm = (x0 + (x1 ?? x0)) / 2;
        lab.update(key, logX ? 10 ** xm * s : xm * s);
      }
    }
  };

  return <Plot data={data} layout={layout} height={height} onRelayout={onRelayout} ariaLabel="Frequency-domain spectrum" filename="spectrum" />;
}
