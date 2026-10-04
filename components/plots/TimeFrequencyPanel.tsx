'use client';

import { useDeferredValue, useMemo } from 'react';
import type { Data, Layout } from 'plotly.js-dist-min';
import type { TfView } from '@/types/signal';
import type { SignalResult } from '@/lib/dsp/signals';
import type { Spectra } from '@/lib/dsp/analyze';
import { computeSTFT, type StftResult } from '@/lib/dsp/stft';
import { computeCWT, type CwtResult } from '@/lib/dsp/wavelet';
import { positiveHalf } from '@/lib/dsp/spectrum';
import { indexRange, minMaxIndices } from '@/lib/dsp/decimate';
import { ANALYSIS_WINDOWS } from '@/lib/dsp/windows';
import { FREQ_UNITS, TIME_UNITS, chooseUnit, formatEngineering, formatNumber } from '@/lib/units/format';
import { allowed, useLab } from '@/components/lab/context';
import { Maximize2, ScanLine } from 'lucide-react';
import { Gate, NumberField, Segmented, SelectField, SmallButton, ToggleField, EngineeringInput } from '@/components/controls/primitives';
import Tex from '@/components/education/Tex';
import Plot from './Plot';
import { axis, baseLayout, type Palette } from './theme';
import { usePalette } from '@/components/layout/ThemeProvider';

