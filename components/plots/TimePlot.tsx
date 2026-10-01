'use client';

import { useMemo, useState } from 'react';
import type { Data, Layout, Shape } from 'plotly.js-dist-min';
import type { SignalResult } from '@/lib/dsp/signals';
import { indexRange, minMaxIndices, pick } from '@/lib/dsp/decimate';
import { TIME_UNITS, chooseUnit, formatEngineering } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import Plot, { type RelayoutEvent } from './Plot';
import { C, axis, baseLayout } from './theme';

const MAX_POINTS = 4000;

interface Props {
  signal: SignalResult;
  compare: SignalResult | null;
  height: number;
}

function num(e: RelayoutEvent, k: string): number | undefined {
  const v = e[k];
  return typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : undefined;
}

export default function TimePlot({ signal, compare, height }: Props) {
  const lab = useLab();
  const a = lab.exp.analysis;
  const cfg = lab.exp.signal;
  const range = a.time.range;
  const T = signal.observation;
  const span = range.mode === 'manual' ? range.max - range.min : T;
  const unit = chooseUnit(span / 2, TIME_UNITS);
  const revision = `${range.mode}:${range.min}:${range.max}:${unit.label}:${T}`;
  const [view, setView] = useState<{ key: string; lo: number; hi: number } | null>(null);
  const v = view && view.key === revision ? view : null;
  const lo = v ? v.lo : range.mode === 'manual' ? range.min : 0;
  const hi = v ? v.hi : range.mode === 'manual' ? range.max : T;
  const showInst = a.time.showInstFreq && signal.carrier.on;
  const ampUnit = cfg.amplitudeUnit === 'V' ? 'V' : 'norm.';
  const cursors = a.cursors;

  const { data, layout } = useMemo(() => {
    const s = unit.scale;
    const margin = (hi - lo) * 0.5;
    const [i0, i1] = indexRange(signal.t, lo - margin, hi + margin);
    const idx = minMaxIndices(signal.x, i0, i1, MAX_POINTS);
    const visible = Math.max(1, Math.round((hi - lo) * signal.fs));
    const markers = a.time.showSamples || visible < 260;
    const traces: Data[] = [];

    if (signal.reference && (a.time.showReference || cfg.sampling.aliasingDemo)) {
      const r = signal.reference;
      const [r0, r1] = indexRange(r.t, lo - margin, hi + margin);
      const ridx = minMaxIndices(r.x, r0, r1, MAX_POINTS * 2);
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Physical waveform x(t) (before sampling)',
        x: pick(r.t, ridx, 1 / s),
        y: pick(r.x, ridx),
        line: { color: C.reference, width: 1.25 },
        hovertemplate: `t = %{x:.4f} ${unit.label}<br>x(t) = %{y:.4f}<extra>physical</extra>`,
      });
    }

    if (a.time.showEnvelope && (cfg.pulse.enabled || signal.carrier.on || cfg.am.enabled)) {
      const ex = pick(signal.t, idx, 1 / s);
      const ey = pick(signal.envelope, idx);
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Envelope ±|A a(t)| (model)',
        x: ex,
        y: ey,
        line: { color: C.envelope, width: 1.25, dash: 'dash' },
        hoverinfo: 'skip',
        legendgroup: 'env',
      });
      if (signal.carrier.on)
        traces.push({
          type: 'scatter',
          mode: 'lines',
          name: 'Envelope −',
          x: ex,
          y: ey.map((q) => -q),
          line: { color: C.envelope, width: 1.25, dash: 'dash' },
          hoverinfo: 'skip',
          showlegend: false,
          legendgroup: 'env',
        });
    }

    const fmtF = (f: number) => (Number.isFinite(f) ? formatEngineering(f, 'Hz', 4) : '—');
    const custom = idx.map((i) => [signal.envelope[i], fmtF(signal.instFreq[i])]);
    traces.push({
      type: 'scatter',
      mode: markers ? 'lines+markers' : 'lines',
      name: cfg.sampling.aliasingDemo ? 'Samples x[n] (observed, connected)' : 'x(t) — sampled record',
      x: pick(signal.t, idx, 1 / s),
      y: pick(signal.x, idx),
      line: { color: C.signal, width: 1.5 },
      marker: { size: markers ? 5 : 0, color: C.signal, line: { color: C.surface, width: 1 } },
      customdata: custom,
      hovertemplate:
        `t = %{x:.5g} ${unit.label}<br>x(t) = %{y:.4f} ${ampUnit}<br>Envelope = %{customdata[0]:.4f}` +
        (signal.carrier.on ? '<br>Instantaneous frequency = %{customdata[1]}' : '') +
        '<extra></extra>',
    });

    if (compare) {
      const [c0, c1] = indexRange(compare.t, lo - margin, hi + margin);
      const cidx = minMaxIndices(compare.x, c0, c1, MAX_POINTS);
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'x_A(t) — saved A',
        x: pick(compare.t, cidx, 1 / s),
        y: pick(compare.x, cidx),
        line: { color: C.compare, width: 1.25, dash: 'dot' },
        hovertemplate: `t = %{x:.5g} ${unit.label}<br>x_A = %{y:.4f}<extra>A</extra>`,
      });
    }

    if (showInst) {
      const fi = signal.instFreq;
      const fu = chooseUnit(Math.max(signal.carrier.centerHz, 1), [
        { label: 'Hz', scale: 1 },
        { label: 'kHz', scale: 1e3 },
        { label: 'MHz', scale: 1e6 },
        { label: 'GHz', scale: 1e9 },
      ]);
      const fidx = minMaxIndices(fi, i0, i1, MAX_POINTS);
      traces.push({
        type: 'scatter',
        mode: 'lines',
        name: `f_inst(t) (model, ${fu.label})`,
        x: pick(signal.t, fidx, 1 / s),
        y: fidx.map((i) => fi[i] / fu.scale),
        yaxis: 'y2',
        line: { color: C.extra, width: 1.5 },
        connectgaps: false,
        hovertemplate: `t = %{x:.5g} ${unit.label}<br>f_inst = %{y:.5g} ${fu.label}<extra></extra>`,
      });
    }

    const shapes: Partial<Shape>[] = [];
    if (cursors.enabled) {
      for (const [k, t] of [
        ['t₁', cursors.t1],
        ['t₂', cursors.t2],
      ] as const) {
        shapes.push({
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: t / s,
          x1: t / s,
          y0: 0,
          y1: 1,
          line: { color: C.cursor, width: 1.5 },
          editable: true,
          label: { text: k, textposition: 'end', font: { color: C.cursor, size: 11 } },
        } as Partial<Shape>);
      }
      if (a.spectrum.fftSelection) {
        shapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: Math.min(cursors.t1, cursors.t2) / s,
          x1: Math.max(cursors.t1, cursors.t2) / s,
          y0: 0,
          y1: 1,
          fillcolor: 'rgba(201,133,0,0.08)',
          line: { width: 0 },
          layer: 'below',
          editable: false,
        } as Partial<Shape>);
      }
    }
    if (a.time.showMarkers && cfg.pulse.enabled && signal.pulses.length > 1 && signal.pulses.length <= 256) {
      for (const p of signal.pulses) {
        shapes.push({
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: p.tCenter / s,
          x1: p.tCenter / s,
          y0: showInst ? 0.36 : 0,
          y1: 0.04 + (showInst ? 0.36 : 0),
          line: { color: C.muted, width: 1 },
          editable: false,
        } as Partial<Shape>);
        if (Math.abs(p.tCenter - p.tNominal) > 1e-15)
          shapes.push({
            type: 'line',
            xref: 'x',
            yref: 'paper',
            x0: p.tNominal / s,
            x1: p.tNominal / s,
            y0: showInst ? 0.36 : 0,
            y1: 0.025 + (showInst ? 0.36 : 0),
            line: { color: C.muted, width: 1, dash: 'dot' },
            editable: false,
          } as Partial<Shape>);
      }
    }

    const xr: [number, number] | undefined = range.mode === 'manual' ? [range.min / s, range.max / s] : undefined;
    const lay: Partial<Layout> = baseLayout({
      uirevision: revision,
      xaxis: axis(`t (${unit.label})`, xr ? { range: xr, autorange: false } : { autorange: true }),
      yaxis: axis(`x(t) (${ampUnit})`, { domain: showInst ? [0.36, 1] : [0, 1] }),
      ...(showInst ? { yaxis2: axis('f_inst', { domain: [0, 0.26], anchor: 'x' }) } : {}),
      shapes,
    });
    return { data: traces, layout: lay };
  }, [signal, compare, lo, hi, unit, revision, range, a.time, a.spectrum.fftSelection, cfg.sampling.aliasingDemo, cfg.pulse.enabled, cfg.am.enabled, cursors, showInst, ampUnit]);

  const onRelayout = (e: RelayoutEvent) => {
    const s = unit.scale;
    if (e['xaxis.autorange']) {
      setView(null);
      return;
    }
    const r0 = num(e, 'xaxis.range[0]');
    const r1 = num(e, 'xaxis.range[1]');
    if (r0 !== undefined && r1 !== undefined) setView({ key: revision, lo: r0 * s, hi: r1 * s });
    for (const [i, key] of [
      [0, 'analysis.cursors.t1'],
      [1, 'analysis.cursors.t2'],
    ] as const) {
      const x0 = num(e, `shapes[${i}].x0`);
      const x1 = num(e, `shapes[${i}].x1`);
      if (x0 !== undefined && cursors.enabled) lab.update(key, (((x0 + (x1 ?? x0)) / 2) * s));
    }
  };

  return (
    <Plot
      data={data}
      layout={layout}
      height={height}
      onRelayout={onRelayout}
      ariaLabel="Time-domain waveform x(t)"
      filename="time-domain"
    />
  );
}
