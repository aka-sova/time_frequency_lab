'use client';

import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js-dist-min';
import type { SignalResult } from '@/lib/dsp/signals';
import { isTrain } from '@/lib/dsp/signals';
import { hilbertEnvelope } from '@/lib/dsp/spectrum';
import { energyStats, periodicStats, powerContext, supportSpan } from '@/lib/dsp/power';
import { pulseWidth, type EdgeScope, type WidthBasis, type WidthOptions } from '@/lib/dsp/pulsewidth';
import { formatEngineering, formatNumber } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import { NumberField, Segmented, SmallButton } from '@/components/controls/primitives';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';
import { Card, Row, Warn } from './parts';

const WIDTH_ROWS: { id: string; label: string; opts: WidthOptions }[] = [
  { id: 'fwhm', label: 'FWHM — amplitude at 50 %', opts: { basis: 'amplitude', startPct: 50, endPct: 50 } },
  { id: 'fwhmP', label: 'FWHM — power at 50 %', opts: { basis: 'power', startPct: 50, endPct: 50 } },
  { id: 'e90', label: 'Energy 5 → 95 % (90 % of E)', opts: { basis: 'energy', startPct: 5, endPct: 95 } },
  { id: 'e98', label: 'Energy 1 → 99 % (98 % of E)', opts: { basis: 'energy', startPct: 1, endPct: 99 } },
];