const WINDOW_LENGTHS = [8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

function heatmap(C: Palette, times: number[], freqs: number[], z: number[][], ts: number, fs: number, dbRange: number, name: string): Data {
  return {
    type: 'heatmap',
    x: times.map((t) => t / ts),
    y: freqs.map((f) => f / fs),
    z,
    zmin: -dbRange,
    zmax: 0,
    colorscale: C.heatmap,
    name,
    zsmooth: 'best',
    colorbar: { title: { text: 'dB', side: 'right', font: { size: 10, color: C.ink2 } }, thickness: 10, tickfont: { size: 9, color: C.muted }, outlinewidth: 0, len: 0.9 },
    hovertemplate: `t = %{x:.4g}<br>f = %{y:.4g}<br>%{z:.1f} dB<extra>${name}</extra>`,
  } as Data;
}

export default function TimeFrequencyPanel({ signal: liveSignal, spectra }: { signal: SignalResult; spectra: Spectra }) {
  const C = usePalette();
  const lab = useLab();
  // Defer the signal and its settings together so they always belong to the same render.
  const live = useMemo(() => ({ signal: liveSignal, exp: lab.exp }), [liveSignal, lab.exp]);
  const deferred = useDeferredValue(live);
  const signal = deferred.signal;
  const stale = signal !== liveSignal;
  const a = deferred.exp.analysis;
  const view = a.tfView;
  const nyq = signal.fs / 2;
  const r = a.tfRange;
  const fMinView = r.mode === 'manual' ? Math.max(0, Math.min(Math.abs(r.min), Math.abs(r.max)) * (r.min < 0 && r.max > 0 ? 0 : 1)) : 0;
  const fMaxView = r.mode === 'manual' ? Math.min(nyq, Math.max(Math.abs(r.min), Math.abs(r.max))) : nyq;
  const tr = a.time.range;
  const tLo = tr.mode === 'manual' ? tr.min : 0;
  const tHi = tr.mode === 'manual' ? tr.max : signal.observation;
  const tu = chooseUnit((tHi - tLo) / 2, TIME_UNITS);
  const fu = chooseUnit(fMaxView / 2, FREQ_UNITS);
  const needStft = view === 'stft' || view === 'compare';
  const needCwt = view === 'cwt' || view === 'compare';
  const cwtLo = a.cwt.autoRange ? Math.max(fMinView, fMaxView / 100, (4 * signal.fs) / signal.n) : a.cwt.fMinHz;
  const cwtHi = a.cwt.autoRange ? fMaxView : a.cwt.fMaxHz;

  const stft: StftResult | null = useMemo(
    () => (needStft ? computeSTFT(signal.x, signal.fs, { ...a.stft, fMin: fMinView, fMax: fMaxView }) : null),
    [needStft, signal, a.stft, fMinView, fMaxView],
  );
  const cwt: CwtResult | null = useMemo(
    () =>
      needCwt
        ? computeCWT(signal.x, signal.fs, { wavelet: a.cwt.wavelet, omega0: a.cwt.omega0, fMin: cwtLo, fMax: cwtHi, scales: a.cwt.scales })
        : null,
    [needCwt, signal, a.cwt.wavelet, a.cwt.omega0, a.cwt.scales, cwtLo, cwtHi],
  );

  const instTrace = useMemo((): Data | null => {
    if (!signal.carrier.on || !(a.stft.showInstFreq || a.time.showInstFreq)) return null;
    const [i0, i1] = indexRange(signal.t, tLo, tHi);
    const idx = minMaxIndices(signal.instFreq, i0, i1, 1500);
    return {
      type: 'scatter',
      mode: 'lines',
      name: 'f_inst(t) model',
      x: idx.map((i) => signal.t[i] / tu.scale),
      y: idx.map((i) => signal.instFreq[i] / fu.scale),
      line: { color: C.envelope, width: 1.5, dash: 'dash' },
      connectgaps: false,
      hoverinfo: 'skip',
    };
  }, [signal, a.stft.showInstFreq, a.time.showInstFreq, tLo, tHi, tu, fu, C]);

  const tfLayout = (yTitle: string, logY: boolean, yRange: [number, number]): Partial<Layout> =>
    baseLayout(C, {
      showlegend: false,
      uirevision: `${tLo}:${tHi}:${yRange.join(':')}:${logY}`,
      margin: { l: 56, r: 10, t: 8, b: 38 },
      xaxis: axis(C, `t (${tu.label})`, { range: [tLo / tu.scale, tHi / tu.scale], autorange: false }),
      yaxis: axis(C, yTitle, logY ? { type: 'log', range: [Math.log10(Math.max(yRange[0], 1e-30)), Math.log10(Math.max(yRange[1], 1e-30))], autorange: false } : { range: yRange, autorange: false }),
      shapes:
        fMaxView >= nyq * 0.98
          ? [{ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: nyq / fu.scale, y1: nyq / fu.scale, line: { color: C.muted, dash: 'dash', width: 1 } }]
          : [],
    });

  const stftPlot = stft ? (
    <Plot
      data={[heatmap(C, stft.times, stft.freqs, stft.db, tu.scale, fu.scale, a.stft.dbRange, 'STFT'), ...(instTrace ? [instTrace] : [])]}
      layout={tfLayout(`f (${fu.label})`, a.stft.logFrequency, a.stft.logFrequency ? [Math.max(fMinView, stft.binSpacing) / fu.scale, fMaxView / fu.scale] : [fMinView / fu.scale, fMaxView / fu.scale])}
      height={view === 'compare' ? 300 : 320}
      ariaLabel="Spectrogram (STFT magnitude)"
      filename="stft"
    />
  ) : null;

  const cwtPlot = cwt ? (
    <Plot
      data={[heatmap(C, cwt.times, cwt.freqs, cwt.db, tu.scale, fu.scale, a.cwt.dbRange, 'CWT'), ...(instTrace ? [instTrace] : [])]}
      layout={tfLayout(`f (${fu.label}), log scale`, true, [cwtLo / fu.scale, cwtHi / fu.scale])}
      height={view === 'compare' ? 300 : 320}
      ariaLabel="Continuous wavelet transform magnitude"
      filename="cwt"
    />
  ) : null;

  const fftColumn = useMemo(() => {
    if (view !== 'compare') return null;
    const h = positiveHalf(spectra.spectrum);
    const [i0, i1] = indexRange(h.f, fMinView, fMaxView);
    const idx = minMaxIndices(h.mag, i0, i1, 3000);
    let peak = 0;
    for (let i = i0; i <= i1; i++) peak = Math.max(peak, h.mag[i]);
    const data: Data[] = [
      {
        type: 'scatter',
        mode: 'lines',
        x: idx.map((i) => Math.max(20 * Math.log10(Math.max(h.mag[i] / (peak || 1), 1e-15)), -a.stft.dbRange)),
        y: idx.map((i) => h.f[i] / fu.scale),
        line: { color: C.signal, width: 1.25 },
        hovertemplate: `f = %{y:.5g} ${fu.label}<br>%{x:.1f} dB<extra>|X(f)|</extra>`,
      },
    ];
    const layout = baseLayout(C, {
      showlegend: false,
      margin: { l: 56, r: 10, t: 8, b: 38 },
      xaxis: axis(C, '|X(f)| (dB)', { range: [-a.stft.dbRange, 3], autorange: false }),
      yaxis: axis(C, `f (${fu.label})`, { range: [fMinView / fu.scale, fMaxView / fu.scale], autorange: false }),
    });
    return <Plot data={data} layout={layout} height={300} ariaLabel="Fourier magnitude of the whole record" filename="fft-column" />;
  }, [view, spectra, fMinView, fMaxView, fu, a.stft.dbRange, C]);

  const cwtProbe = cwt
    ? [0.1, 0.5, 0.9].map((q) => {
        const i = Math.round(q * (cwt.freqs.length - 1));
        return { f: cwt.freqs[i], st: cwt.sigmaT[i], sf: cwt.sigmaF[i] };
      })
    : [];

  return (
    <section className="border-t border-line bg-panel" aria-label="Time–frequency analysis">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <h2 className="text-[0.75rem] font-semibold uppercase tracking-wider text-ink-2">Time–frequency analysis</h2>
        <Segmented<TfView>
          ariaLabel="Time–frequency view"
          value={view}
          onChange={(v) => lab.update('analysis.tfView', v)}
          options={[
            { value: 'stft', label: 'STFT / spectrogram' },
            { value: 'cwt', label: 'Wavelet (CWT)' },
            { value: 'compare', label: 'Fourier vs STFT vs wavelet' },
          ]}
        />
        <SmallButton onClick={lab.fitTfFrequency} title="Frame the spectral envelope" ariaLabel="Fit time–frequency frequency axis">
          <ScanLine size={12} aria-hidden /> Fit
        </SmallButton>
        <SmallButton onClick={() => lab.update('analysis.tfRange', { mode: 'full', min: 0, max: 0 })} active={r.mode === 'full'} ariaLabel="Show 0 to Nyquist in the time–frequency view">
          <Maximize2 size={12} aria-hidden /> 0…f_N
        </SmallButton>
        {stale ? <span className="text-[0.6875rem] text-muted">updating…</span> : null}
      </div>

      {view === 'compare' ? (
        <div className="grid gap-3 px-4 pb-3 lg:grid-cols-3">
          <figure className="min-w-0">
            <figcaption className="mb-1 text-[0.75rem] text-ink-2">
              <strong className="text-ink">Fourier transform</strong> — What frequencies exist in the complete observation? No temporal localization.
            </figcaption>
            {fftColumn}
          </figure>
          <figure className="min-w-0">
            <figcaption className="mb-1 text-[0.75rem] text-ink-2">
              <strong className="text-ink">STFT</strong> — What frequencies exist around each time? Fixed resolution (window {formatEngineering(stft?.windowDuration ?? 0, 's')}).
            </figcaption>
            {stftPlot}
          </figure>
          <figure className="min-w-0">
            <figcaption className="mb-1 text-[0.75rem] text-ink-2">
              <strong className="text-ink">Wavelet</strong> — What scale/frequency structures occur around each time? Adaptive resolution.
            </figcaption>
            {cwtPlot}
          </figure>
        </div>
      ) : (
        <div className="grid gap-3 px-4 pb-3 lg:grid-cols-[minmax(0,1fr)_18.75rem]">
          <div className="min-w-0">{view === 'stft' ? stftPlot : cwtPlot}</div>
          <aside className="text-[0.75rem]">
            {view === 'stft' && stft ? (
              <div>
                <SelectField
                  label="Window length L"
                  tip="stftWindow"
                  level="advanced"
                  value={a.stft.windowLength}
                  onChange={(v) => lab.update('analysis.stft.windowLength', v)}
                  options={[...(WINDOW_LENGTHS.includes(a.stft.windowLength) ? [] : [{ value: a.stft.windowLength, label: `${a.stft.windowLength}` }]), ...WINDOW_LENGTHS.map((w) => ({ value: w, label: `${w} samples (${formatEngineering(w / signal.fs, 's')})` }))]}
                />
                <Gate level="expert">
                  <NumberField label="Overlap" path="analysis.stft.overlapPct" min={0} max={95} step={1} suffix="%" tip="stftOverlap" />
                  <SelectField label="FFT length per frame" path="analysis.stft.nfft" tip="stftNfft" options={[64, 128, 256, 512, 1024, 2048, 4096, 8192].map((v) => ({ value: v, label: String(v) }))} />
                  <SelectField label="Window" path="analysis.stft.window" options={ANALYSIS_WINDOWS.map((w) => ({ value: w.id, label: w.label }))} />
                  <ToggleField label="Log frequency axis" path="analysis.stft.logFrequency" />
                </Gate>
                <Gate level="advanced">
                  <NumberField label="Dynamic range" path="analysis.stft.dbRange" min={20} max={120} step={5} suffix="dB" tip="dbRange" />
                  <ToggleField label="Overlay instantaneous frequency" path="analysis.stft.showInstFreq" />
                </Gate>
                <div className="mt-2 rounded-sm border border-line bg-surface p-2">
                  <div className="flex justify-between">
                    <span className="text-muted">Window duration T_w = L/fₛ</span>
                    <span className="tabular font-mono">{formatEngineering(stft.windowDuration, 's')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Freq. resolution ≈ ENBW</span>
                    <span className="tabular font-mono">{formatEngineering(stft.enbwHz, 'Hz')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Bin spacing fₛ/N_fft</span>
                    <span className="tabular font-mono">{formatEngineering(stft.binSpacing, 'Hz')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Hop / frames</span>
                    <span className="tabular font-mono">
                      {stft.hop} / {stft.frames}
                    </span>
                  </div>
                  <div className="mt-1.5 border-t border-line pt-1.5 text-ink-2">
                    Long window: <Tex>{'\\Delta f\\downarrow,\\ \\Delta t\\uparrow'}</Tex>
                    <br />
                    Short window: <Tex>{'\\Delta t\\downarrow,\\ \\Delta f\\uparrow'}</Tex>
                    <br />
                    <span className="text-muted">Product T_w·ENBW = {formatNumber(stft.windowDuration * stft.enbwHz, 3)} — cannot be reduced below ~1.</span>
                  </div>
                </div>
              </div>
            ) : null}
            {view === 'cwt' && cwt ? (
              <div>
                <Gate level="expert">
                  <SelectField
                    label="Mother wavelet"
                    path="analysis.cwt.wavelet"
                    tip="wavelet"
                    options={[
                      { value: 'morlet', label: 'Morlet (analytic)' },
                      { value: 'mexican-hat', label: 'Mexican hat (DOG-2, analytic)' },
                    ]}
                  />
                  {a.cwt.wavelet === 'morlet' ? <NumberField label="Central frequency ω₀" path="analysis.cwt.omega0" min={3} max={20} step={0.5} tip="omega0" /> : null}
                  <NumberField label="Number of scales" path="analysis.cwt.scales" min={16} max={160} integer tip="scales" />
                  <ToggleField label="Frequency range follows view axis" path="analysis.cwt.autoRange" tip="cwtRange" />
                  {!a.cwt.autoRange ? (
                    <>
                      <EngineeringInput label="f min" path="analysis.cwt.fMinHz" kind="freq" min={1e3} max={50e9} lock={false} />
                      <EngineeringInput label="f max" path="analysis.cwt.fMaxHz" kind="freq" min={1e3} max={50e9} lock={false} />
                    </>
                  ) : null}
                </Gate>
                <Gate level="advanced">
                  <NumberField label="Dynamic range" path="analysis.cwt.dbRange" min={10} max={100} step={5} suffix="dB" tip="dbRange" />
                </Gate>
                <div className="mt-2 rounded-sm border border-line bg-surface p-2">
                  <table className="w-full text-[0.71875rem]">
                    <thead>
                      <tr className="text-muted">
                        <th className="text-left font-normal">f</th>
                        <th className="text-right font-normal">σ_t</th>
                        <th className="text-right font-normal">σ_f</th>
                        <th className="text-right font-normal">σ_tσ_f</th>
                      </tr>
                    </thead>
                    <tbody className="tabular font-mono">
                      {cwtProbe.map((p) => (
                        <tr key={p.f}>
                          <td>{formatEngineering(p.f, 'Hz')}</td>
                          <td className="text-right">{formatEngineering(p.st, 's')}</td>
                          <td className="text-right">{formatEngineering(p.sf, 'Hz')}</td>
                          <td className="text-right">{formatNumber(p.st * p.sf, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1.5 border-t border-line pt-1.5 text-ink-2">
                    A wavelet does <strong className="text-ink">not</strong> violate the uncertainty principle (σ_tσ_f ≥ 1/4π ≈ 0.0796). It trades resolution adaptively: high frequencies → short windows;
                    low frequencies → long windows.
                  </p>
                </div>
              </div>
            ) : null}
            {!allowed(lab.mode, 'advanced') ? <p className="mt-2 text-[0.6875rem] text-muted">Switch to Advanced or Expert mode for window and wavelet parameters.</p> : null}
          </aside>
        </div>
      )}
    </section>
  );
}
