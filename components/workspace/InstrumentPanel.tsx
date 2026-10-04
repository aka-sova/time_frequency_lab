'use client';

import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js-dist-min';
import type { SignalResult } from '@/lib/dsp/signals';
import { isTrain } from '@/lib/dsp/signals';
import { activeRange, simulateInstrument } from '@/lib/dsp/instrument';
import { combineRise, extractRise, powerUncertainty, riseFromBandwidth } from '@/lib/dsp/budget';
import { minMaxIndices, pick } from '@/lib/dsp/decimate';
import { energyStats, powerContext } from '@/lib/dsp/power';
import { amplitudeUnitLabel, formatEngineering, formatNumber } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import { EngineeringInput, NumberField, ToggleField } from '@/components/controls/primitives';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';
import { Card, Row, Warn } from './parts';

function Cell({ v, unit }: { v: number; unit: 's' | 'amp' }) {
  return <>{Number.isFinite(v) ? (unit === 's' ? formatEngineering(v, 's') : formatNumber(v, 4)) : '—'}</>;
}

const TD = 'tabular py-1 text-right font-mono text-ink';

export default function InstrumentPanel({ signal }: { signal: SignalResult }) {
  const C = usePalette();
  const { exp } = useLab();
  const s = exp.signal;
  const i = exp.analysis.instrument;
  const train = isTrain(s) && signal.pulseCount > 1;
  const src = train ? signal.singlePulse : signal.xIdeal;
  const bandpass = s.carrier.enabled || s.chirp.enabled;
  const unit = amplitudeUnitLabel(s.amplitudeUnit);

  const sim = useMemo(() => simulateInstrument(src, signal.fs, i, { bandpass }), [src, signal.fs, i, bandpass]);

  const plot = useMemo(() => {
    const [a, b] = activeRange(src, 1e-4);
    const pre = Math.round(2 * sim.tau * signal.fs);
    const post = Math.round(7 * sim.tau * signal.fs + 2 * (1 / i.sampleRateHz) * signal.fs);
    const i0 = Math.max(0, a - pre - 8);
    const i1 = Math.min(src.length - 1, b + post + 8);
    const idx = minMaxIndices(src, i0, i1, 2000);
    const tx = idx.map((k) => (k / signal.fs) * 1e9);
    const data: Data[] = [
      { type: 'scatter', mode: 'lines', name: 'True waveform', x: tx, y: pick(src, idx), line: { color: C.reference, width: 1.5 }, hovertemplate: 't = %{x:.4g} ns<br>%{y:.4g}<extra>true</extra>' },
    ];
    if (i.triggerJitterRmsSec > 0) data.push({ type: 'scatter', mode: 'lines', name: 'Bandwidth-limited', x: tx, y: pick(sim.filtered, idx), line: { color: C.signal, width: 1, dash: 'dot' }, hoverinfo: 'skip' });
    data.push({
      type: 'scatter',
      mode: 'lines',
      name: i.triggerJitterRmsSec > 0 ? 'Displayed (jitter-averaged)' : 'Bandwidth-limited',
      x: tx,
      y: pick(sim.displayed, idx),
      line: { color: C.signal, width: 2 },
      hovertemplate: 't = %{x:.4g} ns<br>%{y:.4g}<extra>displayed</extra>',
    });
    const lo = tx[0];
    const hi = tx[tx.length - 1];
    const sx: number[] = [];
    const sy: number[] = [];
    for (let k = 0; k < sim.sampleT.length; k++) {
      const tk = sim.sampleT[k] * 1e9;
      if (tk >= lo && tk <= hi) {
        sx.push(tk);
        sy.push(sim.sampleV[k]);
      }
    }
    data.push({
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Scope samples',
      x: sx,
      y: sy,
      line: { color: C.envelope, width: 1 },
      marker: { color: C.envelope, size: 7, line: { color: C.surface, width: 1.5 } },
      hovertemplate: 'sample at %{x:.4g} ns<br>%{y:.4g}<extra></extra>',
    });
    if (Number.isFinite(sim.clipLevel)) data.push({ type: 'scatter', mode: 'lines', name: 'ADC clip', x: [lo, hi], y: [sim.clipLevel, sim.clipLevel], line: { color: C.cursor, width: 1, dash: 'dash' }, hoverinfo: 'skip' });
    return data;
  }, [src, sim, signal.fs, i, C]);

  const m = sim.metrics;
  const warnings: string[] = [];
  if (i.bandwidthHz > i.sampleRateHz / 2) warnings.push('Bandwidth is above half the scope sample rate: the analogue chain passes content the sampler cannot represent (aliasing).');
  if (Number.isFinite(m.samplesAcrossFwhm) && m.samplesAcrossFwhm < 4) warnings.push(`Only ${formatNumber(m.samplesAcrossFwhm, 2)} samples across the true FWHM: peak and width read from samples are unreliable.`);
  if (i.triggerJitterRmsSec > 0 && Number.isFinite(m.fwhmTrue) && i.triggerJitterRmsSec > 0.3 * m.fwhmTrue) warnings.push('Trigger jitter is comparable to the pulse width: averaging without time alignment broadens and lowers the pulse.');
  if (bandpass && s.carrier.enabled && s.carrier.frequencyHz > i.bandwidthHz) warnings.push('The carrier is above the instrument bandwidth, so the RF content itself is attenuated.');
  if (signal.fs < 8 * i.bandwidthHz) warnings.push('The lab sample rate is below 8× the instrument bandwidth: the filter output is less accurate. Raise the sample rate in the Sampling section.');

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card title="Instrument settings">
        <EngineeringInput
          label="Analogue bandwidth BW"
          path="analysis.instrument.bandwidthHz"
          kind="freq"
          min={1e8}
          max={5e10}
          hardMin={1e6}
          hardMax={1e12}
          hint={
            <>
              Single pole: τ = {formatEngineering(sim.tau, 's')}, t<sub>r</sub> = {formatEngineering(sim.riseTimeFilter, 's')} (0.35/BW)
            </>
          }
        />
        <EngineeringInput
          label="Sample rate f_s,scope"
          path="analysis.instrument.sampleRateHz"
          kind="freq"
          min={1e8}
          max={1e11}
          hardMin={1e6}
          hardMax={1e13}
          hint={<>Sample period {formatEngineering(1 / i.sampleRateHz, 's')}</>}
        />
        <NumberField label="Sample phase" path="analysis.instrument.samplePhasePct" min={0} max={100} step={1} suffix="% of period" />
        <EngineeringInput label="Trigger jitter σ_j (RMS)" path="analysis.instrument.triggerJitterRmsSec" kind="time" min={1e-12} max={1e-9} hardMin={0} hardMax={1e-6} hint={<>Gaussian; 0 = off</>} />
        <ToggleField label="ADC clipping" path="analysis.instrument.clipEnabled" />
        <NumberField label="ADC full scale ÷ true peak" path="analysis.instrument.clipRatio" min={0.1} max={3} step={0.05} disabled={!i.clipEnabled} />
        <p className="mt-2 text-muted">
          Model: jitter averaging → single-pole low-pass → sampling → clip. Jitter averaging is the <em>expected</em> trace of an infinite average; noise, quantisation and a real sensor response are not modelled. Real instruments need not be single-pole.
        </p>
      </Card>

      <div className="min-w-0 space-y-3">
        <Card title={`True vs displayed${train ? ' (single pulse of the train)' : ''}`}>
          <Plot
            data={plot}
            layout={baseLayout(C, {
              margin: { l: 56, r: 10, t: 6, b: 36 },
              xaxis: axis(C, 't (ns)'),
              yaxis: axis(C, `amplitude (${unit})`),
              legend: { orientation: 'h', y: -0.28, x: 0, font: { size: 10, color: C.ink2 } },
            })}
            height={300}
            ariaLabel="True waveform, bandwidth-limited trace and scope samples"
            filename="instrument-model"
          />
          {warnings.map((w) => (
            <Warn key={w}>{w}</Warn>
          ))}
        </Card>

        <div className="grid gap-3 xl:grid-cols-3">
          <Card title="What the instrument reports">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th className="text-left font-normal">{unit}</th>
                  <th className="text-right font-normal">True</th>
                  <th className="text-right font-normal">Displayed</th>
                  <th className="text-right font-normal">Samples</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line/60">
                  <td className="py-1 text-ink-2">Peak</td>
                  <td className={TD}><Cell v={m.peakTrue} unit="amp" /></td>
                  <td className={TD}><Cell v={m.peakDisplayed} unit="amp" /></td>
                  <td className={TD}><Cell v={m.peakSampled} unit="amp" /></td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1 text-ink-2">Peak error</td>
                  <td />
                  <td className="tabular py-1 text-right font-mono text-muted">{formatNumber(m.peakErrorDisplayedPct, 3)} %</td>
                  <td className="tabular py-1 text-right font-mono text-muted">{formatNumber(m.peakErrorSampledPct, 3)} %</td>
                </tr>
                <tr className="border-b border-line/60">
                  <td className="py-1 text-ink-2">FWHM</td>
                  <td className={TD}><Cell v={m.fwhmTrue} unit="s" /></td>
                  <td className={TD}><Cell v={m.fwhmDisplayed} unit="s" /></td>
                  <td className={TD}><Cell v={m.fwhmSampled} unit="s" /></td>
                </tr>
                <tr>
                  <td className="py-1 text-ink-2">Rise 10–90 %</td>
                  <td className={TD}><Cell v={m.riseTrue} unit="s" /></td>
                  <td className={TD}><Cell v={m.riseDisplayed} unit="s" /></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </Card>
          <RiseBudget defaultSignalRise={Number.isFinite(m.riseTrue) ? m.riseTrue : 1e-9} />
          <UncertaintyCard src={src} fs={signal.fs} />
        </div>
      </div>
    </div>
  );
}

