'use client';

import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { Data } from 'plotly.js-dist-min';
import { SWEEP_METRICS, SWEEP_PARAMETERS, runSweepTimed, sweepValues, type SweepMetric, type SweepRow } from '@/lib/dsp/sweep';
import { formatEngineering, formatNumber, parseEngineering } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import { SmallButton } from '@/components/controls/primitives';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';

function parseValue(t: string, unit: string): number {
  const v = unit === 's' || unit === 'Hz' ? parseEngineering(t, unit) : Number(t.replace(',', '.'));
  return v === null ? NaN : v;
}

function initial(v: number, unit: string): string {
  return unit === 's' || unit === 'Hz' ? formatEngineering(v, unit, 4) : String(v);
}

function fmt(v: number, unit: string) {
  if (unit === 'Hz' || unit === 's') return formatEngineering(v, unit);
  if (unit === 'dB') return `${formatNumber(v, 3)} dB`;
  if (unit === 'rad') return `${formatNumber(v, 3)} rad`;
  return formatNumber(v, 4);
}

export default function SweepPanel() {
  const C = usePalette();
  const lab = useLab();
  const [paramId, setParamId] = useState('pw');
  const param = SWEEP_PARAMETERS.find((p) => p.id === paramId)!;
  const [start, setStart] = useState(initial(param.min, param.unit));
  const [stop, setStop] = useState(initial(param.max, param.unit));
  const [steps, setSteps] = useState(12);
  const [log, setLog] = useState(param.log);
  const [metric, setMetric] = useState<SweepMetric>('envBw3');
  const [result, setResult] = useState<{ rows: SweepRow[]; paramId: string; ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = lab.isLocked(param.path);

  const run = () => {
    const a = parseValue(start, param.unit);
    const b = parseValue(stop, param.unit);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      setError('Enter distinct start/stop values, e.g. “1 ns”, “2.5 GHz”, “1e-9”.');
      return;
    }
    setError(null);
    const { rows, ms } = runSweepTimed(lab.exp, param, sweepValues(a, b, steps, log, param.integer));
    setResult({ rows, paramId, ms });
  };

  const metricInfo = SWEEP_METRICS.find((m) => m.id === metric)!;
  const plot = useMemo(() => {
    if (!result) return null;
    const p = SWEEP_PARAMETERS.find((q) => q.id === result.paramId)!;
    const x = result.rows.map((r) => r.value);
    const y = result.rows.map((r) => r.metrics[metric]);
    const data: Data[] = [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: metricInfo.label,
        x,
        y,
        line: { color: C.signal, width: 2 },
        marker: { size: 8, color: C.signal, line: { color: C.surface, width: 2 } },
        hovertemplate: `${p.label} = %{x:.4g} ${p.unit}<br>${metricInfo.label} = %{y:.4g} ${metricInfo.unit}<extra></extra>`,
      },
    ];
    // Inverse-law reference for width-type sweeps
    if ((p.id === 'pw' || p.id === 'np') && (metric === 'envBw3' || metric === 'bw3' || metric === 'bw99' || metric === 'bwRms')) {
      const i = Math.floor(x.length / 2);
      const c = y[i] * x[i];
      if (Number.isFinite(c))
        data.push({ type: 'scatter', mode: 'lines', name: 'c / x reference', x, y: x.map((v) => c / v), line: { color: C.muted, dash: 'dash', width: 1 } });
    }
    const logAxes = log && x.every((v) => v > 0);
    return (
      <Plot
        data={data}
        layout={baseLayout(C, {
          margin: { l: 64, r: 12, t: 8, b: 40 },
          xaxis: axis(C, `${p.label} (${p.unit || '—'})`, { type: logAxes ? 'log' : 'linear', exponentformat: 'SI' }),
          yaxis: axis(C, `${metricInfo.label}${metricInfo.unit ? ` (${metricInfo.unit})` : ''}`, { type: logAxes && y.every((v) => v > 0) ? 'log' : 'linear', exponentformat: 'SI' }),
        })}
        height={300}
        ariaLabel="Parameter sweep result"
        filename="sweep"
      />
    );
  }, [result, metric, metricInfo, log, C]);

  return (
    <div className="grid gap-4 lg:grid-cols-[18.75rem_minmax(0,1fr)]">
      <div className="space-y-2 text-[0.75rem]">
        <label className="block">
          <span className="text-ink-2">Parameter</span>
          <select
            value={paramId}
            onChange={(e) => {
              const p = SWEEP_PARAMETERS.find((q) => q.id === e.target.value)!;
              setParamId(p.id);
              setStart(initial(p.min, p.unit));
              setStop(initial(p.max, p.unit));
              setLog(p.log);
            }}
            className="mt-0.5 w-full rounded-sm border border-line-strong bg-surface px-1.5 py-1"
          >
            {SWEEP_PARAMETERS.map((p) => (
              <option key={p.id} value={p.id} disabled={lab.isLocked(p.path)}>
                {p.label}
                {lab.isLocked(p.path) ? ' (locked)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-ink-2">Start ({param.unit || '—'})</span>
            <input value={start} onChange={(e) => setStart(e.target.value)} className="tabular mt-0.5 w-full rounded-sm border border-line-strong bg-surface px-1.5 py-1 font-mono" />
            <span className="text-[0.6875rem] text-muted">{fmt(parseValue(start, param.unit), param.unit)}</span>
          </label>
          <label className="block">
            <span className="text-ink-2">Stop ({param.unit || '—'})</span>
            <input value={stop} onChange={(e) => setStop(e.target.value)} className="tabular mt-0.5 w-full rounded-sm border border-line-strong bg-surface px-1.5 py-1 font-mono" />
            <span className="text-[0.6875rem] text-muted">{fmt(parseValue(stop, param.unit), param.unit)}</span>
          </label>
        </div>
        <label className="block">
          <span className="text-ink-2">Steps: {steps}</span>
          <input type="range" min={3} max={40} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full" />
        </label>
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={log} onChange={() => setLog(!log)} className="h-3 w-3 accent-accent" /> Logarithmic spacing
        </label>
        <label className="block">
          <span className="text-ink-2">Plotted metric</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value as SweepMetric)} className="mt-0.5 w-full rounded-sm border border-line-strong bg-surface px-1.5 py-1">
            {SWEEP_METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <SmallButton onClick={run} disabled={locked}>
          <Play size={12} aria-hidden /> Run sweep
        </SmallButton>
        {locked ? <p className="text-[0.6875rem] text-warn">This parameter is locked and cannot be swept.</p> : null}
        {error ? <p className="text-[0.6875rem] text-critical">{error}</p> : null}
        <p className="text-[0.6875rem] text-muted">
          All other parameters stay at their current values (sampling included). Each step generates the waveform and measures it — values are never interpolated or assumed.
          {result ? ` Last run: ${result.rows.length} steps in ${result.ms.toFixed(0)} ms.` : ''}
        </p>
      </div>
      <div className="min-w-0">
        {plot ?? <p className="text-[0.75rem] text-muted">Choose a parameter and run the sweep. Suggested: pulse width vs bandwidth, rise time vs −40 dB bandwidth, PRF vs comb spacing, number of pulses vs −3 dB line width, phase noise vs comb contrast.</p>}
        {result ? (
          <div className="mt-2 max-h-56 overflow-auto thin-scroll">
            <table className="w-full text-[0.71875rem]">
              <thead className="sticky top-0 bg-panel">
                <tr className="text-muted">
                  <th className="py-1 text-left font-normal">{SWEEP_PARAMETERS.find((q) => q.id === result.paramId)!.label}</th>
                  <th className="py-1 text-right font-normal">−3 dB (pulse)</th>
                  <th className="py-1 text-right font-normal">99 % BW</th>
                  <th className="py-1 text-right font-normal">σtσf</th>
                  <th className="py-1 text-right font-normal">Peak |X|</th>
                  <th className="py-1 text-right font-normal">{metricInfo.label.split('(')[0]}</th>
                </tr>
              </thead>
              <tbody className="tabular font-mono">
                {result.rows.map((r) => (
                  <tr key={r.value} className="border-t border-line/50">
                    <td className="py-0.5">{fmt(r.value, SWEEP_PARAMETERS.find((q) => q.id === result.paramId)!.unit)}</td>
                    <td className="py-0.5 text-right">{formatEngineering(r.metrics.envBw3, 'Hz')}</td>
                    <td className="py-0.5 text-right">{formatEngineering(r.metrics.bw99, 'Hz')}</td>
                    <td className="py-0.5 text-right">{formatNumber(r.metrics.tbpRms, 3)}</td>
                    <td className="py-0.5 text-right">{formatNumber(r.metrics.peak, 3)}</td>
                    <td className="py-0.5 text-right">{fmt(r.metrics[metric], metricInfo.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
