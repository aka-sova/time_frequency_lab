'use client';

import { useDeferredValue, useMemo } from 'react';
import type { Data } from 'plotly.js-dist-min';
import type { BandSet, Measurements } from '@/lib/dsp/analyze';
import { analyzeLight } from '@/lib/dsp/analyze';
import type { Band } from '@/lib/dsp/bandwidth';
import type { SignalResult } from '@/lib/dsp/signals';
import { formatEngineering, formatNumber, formatDb } from '@/lib/units/format';
import { setPath } from '@/lib/state/path';
import { useLab } from '@/components/lab/context';
import Tex from '@/components/education/Tex';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';

function bandText(b: Band): string {
  if (!b.valid) return b.note ? `— (${b.note})` : '—';
  return formatEngineering(b.width, 'Hz');
}

function edgesText(b: Band): string {
  if (!b.valid) return '';
  return `${formatEngineering(b.low, 'Hz', 4)} … ${formatEngineering(b.high, 'Hz', 4)}`;
}

const ROWS: { key: keyof Omit<BandSet, 'rms' | 'peakFrequency' | 'peakMagnitude'>; label: string; def: string }[] = [
  { key: 'bw3', label: '−3 dB', def: '|X| ≥ |X|max/√2, contiguous around the peak' },
  { key: 'bw6', label: '−6 dB', def: '|X| ≥ |X|max/2' },
  { key: 'bw10', label: '−10 dB', def: '|X| ≥ |X|max·10^(−10/20)' },
  { key: 'bw40', label: '−40 dB', def: 'Tail extent (rise-time sensitive)' },
  { key: 'obw90', label: '90 % occupied', def: 'Band containing 90 % of the energy (equal tails)' },
  { key: 'obw99', label: '99 % occupied', def: 'Band containing 99 % of the energy (equal tails)' },
  { key: 'nullToNull', label: 'Null-to-null', def: 'Main lobe between first nulls (if any)' },
];

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-sm border border-line bg-surface ${className}`}>
      <h3 className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">{title}</h3>
      <div className="p-3 text-[12px]">{children}</div>
    </div>
  );
}

function Row({ k, v, sub }: { k: React.ReactNode; v: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="py-1 pr-3 text-ink-2">{k}</td>
      <td className="tabular py-1 text-right font-mono text-ink">{v}</td>
      {sub !== undefined ? <td className="tabular py-1 pl-3 text-right font-mono text-muted">{sub}</td> : null}
    </tr>
  );
}

function PulseWidthMiniChart() {
  const C = usePalette();
  const lab = useLab();
  const exp = useDeferredValue(lab.exp);
  const res = useMemo(() => {
    if (!exp.signal.pulse.enabled) return null;
    const tau0 = exp.signal.pulse.widthSec;
    const light = setPath(setPath(exp, 'analysis.spectrum.zeroPad', Math.max(2, exp.analysis.spectrum.zeroPad)), 'signal.repetition.enabled', false);
    const pts = [0.5, 0.71, 1, 1.41, 2].map((k) => {
      const e = setPath(light, 'signal.pulse.widthSec', tau0 * k);
      const m = analyzeLight(e).measurements;
      return { tau: tau0 * k, bw: m.full.bw3.valid ? m.full.bw3.width : NaN, rms: m.uncertainty.sigmaF };
    });
    return { pts, tau0 };
  }, [exp]);
  if (!res) return <p className="text-muted">Enable the pulse envelope to compare nearby pulse widths.</p>;
  const ref = res.pts[2];
  const c = ref.bw * ref.tau;
  const xs = res.pts.map((p) => p.tau * 1e9);
  const data: Data[] = [
    { type: 'scatter', mode: 'lines', name: `c/τ, c = ${formatNumber(c, 3)}`, x: Array.from({ length: 40 }, (_, i) => xs[0] + ((xs[4] - xs[0]) * i) / 39), y: Array.from({ length: 40 }, (_, i) => c / ((xs[0] + ((xs[4] - xs[0]) * i) / 39) * 1e-9) / 1e6), line: { color: C.muted, dash: 'dash', width: 1 } },
    {
      type: 'scatter',
      mode: 'markers',
      name: 'Measured −3 dB BW',
      x: xs,
      y: res.pts.map((p) => p.bw / 1e6),
      marker: { color: res.pts.map((_, i) => (i === 2 ? C.envelope : C.signal)), size: 9, line: { color: C.surface, width: 2 } },
      hovertemplate: 'τ = %{x:.4g} ns<br>B = %{y:.4g} MHz<extra></extra>',
    },
  ];
  return (
    <>
      <Plot
        data={data}
        layout={baseLayout(C, { margin: { l: 52, r: 10, t: 6, b: 36 }, xaxis: axis(C, 'τ (ns)', { type: 'log' }), yaxis: axis(C, 'B₋₃dB (MHz)', { type: 'log' }), legend: { orientation: 'h', y: -0.35, x: 0, font: { size: 10, color: C.ink2 } } })}
        height={210}
        ariaLabel="Pulse width versus bandwidth for nearby pulse widths"
        filename="tau-vs-bandwidth"
      />
      <p className="mt-1 text-muted">
        Five pulse widths around the current τ (orange), all else fixed. Points on the dashed <Tex>{'B = c/\\tau'}</Tex> line confirm <Tex>{'B \\propto 1/\\tau'}</Tex>.
      </p>
    </>
  );
}

export default function MeasurementsPanel({ signal, m }: { signal: SignalResult; m: Measurements }) {
  const { exp } = useLab();
  const s = exp.signal;
  const train = m.single !== null;
  const g = m.gaussianReference;
  const kindNote = m.kind === 'baseband' ? 'baseband convention (from DC)' : 'bandpass convention (between edges)';
  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      <Card title="Bandwidth — several definitions" className="lg:col-span-2 2xl:col-span-1">
        <p className="mb-2 text-muted">
          Measured on the displayed spectrum ({exp.analysis.spectrum.window} window, {exp.analysis.spectrum.zeroPad}× zero padding), positive frequencies, {kindNote}. Bandwidth has no single universal
          definition.
        </p>
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-muted">
              <th className="text-left font-normal">Definition</th>
              {train ? <th className="text-right font-normal">Single-pulse envelope</th> : null}
              <th className="text-right font-normal">{train ? 'Full train (lines)' : 'Value'}</th>
              {!train ? <th className="text-right font-normal">Edges</th> : null}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key} className="border-b border-line/60 last:border-0" title={r.def}>
                <td className="py-1 pr-2 text-ink-2">{r.label}</td>
                {train ? <td className="tabular py-1 text-right font-mono text-ink">{bandText(m.single![r.key])}</td> : null}
                <td className="tabular py-1 text-right font-mono text-ink">{bandText(m.full[r.key])}</td>
                {!train ? <td className="tabular py-1 pl-2 text-right font-mono text-[11px] text-muted">{edgesText(m.full[r.key])}</td> : null}
              </tr>
            ))}
            <tr className="border-b border-line/60" title="σ_f from |X(f)|²">
              <td className="py-1 pr-2 text-ink-2">RMS σ_f</td>
              {train ? <td className="tabular py-1 text-right font-mono text-ink">{formatEngineering(m.single!.rms.sigma, 'Hz')}</td> : null}
              <td className="tabular py-1 text-right font-mono text-ink">{formatEngineering(m.full.rms.sigma, 'Hz')}</td>
              {!train ? <td className="tabular py-1 pl-2 text-right font-mono text-[11px] text-muted">{m.kind === 'bandpass' ? `centroid ${formatEngineering(m.full.rms.centroid, 'Hz', 4)}` : 'about 0 Hz'}</td> : null}
            </tr>
          </tbody>
        </table>
        {train ? (
          <p className="mt-2 text-muted">
            The single-pulse column is set by pulse shape/duration; the train column’s −3 dB value is the contiguous band around the strongest line (for a coherent train, a line of width ≈ 0.886·PRF/N ={' '}
            {formatEngineering((0.886 * s.repetition.prfHz) / signal.pulseCount, 'Hz')}).
          </p>
        ) : null}
        {s.pulse.enabled && s.pulse.envelope === 'rect' && !s.pulse.edgesEnabled ? (
          <p className="mt-1 text-muted">Ideal rect: the RMS bandwidth diverges theoretically (|X|²f² ~ const); the value shown is limited by fₛ.</p>
        ) : null}
      </Card>

      <Card title={`Time-domain measurements${train ? ' (single reference pulse)' : ''}`}>
        <table className="w-full">
          <tbody>
            <Row k="Peak amplitude |x|max" v={formatNumber(m.time.peak, 4)} />
            <Row k="RMS amplitude (record)" v={formatNumber(m.time.rmsAmplitude, 4)} />
            {s.pulse.enabled ? (
              <>
                <Row k="Nominal τ (setting)" v={formatEngineering(s.pulse.widthSec, 's')} />
                <Row k="FWHM (envelope)" v={m.time.fwhm.valid ? formatEngineering(m.time.fwhm.width, 's') : '—'} />
                <Row k="RMS duration σ_t" v={formatEngineering(m.time.sigmaT, 's')} />
                <Row k="Rise time 10–90 %" v={formatEngineering(m.time.rise, 's')} />
                <Row k="Fall time 90–10 %" v={formatEngineering(m.time.fall, 's')} />
                {train ? <Row k="Duty cycle FWHM·PRF" v={`${formatNumber(m.time.duty * 100, 3)} %`} /> : null}
              </>
            ) : (
              <Row k="Duration" v="continuous (limited by observation)" />
            )}
            {signal.carrier.on && s.pulse.enabled ? (
              <>
                <Row k={<Tex>{'N_{\\text{cycles}} \\approx f_0\\,\\tau_{\\text{FWHM}}'}</Tex>} v={formatNumber(m.time.cycles, 4)} />
                <Row k="Fractional BW B₋₃dB / f₀" v={`${formatNumber(m.fractionalBandwidth * 100, 3)} %`} sub={Number.isFinite(m.time.cycles) ? `≈ k/N_cyc` : undefined} />
              </>
            ) : null}
            {Number.isFinite(m.sqnrDb) ? <Row k="SQNR (quantization)" v={formatDb(m.sqnrDb)} sub={`ideal ≈ ${formatDb(6.02 * s.sampling.bits + 1.76)} (sine)`} /> : null}
            {Number.isFinite(m.snrDb) ? <Row k="SNR (additive noise)" v={formatDb(m.snrDb)} /> : null}
          </tbody>
        </table>
        {signal.carrier.on && s.pulse.enabled ? (
          <p className="mt-2 text-muted">Fewer carrier cycles ⇒ larger fractional bandwidth: B/f₀ ≈ const/N_cycles. This is why few-cycle (UWB-like) transients are broadband.</p>
        ) : null}
      </Card>

      <Card title="Time–bandwidth product & uncertainty">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-muted">
              <th className="text-left font-normal">Definition</th>
              <th className="text-right font-normal">Measured</th>
              <th className="text-right font-normal">Gaussian</th>
            </tr>
          </thead>
          <tbody>
            <Row k="τ_FWHM · B₋₃dB" v={formatNumber(m.tbp.fwhm3dB, 4)} sub={formatNumber(g.fwhm3dB, 4)} />
            <Row k="τ_FWHM · B₉₉%" v={formatNumber(m.tbp.fwhm99, 4)} sub={formatNumber(g.fwhm99, 4)} />
            <Row k={<Tex>{'\\sigma_t\\,\\sigma_f'}</Tex>} v={formatNumber(m.uncertainty.product, 4)} sub={formatNumber(g.rms, 4)} />
          </tbody>
        </table>
        {m.uncertainty.valid ? (
        <div className="mt-3">
            <div className="flex justify-between text-[11px] text-muted">
              <span>σ_t = {formatEngineering(m.uncertainty.sigmaT, 's')}</span>
              <span>σ_f = {formatEngineering(m.uncertainty.sigmaF, 'Hz')}</span>
            </div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-sm bg-line" role="meter" aria-valuemin={1} aria-valuemax={5} aria-valuenow={m.uncertainty.normalized} aria-label="σtσf relative to the minimum">
              <div className="h-full bg-s1" style={{ width: `${Math.min(100, (100 * Math.log(Math.max(m.uncertainty.normalized, 1))) / Math.log(5) + 2)}%` }} />
            </div>
            <p className="mt-1 text-[11.5px] text-ink-2">
              <Tex>{'\\sigma_t\\sigma_f \\ge \\tfrac{1}{4\\pi}'}</Tex> — measured {formatNumber(m.uncertainty.normalized, 4)}× the minimum
              {m.uncertainty.normalized < 0.97
              ? ' — below the bound: the sampled record no longer represents the waveform (undersampling/aliasing or truncation), so this value is not physical'
              : m.uncertainty.normalized < 1.02
                ? ' (Gaussian: minimum uncertainty reached)'
                : ''}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-muted">A continuous wave has no finite duration: σ_t is set by the observation window and σ_f by the DFT bin spacing, so σ_tσ_f says nothing about the waveform.</p>
        )}
        <p className="mt-2 text-muted">
          Constants depend on the Fourier convention (here X(f) = ∫x e^(−j2πft)dt), the bandwidth definition ({m.kind}: {m.kind === 'baseband' ? 'one-sided from DC' : 'between edges'}), and the pulse shape. No
          single universal TBP constant exists. RMS values use |x|² (baseband) or |z|² of the analytic signal (bandpass), from the {m.uncertainty.source}.
        </p>
      </Card>

      <Card title="FFT resolution vs physical bandwidth">
        <table className="w-full">
          <tbody>
            <Row k={<Tex>{'\\Delta f = f_s/N'}</Tex>} v={formatEngineering(m.recordBinSpacing, 'Hz')} />
            <Row k={<Tex>{'1/T_{\\text{obs}}'}</Tex>} v={formatEngineering(1 / m.segmentDuration, 'Hz')} sub={m.segmentDuration < m.observation * 0.999 ? 'selection' : undefined} />
            <Row k="Zero-padded bin spacing" v={formatEngineering(m.binSpacing, 'Hz')} />
            <Row k="Signal −3 dB bandwidth" v={bandText((m.single ?? m.full).bw3)} />
            <Row k="Nyquist f_N = fₛ/2" v={formatEngineering(m.nyquist, 'Hz', 4)} />
          </tbody>
        </table>
        <p className="mt-2 text-muted">
          <strong className="text-ink-2">FFT bin spacing</strong> is a property of the measurement (fₛ and N); <strong className="text-ink-2">physical bandwidth</strong> is a property of the waveform. Zero padding
          shrinks the bin spacing without adding information.
        </p>
      </Card>

      {train && m.comb ? (
        <Card title="Spectral comb (pulse train)">
          <table className="w-full">
            <tbody>
              <Row k="PRF (setting)" v={formatEngineering(s.repetition.prfHz, 'Hz')} />
              <Row k="Measured line spacing" v={Number.isFinite(m.comb.spacing) ? formatEngineering(m.comb.spacing, 'Hz') : '—'} />
              <Row k="Lines within 20 dB" v={String(m.comb.lineCount)} />
              <Row k="Line-to-valley contrast" v={formatDb(m.comb.contrastDb)} />
              <Row k="−3 dB line width (non-DC)" v={m.lineWidth ? bandText(m.lineWidth) : '—'} sub={`0.886/T_burst = ${formatEngineering((0.886 * s.repetition.prfHz) / signal.pulseCount, 'Hz')}`} />
            </tbody>
          </table>
          <p className="mt-2 text-muted">Coherence loss lowers the contrast (energy leaves the lines); a longer train narrows the lines. Neither changes the single-pulse envelope.</p>
        </Card>
      ) : null}

      <Card title="Pulse width vs bandwidth (nearby widths)">
        <PulseWidthMiniChart />
      </Card>
    </div>
  );
}