function RiseBudget({ defaultSignalRise }: { defaultSignalRise: number }) {
  const [sig, setSig] = useState(defaultSignalRise);
  const [scope, setScope] = useState(2e9);
  const [probe, setProbe] = useState(4e9);
  const rs = riseFromBandwidth(scope);
  const rp = riseFromBandwidth(probe);
  const total = combineRise([sig, rs, rp]);
  const recovered = extractRise(total, combineRise([rs, rp]));
  return (
    <Card title="Rise-time budget">
      <EngineeringInput label="Signal rise time" kind="time" value={sig} onCommit={setSig} min={1e-11} max={1e-8} hardMin={1e-13} hardMax={1e-6} path="" lock={false} />
      <EngineeringInput label="Scope bandwidth" kind="freq" value={scope} onCommit={setScope} min={1e8} max={5e10} hardMin={1e6} hardMax={1e12} path="" lock={false} />
      <EngineeringInput label="Sensor / probe bandwidth" kind="freq" value={probe} onCommit={setProbe} min={1e8} max={5e10} hardMin={1e6} hardMax={1e12} path="" lock={false} />
      <table className="mt-2 w-full">
        <tbody>
          <Row k="t_r,scope = 0.35/BW" v={formatEngineering(rs, 's')} />
          <Row k="t_r,probe = 0.35/BW" v={formatEngineering(rp, 's')} />
          <Row k="Measured ≈ √(Σ t²)" v={formatEngineering(total, 's')} />
          <Row k="Broadening" v={`${formatNumber((total / sig - 1) * 100, 3)} %`} />
          <Row k="Signal recovered from measured" v={Number.isFinite(recovered) ? formatEngineering(recovered, 's') : '—'} />
        </tbody>
      </table>
      <p className="mt-2 text-muted">
        Quadrature addition is exact for Gaussian responses; for cascaded single-pole stages it reads about 8 % low. When the instrument dominates, subtracting squares becomes very sensitive to small errors.
      </p>
    </Card>
  );
}