export default function PowerPanel({ signal }: { signal: SignalResult }) {
  const C = usePalette();
  const lab = useLab();
  const { exp } = lab;
  const s = exp.signal;
  const ctx = powerContext(s.amplitudeUnit, exp.analysis.load.resistanceOhm);
  const train = isTrain(s) && signal.pulseCount > 1;
  const pulse = train ? signal.singlePulse : signal.xIdeal;
  const bandpass = s.carrier.enabled || s.chirp.enabled;
  const impedance = ctx?.impedance ?? NaN;
  const prf = s.repetition.prfHz;

  const [custom, setCustom] = useState<{ basis: WidthBasis; startPct: number; endPct: number; scope: EdgeScope }>({ basis: 'amplitude', startPct: 10, endPct: 10, scope: 'central' });

  const calc = useMemo(() => {
    if (!Number.isFinite(impedance)) return null;
    const single = energyStats(pulse, signal.fs, impedance);
    const whole = train ? energyStats(signal.xIdeal, signal.fs, impedance) : null;
    const rep = periodicStats(pulse, signal.fs, prf, impedance);
    const curve = bandpass ? hilbertEnvelope(pulse) : pulse;
    const widths = WIDTH_ROWS.map((r) => ({ ...r, res: pulseWidth(signal.t, curve, r.opts) }));
    const customRes = pulseWidth(signal.t, curve, custom);
    return { single, whole, rep, widths, customRes, span: supportSpan(pulse, signal.fs) };
  }, [pulse, signal, train, bandpass, impedance, prf, custom]);

  const prfPlot = useMemo(() => {
    if (!calc || !ctx) return null;
    const lo = Math.log10(prf) - 3;
    const hi = Math.min(Math.log10(prf) + 3, Math.log10(signal.fs / 4));
    if (!(hi > lo)) return null;
    const xs = Array.from({ length: 49 }, (_, i) => 10 ** (lo + ((hi - lo) * i) / 48));
    const ys = xs.map((f) => periodicStats(pulse, signal.fs, f, impedance).averagePower);
    const data: Data[] = [
      { type: 'scatter', mode: 'lines', name: 'Average power', x: xs, y: ys, line: { color: C.signal, width: 2 }, hovertemplate: 'PRF %{x:.3g} Hz<br>P_avg %{y:.3g}<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: 'Peak power', x: [xs[0], xs[xs.length - 1]], y: [calc.single.peakPower, calc.single.peakPower], line: { color: C.reference, width: 1, dash: 'dash' }, hoverinfo: 'skip' },
      { type: 'scatter', mode: 'markers', name: 'Current PRF', x: [prf], y: [calc.rep.averagePower], marker: { color: C.envelope, size: 10, line: { color: C.surface, width: 2 } }, hoverinfo: 'skip' },
    ];
    if (calc.span > 0) {
      const onset = 1 / calc.span;
      if (onset > xs[0] && onset < xs[xs.length - 1]) {
        data.push({ type: 'scatter', mode: 'lines', name: 'Pulses start to overlap', x: [onset, onset], y: [Math.min(...ys) / 2, calc.single.peakPower * 2], line: { color: C.cursor, width: 1, dash: 'dot' }, hoverinfo: 'skip' });
      }
    }
    return data;
  }, [calc, ctx, pulse, signal.fs, impedance, prf, C]);

  if (!ctx || !calc) {
    return (
      <div className="max-w-xl text-[12.5px] text-ink-2">
        <p className="mb-2">Power and energy need a physical amplitude. The waveform is currently in normalized units.</p>
        <div className="flex gap-2">
          <SmallButton onClick={() => lab.update('signal.amplitudeUnit', 'V')}>Use volts across a load</SmallButton>
          <SmallButton onClick={() => lab.update('signal.amplitudeUnit', 'V/m')}>Use field strength in free space</SmallButton>
        </div>
      </div>
    );
  }

  const field = ctx.quantity === 'field';
  const q = (v: number, u: string) => formatEngineering(v, u);
  const P = (v: number) => q(v, ctx.powerUnit);
  const E = (v: number) => q(v, ctx.energyUnit);
  const widthText = (r: { valid: boolean; width: number }) => (r.valid ? formatEngineering(r.width, 's') : '—');
  const dcFree = Math.abs(calc.single.netArea) < 1e-4 * calc.single.peak * calc.single.equivalentWidth;

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      <Card title={field ? 'Power density & fluence (one pulse)' : 'Power & energy (one pulse)'}>
        <table className="w-full">
          <tbody>
            <Row k={field ? 'Peak field E' : 'Peak voltage'} v={q(calc.single.peak, ctx.amplitudeUnit)} />
            <Row k={field ? 'Peak power density S = E²/η₀' : `Peak power V²/R (R = ${formatNumber(ctx.impedance, 4)} Ω)`} v={P(calc.single.peakPower)} />
            <Row k={field ? 'Fluence ∫S dt' : 'Energy ∫V²/R dt'} v={E(calc.single.energy)} />
            <Row k="Equivalent width E / P_peak" v={formatEngineering(calc.single.equivalentWidth, 's')} />
            <Row k="Net area ∫x dt" v={q(calc.single.netArea, field ? 'V·s/m' : 'V·s')} />
            {calc.whole ? <Row k={`Whole record (${signal.pulseCount} pulses)`} v={E(calc.whole.energy)} /> : null}
          </tbody>
        </table>
        {dcFree ? <p className="mt-2 text-muted">Net area ≈ 0: the pulse has no DC content (bipolar pulse).</p> : null}
        {!field ? (
          <div className="mt-2">
            <NumberField label="Load resistance R" path="analysis.load.resistanceOhm" min={1} max={1000} step={1} suffix="Ω" />
          </div>
        ) : (
          <Warn>Plane wave in free space: S = E²/η₀ with η₀ = 376.73 Ω. This is power density, not the total power of any antenna, and it is not valid in the near field.</Warn>
        )}
      </Card>

      <Card title="Repetition (PRF)">
        <table className="w-full">
          <tbody>
            <Row k="PRF (Pulse train → PRF)" v={formatEngineering(prf, 'Hz')} />
            <Row k="Period" v={formatEngineering(calc.rep.period, 's')} />
            <Row k="Average power" v={P(calc.rep.averagePower)} />
            <Row k="Peak / average" v={formatNumber(calc.rep.peakToAverage, 4)} />
            <Row k="Peak power (incl. overlap)" v={P(calc.rep.peakPower)} />
          </tbody>
        </table>
        {!s.repetition.enabled ? <p className="mt-2 text-muted">The train is off; this is the average if the single pulse were repeated at the PRF above.</p> : null}
        {calc.rep.overlap ? (
          <Warn>Pulses overlap at this PRF (support {formatEngineering(calc.span, 's')} &gt; period). Amplitudes add before squaring, so P_avg ≠ E·PRF. Copies are assumed identical and in phase.</Warn>
        ) : (
          <p className="mt-2 text-muted">No overlap: P_avg = E · PRF.</p>
        )}
        {prfPlot ? (
          <Plot
            data={prfPlot}
            layout={baseLayout(C, {
              margin: { l: 58, r: 10, t: 6, b: 36 },
              xaxis: axis(C, 'PRF (Hz)', { type: 'log' }),
              yaxis: axis(C, `power (${ctx.powerUnit})`, { type: 'log' }),
              legend: { orientation: 'h', y: -0.4, x: 0, font: { size: 10, color: C.ink2 } },
            })}
            height={220}
            ariaLabel="Average power versus pulse repetition frequency"
            filename="average-power-vs-prf"
          />
        ) : null}
      </Card>

      <Card title="Pulse width — by definition" className="lg:col-span-2 2xl:col-span-1">
        <p className="mb-2 text-muted">The same pulse has different “widths”. Always state the definition{bandpass ? ' (RF pulse: measured on the Hilbert envelope)' : ''}.</p>
        <table className="w-full">
          <tbody>
            {calc.widths.map((w) => (
              <Row key={w.id} k={w.label} v={widthText(w.res)} sub={w.res.valid && w.opts.basis !== 'energy' ? `${formatNumber(100 * w.res.energyFraction, 3)} % E` : ''} />
            ))}
          </tbody>
        </table>
        <div className="mt-3 border-t border-line pt-2">
          <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Custom</p>
          <Segmented
            size="xs"
            ariaLabel="Width basis"
            value={custom.basis}
            options={[
              { value: 'amplitude', label: 'amplitude' },
              { value: 'power', label: 'power' },
              { value: 'energy', label: 'energy' },
            ]}
            onChange={(basis) => setCustom({ ...custom, basis })}
          />
          <div className="grid grid-cols-2 gap-x-3">
            <NumberField label="Start level" value={custom.startPct} onChange={(startPct) => setCustom({ ...custom, startPct })} min={0} max={100} step={1} suffix="%" slider={false} />
            <NumberField label="End level" value={custom.endPct} onChange={(endPct) => setCustom({ ...custom, endPct })} min={0} max={100} step={1} suffix="%" slider={false} />
          </div>
          {custom.basis !== 'energy' ? (
            <Segmented
              size="xs"
              ariaLabel="Crossing selection"
              value={custom.scope}
              options={[
                { value: 'central', label: 'main lobe' },
                { value: 'outer', label: 'outermost' },
              ]}
              onChange={(scope) => setCustom({ ...custom, scope })}
            />
          ) : null}
          <p className="tabular mt-2 font-mono text-[13px] text-ink">
            {calc.customRes.valid ? `${formatEngineering(calc.customRes.width, 's')}  (${formatNumber(100 * calc.customRes.energyFraction, 3)} % of E)` : <span className="text-muted">{calc.customRes.error}</span>}
          </p>
        </div>
      </Card>
    </div>
  );
}
