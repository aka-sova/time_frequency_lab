'use client';

import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js-dist-min';
import { synthesize, type SynthesisTarget } from '@/lib/dsp/synthesis';
import { Segmented } from '@/components/controls/primitives';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';
import { formatNumber } from '@/lib/units/format';

const COUNTS = [1, 3, 5, 10, 20, 50, 100];

/** Fourier synthesis: a localized pulse emerges from many in-phase components. */
export default function SynthesisPanel() {
  const C = usePalette();
  const [target, setTarget] = useState<SynthesisTarget>('rect');
  const [width, setWidth] = useState(0.1);
  const [k, setK] = useState(10);
  const [showComp, setShowComp] = useState(true);
  const [random, setRandom] = useState(false);
  const r = useMemo(() => synthesize(target, width, k, { showComponents: showComp ? Math.min(k, 8) : 0, randomPhase: random, seed: 3 }), [target, width, k, showComp, random]);

  const data: Data[] = [];
  r.components.forEach((c, i) =>
    data.push({
      type: 'scatter',
      mode: 'lines',
      x: r.t,
      y: c.map((v) => v + r.coefficients[0]),
      name: i === 0 ? `Components k = 1…${r.components.length} (offset by c₀)` : `k = ${i + 1}`,
      showlegend: i === 0,
      legendgroup: 'comp',
      line: { color: C.component, width: 1 },
      hoverinfo: 'skip',
    }),
  );
  data.push({ type: 'scatter', mode: 'lines', x: r.t, y: r.target, name: 'Target pulse', line: { color: C.envelope, width: 1.5, dash: 'dash' }, hoverinfo: 'skip' });
  data.push({ type: 'scatter', mode: 'lines', x: r.t, y: r.sum, name: `Sum of DC + ${k} harmonic${k > 1 ? 's' : ''}`, line: { color: C.signal, width: 2 }, hovertemplate: 't/T = %{x:.3f}<br>sum = %{y:.3f}<extra></extra>' });

  const spec: Data[] = [
    {
      type: 'bar',
      x: r.coefficients.map((_, i) => i),
      y: r.coefficients.map((c) => Math.abs(c)),
      marker: { color: C.signal },
      name: '|c_k|',
      hovertemplate: 'k = %{x}<br>|c_k| = %{y:.4f}<extra></extra>',
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[18.75rem_minmax(0,1fr)]">
      <div className="space-y-2 text-[0.75rem]">
        <p className="text-ink-2">
          A periodic pulse (period T) rebuilt from its Fourier-series components. Near the pulse every component is in phase and they add constructively; elsewhere they cancel. The narrower the pulse, the
          more components are needed.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-ink-2">Target</span>
          <Segmented
            ariaLabel="Target pulse"
            value={target}
            onChange={setTarget}
            options={[
              { value: 'rect', label: 'Rectangular' },
              { value: 'gaussian', label: 'Gaussian' },
            ]}
            size="xs"
          />
        </div>
        <label className="block">
          <span className="text-ink-2">
            Pulse width τ/T = <span className="tabular font-mono text-ink">{formatNumber(width, 3)}</span>
          </span>
          <input type="range" min={0.02} max={0.5} step={0.01} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="w-full" aria-label="Pulse width relative to period" />
        </label>
        <div>
          <span className="text-ink-2">Number of frequency components</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {COUNTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setK(c)}
                aria-pressed={k === c}
                className={`rounded-sm border px-2 py-0.5 text-[0.71875rem] ${k === c ? 'border-accent bg-accent/15 text-ink' : 'border-line-strong text-ink-2'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={showComp} onChange={() => setShowComp(!showComp)} className="h-3 w-3 accent-accent" /> Show individual components (first 8)
        </label>
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={random} onChange={() => setRandom(!random)} className="h-3 w-3 accent-accent" /> Randomize component phases
        </label>
        <div className="rounded-sm border border-line bg-surface p-2 text-ink-2">
          {random ? (
            <>Same magnitudes |c_k|, random phases: the energy is still there, but nothing adds up coherently — no localized pulse. Temporal localization needs both spectral spread <em>and</em> phase alignment.</>
          ) : (
            <>Temporal localization requires spectral spread: a pulse of width τ needs components up to ≈ several/τ. Fewer components → ringing and a wider, smeared pulse.</>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <Plot
          data={data}
          layout={baseLayout(C, { margin: { l: 50, r: 12, t: 30, b: 40 }, xaxis: axis(C, 't / T'), yaxis: axis(C, 'amplitude') })}
          height={290}
          ariaLabel="Fourier synthesis of a pulse"
          filename="fourier-synthesis"
        />
        <Plot
          data={spec}
          layout={baseLayout(C, { showlegend: false, margin: { l: 50, r: 12, t: 6, b: 40 }, xaxis: axis(C, 'harmonic k (frequency k/T)'), yaxis: axis(C, '|c_k|'), bargap: 0.25 })}
          height={160}
          ariaLabel="Fourier series coefficient magnitudes"
          filename="fourier-coefficients"
        />
      </div>
    </div>
  );
}