function UncertaintyCard({ src, fs }: { src: Float64Array; fs: number }) {
  const { exp } = useLab();
  const ctx = powerContext(exp.signal.amplitudeUnit, exp.analysis.load.resistanceOhm);
  const [uv, setUv] = useState(3);
  const [ur, setUr] = useState(1);
  const peakPower = ctx ? energyStats(src, fs, ctx.impedance).peakPower : NaN;
  const u = powerUncertainty(uv, ur, 2, Number.isFinite(peakPower) ? peakPower : 1);
  const unitP = ctx?.powerUnit ?? '';
  return (
    <Card title="Power uncertainty (first order)">
      <NumberField label="Voltage standard uncertainty" value={uv} onChange={setUv} min={0} max={20} step={0.1} suffix="%" />
      <NumberField label="Load standard uncertainty" value={ur} onChange={setUr} min={0} max={20} step={0.1} suffix="%" />
      <table className="mt-2 w-full">
        <tbody>
          <Row k="u(P)/P = √[(2u_V/V)² + (u_R/R)²]" v={`${formatNumber(u.relStdPct, 4)} %`} />
          <Row k="Expanded, k = 2" v={`${formatNumber(u.relExpandedPct, 4)} %`} />
          <Row k={Number.isFinite(peakPower) ? `Peak power interval (${unitP})` : 'Interval around 1 (unitless)'} v={`${formatEngineering(u.low, unitP)} … ${formatEngineering(u.high, unitP)}`} />
        </tbody>
      </table>
      <p className="mt-2 text-muted">Independent, small relative errors only. Correlated errors need covariance terms, and k = 2 is not an automatic 95 % guarantee.</p>
    </Card>
  );
}
