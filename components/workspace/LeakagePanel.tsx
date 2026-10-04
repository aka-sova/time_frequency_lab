'use client';

import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js-dist-min';
import type { AnalysisWindow } from '@/types/signal';
import { measureWindow, toneSpectrum } from '@/lib/dsp/leakage';
import { ANALYSIS_WINDOWS } from '@/lib/dsp/windows';
import { formatNumber } from '@/lib/units/format';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout, type Palette } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';
import Tex from '@/components/education/Tex';

const COMPARE: AnalysisWindow[] = ['rect', 'hann', 'hamming', 'blackman'];
const windowColors = (C: Palette): Record<string, string> => ({ rect: C.signal, hann: C.envelope, hamming: C.reference, blackman: C.extra, 'blackman-harris': C.compare, flattop: C.cursor });

export default function LeakagePanel() {
  const C = usePalette();
  const COLORS = windowColors(C);
  const [n, setN] = useState(64);
  const [bin, setBin] = useState(10.5);
  const [pad, setPad] = useState(16);
  const [selected, setSelected] = useState<AnalysisWindow[]>(COMPARE);
  const [showRaw, setShowRaw] = useState(true);

  const traces = useMemo(() => selected.map((w) => toneSpectrum(n, bin, pad, w, Math.min(n / 2, bin + 24))), [selected, n, bin, pad]);
  const metrics = useMemo(() => ANALYSIS_WINDOWS.map((w) => measureWindow(w.id)), []);

  const data: Data[] = [];
  for (const t of traces) {
    const label = ANALYSIS_WINDOWS.find((w) => w.id === t.window)!.label;
    data.push({
      type: 'scatter',
      mode: 'lines',
      name: `${label} (zero-padded DTFT)`,
      x: t.bins,
      y: t.db,
      line: { color: COLORS[t.window], width: 1.5 },
      legendgroup: t.window,
      hovertemplate: `bin %{x:.3f}<br>%{y:.1f} dB<extra>${label}</extra>`,
    });
    if (showRaw)
      data.push({
        type: 'scatter',
        mode: 'markers',
        name: `${label}: N-point DFT bins`,
        x: t.rawBins,
        y: t.rawDb,
        marker: { color: COLORS[t.window], size: 7, line: { color: C.surface, width: 1.5 } },
        legendgroup: t.window,
        showlegend: false,
        hovertemplate: `DFT bin %{x}<br>%{y:.1f} dB<extra>${label}</extra>`,
      });
  }

  const frac = bin - Math.floor(bin);
  return (
    <div className="grid gap-4 lg:grid-cols-[18.75rem_minmax(0,1fr)]">
      <div className="space-y-2 text-[0.75rem]">
        <p className="text-ink-2">
          A single tone observed for N samples. Its frequency is given in DFT bins (cycles per record). Integer bins: an exact number of periods fits the record and the rectangular window shows no leakage.
          Fractional bins: the periodic extension is discontinuous and energy leaks into all bins.
        </p>
        <label className="block">
          <span className="text-ink-2">
            Tone frequency: <span className="tabular font-mono text-ink">{bin.toFixed(2)}</span> bins (offset {frac.toFixed(2)})
          </span>
          <input type="range" min={4} max={20} step={0.05} value={bin} onChange={(e) => setBin(Number(e.target.value))} className="w-full" aria-label="Tone frequency in bins" />
        </label>
        <div className="flex gap-1">
          <button type="button" className="rounded-sm border border-line-strong px-1.5 py-0.5 text-[0.6875rem] text-ink-2" onClick={() => setBin(Math.round(bin))}>
            On a bin
          </button>
          <button type="button" className="rounded-sm border border-line-strong px-1.5 py-0.5 text-[0.6875rem] text-ink-2" onClick={() => setBin(Math.floor(bin) + 0.5)}>
            Between bins
          </button>
        </div>
        <label className="block">
          <span className="text-ink-2">Observation length N = {n} samples</span>
          <select value={n} onChange={(e) => setN(Number(e.target.value))} className="mt-0.5 w-full rounded-sm border border-line-strong bg-surface px-1.5 py-1">
            {[32, 64, 128, 256].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-ink-2">FFT length (zero padding) = {pad}× N</span>
          <select value={pad} onChange={(e) => setPad(Number(e.target.value))} className="mt-0.5 w-full rounded-sm border border-line-strong bg-surface px-1.5 py-1">
            {[1, 2, 4, 8, 16, 32].map((v) => (
              <option key={v} value={v}>
                {v}× ({v * n} points)
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-ink-2">Windows</legend>
          <div className="mt-0.5 grid grid-cols-2 gap-1">
            {ANALYSIS_WINDOWS.map((w) => (
              <label key={w.id} className="flex items-center gap-1.5 text-ink-2">
                <input
                  type="checkbox"
                  checked={selected.includes(w.id)}
                  onChange={() => setSelected(selected.includes(w.id) ? selected.filter((x) => x !== w.id) : [...selected, w.id])}
                  className="h-3 w-3 accent-accent"
                />
                <span className="inline-block h-0.5 w-3" style={{ background: COLORS[w.id] }} aria-hidden />
                {w.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-1.5 text-ink-2">
          <input type="checkbox" checked={showRaw} onChange={() => setShowRaw(!showRaw)} className="h-3 w-3 accent-accent" /> Show N-point DFT bins
        </label>
        <div className="rounded-sm border border-line bg-surface p-2 text-ink-2">
          Narrow main lobe ↔ larger sidelobes.
          <br />
          Lower sidelobes ↔ wider main lobe.
          <br />
          <span className="text-muted">
            Zero padding traces the continuous DTFT between the DFT bins — it interpolates, but resolution stays ≈ <Tex>{'1/T_{\\text{obs}}'}</Tex>.
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <Plot
          data={data}
          layout={baseLayout(C, {
            margin: { l: 56, r: 12, t: 30, b: 40 },
            xaxis: axis(C, 'frequency (DFT bins = cycles per record)', { range: [Math.max(0, bin - 12), bin + 12], autorange: false }),
            yaxis: axis(C, 'dB re bin-centered tone', { range: [-120, 5], autorange: false }),
          })}
          height={330}
          ariaLabel="Spectral leakage comparison of windows"
          filename="leakage"
        />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[0.71875rem]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-1 text-left font-normal">Window</th>
                <th className="py-1 text-right font-normal">Main lobe (null-to-null)</th>
                <th className="py-1 text-right font-normal">−3 dB width</th>
                <th className="py-1 text-right font-normal">Highest sidelobe</th>
                <th className="py-1 text-right font-normal">ENBW</th>
                <th className="py-1 text-right font-normal">Coherent gain</th>
                <th className="py-1 text-right font-normal">Scalloping loss</th>
              </tr>
            </thead>
            <tbody className="tabular font-mono">
              {metrics.map((m) => (
                <tr key={m.window} className="border-b border-line/50">
                  <td className="py-1 font-sans text-ink-2">{ANALYSIS_WINDOWS.find((w) => w.id === m.window)!.label}</td>
                  <td className="py-1 text-right">{formatNumber(m.mainLobeBins, 3)} bins</td>
                  <td className="py-1 text-right">{formatNumber(m.halfPowerBins, 3)} bins</td>
                  <td className="py-1 text-right">{m.peakSidelobeDb.toFixed(1)} dB</td>
                  <td className="py-1 text-right">{formatNumber(m.enbwBins, 3)} bins</td>
                  <td className="py-1 text-right">{formatNumber(m.coherentGain, 3)}</td>
                  <td className="py-1 text-right">{m.scallopLossDb.toFixed(2)} dB</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[0.6875rem] text-muted">Measured numerically from each window’s zero-padded DFT (N = 64, periodic windows).</p>
        </div>
      </div>
    </div>
  );
}
