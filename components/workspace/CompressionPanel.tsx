'use client';

import { useDeferredValue, useMemo } from 'react';
import type { Data, Layout } from 'plotly.js-dist-min';
import type { SignalResult } from '@/lib/dsp/signals';
import { isTrain } from '@/lib/dsp/signals';
import { analyzeCompression, buildReference, COMPRESSION_WEIGHTINGS, NARROWBAND_LIMIT, type CompressionSettings } from '@/lib/dsp/compression';
import { ambiguity, autoAmbiguitySpan, referenceSupport } from '@/lib/dsp/ambiguity';
import { activeRange } from '@/lib/dsp/instrument';
import { minMaxIndices, pick } from '@/lib/dsp/decimate';
import { snapCodeLength } from '@/lib/dsp/codes';
import { makeWindow, windowStats } from '@/lib/dsp/windows';
import { chooseUnit, formatDb, formatEngineering, formatNumber, FREQ_UNITS, TIME_UNITS } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import { EngineeringInput, NumberField, Segmented, SelectField, SmallButton, ToggleField } from '@/components/controls/primitives';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';
import { Card, Row, Warn } from './parts';

const TRIANGLE_3DB = 2 - Math.SQRT2; // −3 dB width of a triangle of base 2τ, in units of τ
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-12));
const dB = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? '—' : v === -Infinity ? 'none' : formatDb(v, digits));
const sec = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : formatEngineering(v, 's', 4));

export default function CompressionPanel({ signal }: { signal: SignalResult }) {
  const C = usePalette();
  const { exp, update, updateMany, presetId } = useLab();
  const s = exp.signal;
  const cs = exp.analysis.compression;

  // The reference depends on the reference type and weighting only; ν re-uses it (and the ambiguity function).
  const reference = useMemo(() => buildReference(signal, s, { reference: cs.reference, weighting: cs.weighting, dopplerHz: 0 }), [signal, s, cs.reference, cs.weighting]);
  const settings: CompressionSettings = useMemo(() => ({ reference: cs.reference, weighting: cs.weighting, dopplerHz: cs.dopplerHz }), [cs.reference, cs.weighting, cs.dopplerHz]);
  const res = useMemo(() => analyzeCompression(signal, s, settings, reference), [signal, s, settings, reference]);

  const auto = autoAmbiguitySpan(res);
  const span = cs.ambiguity.autoSpan ? auto : { delaySpanSec: cs.ambiguity.delaySpanSec, dopplerSpanHz: cs.ambiguity.dopplerSpanHz };
  const ambInput = useMemo(() => ({ reference, delaySpanSec: span.delaySpanSec, dopplerSpanHz: span.dopplerSpanHz }), [reference, span.delaySpanSec, span.dopplerSpanHz]);
  const deferred = useDeferredValue(ambInput);
  const amb = useMemo(
    () => ambiguity(deferred.reference.signal, { delaySpanSec: deferred.delaySpanSec, dopplerSpanHz: deferred.dopplerSpanHz, support: referenceSupport(deferred.reference) }),
    [deferred],
  );
  const stale = deferred !== ambInput;

  const m = res.metrics;
  const train = res.reference.train;
  const recordTrain = isTrain(s) && signal.pulseCount > 1;
  const chirpB = s.chirp.enabled ? Math.abs(s.chirp.endFrequencyHz - s.chirp.startFrequencyHz) : 0;
  const codeL = s.code.enabled && s.pulse.enabled ? snapCodeLength(s.code.family, s.code.length) : 0;
  const plain = !s.chirp.enabled && !codeL && s.pulse.enabled && s.pulse.envelope === 'rect' && !s.pulse.edgesEnabled;
  const matched = cs.weighting === 'rect';
  const enbwDb = useMemo(() => (matched ? 0 : 10 * Math.log10(windowStats(makeWindow(cs.weighting, 4096, false)).enbwBins)), [cs.weighting, matched]);

  // ---------- matched-filter plot ----------
  const mf = useMemo(() => {
    const [a0, b0] = activeRange(res.mag, 1e-3);
    let i0 = a0;
    let i1 = b0;
    const minHalf = Math.ceil(4 * Math.max(m.widthSec, 1 / signal.fs) * signal.fs);
    if (m.peakIndex - i0 < minHalf) i0 = Math.max(0, m.peakIndex - minHalf);
    if (i1 - m.peakIndex < minHalf) i1 = Math.min(res.mag.length - 1, m.peakIndex + minHalf);
    const tu = chooseUnit(Math.max(Math.abs(res.tau[i0]), Math.abs(res.tau[i1])), TIME_UNITS);
    const conv = (v: number) => (cs.displayDb ? Math.max(db(v), cs.dbFloor) : v);
    const series = (y: Float64Array) => {
      const idx = minMaxIndices(y, i0, i1, 2500);
      return { x: pick(res.tau, idx, 1 / tu.scale), y: idx.map((k) => conv(y[k])) };
    };
    const data: Data[] = [];
    if (res.magUnweighted) {
      const u = series(res.magUnweighted);
      data.push({ type: 'scatter', mode: 'lines', name: 'Unweighted (matched)', x: u.x, y: u.y, line: { color: C.muted, width: 1, dash: 'dot' }, hoverinfo: 'skip' });
    }
    if (res.magNoisy) {
      const nz = series(res.magNoisy);
      data.push({ type: 'scatter', mode: 'lines', name: 'With noise', x: nz.x, y: nz.y, line: { color: C.envelope, width: 1 }, opacity: 0.8, hovertemplate: `τ = %{x:.4g} ${tu.label}<br>%{y:.3g}<extra>noisy</extra>` });
    }
    const main = series(res.mag);
    data.push({
      type: 'scatter',
      mode: 'lines',
      name: matched ? 'Matched-filter output' : 'Weighted output',
      x: main.x,
      y: main.y,
      line: { color: C.signal, width: 1.6 },
      hovertemplate: `τ = %{x:.4g} ${tu.label}<br>%{y:.4g}${cs.displayDb ? ' dB' : ''}<extra></extra>`,
    });
    data.push({
      type: 'scatter',
      mode: 'markers',
      name: 'Peak',
      x: [m.peakDelay / tu.scale],
      y: [conv(res.mag[m.peakIndex])],
      marker: { color: C.cursor, size: 8, symbol: 'diamond' },
      hovertemplate: `peak at τ = %{x:.4g} ${tu.label}<extra></extra>`,
      showlegend: false,
    });
    const lo = res.tau[i0] / tu.scale;
    const hi = res.tau[i1] / tu.scale;
    const peakY = conv(res.mag[m.peakIndex]);
    const shapes: Partial<Layout>['shapes'] = [];
    if (Number.isFinite(m.halfPower[0]) && Number.isFinite(m.halfPower[1]))
      shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: m.halfPower[0] / tu.scale, x1: m.halfPower[1] / tu.scale, y0: 0, y1: 1, fillcolor: C.band, line: { width: 0 }, layer: 'below' });
    if (Number.isFinite(m.pslrDb)) {
      const level = cs.displayDb ? peakY + m.pslrDb : res.mag[m.peakIndex] * 10 ** (m.pslrDb / 20);
      shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: level, y1: level, line: { color: C.cursor, width: 1, dash: 'dash' } });
    }
    if (recordTrain && res.pri > 0) {
      for (let k = -signal.pulseCount; k <= signal.pulseCount; k++) {
        if (k === 0) continue;
        const x = (m.peakDelay + k * res.pri) / tu.scale;
        if (x > lo && x < hi) shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1, line: { color: C.component, width: 1, dash: 'dot' } });
      }
    }
    return { data, tu, lo, hi, shapes };
  }, [res, m, signal.fs, signal.pulseCount, cs.displayDb, cs.dbFloor, C, matched, recordTrain]);

  // ---------- ambiguity heatmap ----------
  const dbRange = cs.ambiguity.dbRange;
  const nuSel = cs.dopplerHz;
  const af = useMemo(() => {
    const tu = chooseUnit(Math.max(amb.tau[amb.tau.length - 1], 1e-30), TIME_UNITS);
    const fu = chooseUnit(Math.max(amb.nu[amb.nu.length - 1], 1e-30), FREQ_UNITS);
    const z = amb.mag.map((row) => Array.from(row, (v) => Math.max(db(v), -dbRange)));
    const heat = {
      type: 'heatmap',
      x: Array.from(amb.tau, (t) => t / tu.scale),
      y: Array.from(amb.nu, (f) => f / fu.scale),
      z,
      zmin: -dbRange,
      zmax: 0,
      colorscale: C.heatmap,
      name: '|χ|',
      zsmooth: 'best',
      colorbar: { title: { text: 'dB', side: 'right', font: { size: 10, color: C.ink2 } }, thickness: 10, tickfont: { size: 9, color: C.muted }, outlinewidth: 0, len: 0.9 },
      hovertemplate: `τ = %{x:.4g} ${tu.label}<br>ν = %{y:.4g} ${fu.label}<br>%{z:.1f} dB<extra>|χ(τ,ν)|</extra>`,
    } as Data;
    const nuMax = amb.nu[amb.nu.length - 1];
    const shapes: Partial<Layout>['shapes'] = [];
    if (Math.abs(nuSel) <= nuMax)
      shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: nuSel / fu.scale, y1: nuSel / fu.scale, line: { color: C.cursor, width: 1.5 } });
    const lim = res.narrowband.nuLimitHz;
    if (!res.narrowband.baseband && lim < nuMax)
      for (const sgn of [-1, 1]) shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: (sgn * lim) / fu.scale, y1: (sgn * lim) / fu.scale, line: { color: C.compare, width: 1, dash: 'dash' } });
    const cut: Data = {
      type: 'scatter',
      mode: 'lines',
      name: '|χ(0, ν)|',
      x: Array.from(amb.nu, (f) => f / fu.scale),
      y: Array.from(amb.zeroDelay, (v) => Math.max(db(v), -dbRange)),
      line: { color: C.signal, width: 1.5 },
      hovertemplate: `ν = %{x:.4g} ${fu.label}<br>%{y:.2f} dB<extra>zero-delay cut</extra>`,
    };
    const cutShapes: Partial<Layout>['shapes'] = [];
    const res1 = train && res.pri > 0 ? 1 / (res.reference.centers.length * res.pri) : 1 / res.reference.duration;
    for (const sgn of [-1, 1]) cutShapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: (sgn * res1) / fu.scale, x1: (sgn * res1) / fu.scale, y0: 0, y1: 1, line: { color: C.cursor, width: 1, dash: 'dot' } });
    if (train && res.pri > 0)
      for (let k = -2; k <= 2; k++) {
        if (k === 0) continue;
        const x = k / res.pri / fu.scale;
        if (Math.abs(k / res.pri) <= nuMax) cutShapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1, line: { color: C.component, width: 1, dash: 'dash' } });
      }
    return { heat, tu, fu, shapes, cut, cutShapes, res1 };
  }, [amb, dbRange, nuSel, C, res.narrowband, res.pri, res.reference, train]);

  // ---------- warnings ----------
  const warnings: string[] = [];
  if (res.reference.cut) warnings.push('The reference is cut by the record edges: extend the observation duration for a complete matched filter.');
  if (res.reference.overlap) warnings.push('The weighting spans of adjacent pulses overlap (pulse longer than the PRI): per-pulse weighting is ambiguous.');
  if (res.narrowband.exceeded)
    warnings.push(
      `Narrowband Doppler approximation exceeded: |ν|·B·T/f_c = ${formatNumber(res.narrowband.ratio, 2)} ≥ ${NARROWBAND_LIMIT}. A real Doppler shift scales the waveform in time; the frequency-shift model is only a teaching approximation here (limit |ν| ≈ ${formatEngineering(res.narrowband.nuLimitHz, 'Hz')}).`,
    );
  if (res.narrowband.baseband && cs.dopplerHz !== 0) warnings.push('Baseband (carrier-less) pulse: Doppler is modeled as a frequency shift only; physically it is a time scaling of the waveform.');
  if (amb.capped) warnings.push('The ambiguity grid was capped: the reference is too long for the requested Doppler span. Reduce the span or the pulse count.');
  if (s.code.enabled && s.pulse.enabled && s.code.family !== 'barker' && !s.carrier.enabled && !s.chirp.enabled) warnings.push('A polyphase code needs a carrier (see the status bar fix).');
  if (cs.reference === 'train' && !train) warnings.push('No pulse train is active: the single pulse is used as the reference.');

  // ---------- theory values ----------
  const k = chirpB > 0 ? chirpB / s.pulse.widthSec : 0;
  const theory = {
    width: matched ? (chirpB > 0 ? 0.886 / chirpB : plain ? TRIANGLE_3DB * s.pulse.widthSec : codeL && s.code.family === 'barker' ? (TRIANGLE_3DB * s.pulse.widthSec) / codeL : null) : null,
    ratio: matched ? (chirpB > 0 ? (chirpB * s.pulse.widthSec) / 0.886 : plain ? 1 / TRIANGLE_3DB : codeL && s.code.family === 'barker' ? codeL / TRIANGLE_3DB : null) : null,
    pslr: matched ? (chirpB > 0 ? -13.26 : codeL && s.code.family === 'barker' ? 20 * Math.log10(1 / codeL) : null) : null,
    shift: k > 0 ? -cs.dopplerHz / k : null,
    dopplerLoss: chirpB > 0 && Math.abs(cs.dopplerHz) < chirpB ? -20 * Math.log10(1 - Math.abs(cs.dopplerHz) / chirpB) : null,
    gain: train ? 10 * Math.log10(res.reference.centers.length) : null,
  };

  const nuRange = Math.max(auto.dopplerSpanHz, Math.abs(cs.dopplerHz), 1);

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {warnings.length ? (
        <div className="lg:col-span-2 2xl:col-span-3">
          {warnings.map((w) => (
            <Warn key={w}>{w}</Warn>
          ))}
        </div>
      ) : null}

      <Card title="Matched filter" className="lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <div className="py-1">
            <p className="mb-0.5 text-[0.6875rem] text-ink-2">Reference</p>
            <Segmented
              size="xs"
              ariaLabel="Matched-filter reference"
              value={cs.reference}
              options={[
                { value: 'pulse', label: 'single pulse', title: 'Correlate with one clean pulse' },
                { value: 'train', label: 'nominal train', title: 'Correlate with the whole train as transmitted (coherent integration)' },
              ]}
              onChange={(v) => update('analysis.compression.reference', v)}
            />
          </div>
          <div className="w-44">
            <SelectField label="Weighting" path="analysis.compression.weighting" tip="compressionWeighting" options={COMPRESSION_WEIGHTINGS.map((w) => ({ value: w.id, label: w.label }))} />
          </div>
          <div className="min-w-[16rem] flex-1">
            <EngineeringInput
              label="Doppler mismatch ν"
              path="analysis.compression.dopplerHz"
              kind="freq"
              log={false}
              min={-nuRange}
              max={nuRange}
              hardMin={-1e12}
              hardMax={1e12}
              lock={false}
              tip="compressionDoppler"
            />
          </div>
          <SmallButton onClick={() => update('analysis.compression.dopplerHz', 0)} disabled={cs.dopplerHz === 0} title="Remove the Doppler mismatch">
            ν = 0
          </SmallButton>
          <div className="py-1">
            <p className="mb-0.5 text-[0.6875rem] text-ink-2">Display</p>
            <Segmented
              size="xs"
              ariaLabel="Matched-filter display"
              value={cs.displayDb ? 'db' : 'lin'}
              options={[
                { value: 'db', label: 'dB' },
                { value: 'lin', label: 'linear' },
              ]}
              onChange={(v) => update('analysis.compression.displayDb', v === 'db')}
            />
          </div>
          {cs.displayDb ? (
            <div className="w-40">
              <NumberField label="dB floor" path="analysis.compression.dbFloor" min={-120} max={-20} step={5} suffix="dB" slider={false} />
            </div>
          ) : null}
        </div>
        <Plot
          data={mf.data}
          layout={baseLayout(C, {
            margin: { l: 56, r: 10, t: 6, b: 36 },
            xaxis: axis(C, `delay τ (${mf.tu.label})`, { range: [mf.lo, mf.hi], autorange: false }),
            yaxis: axis(C, cs.displayDb ? '|y(τ)| (dB, matched peak = 0 dB)' : '|y(τ)| (matched peak = 1)', cs.displayDb ? { range: [cs.dbFloor, 3], autorange: false } : {}),
            legend: { orientation: 'h', y: -0.28, x: 0, font: { size: 10, color: C.ink2 } },
            shapes: mf.shapes,
            uirevision: `${presetId}:${cs.reference}:${mf.lo}:${mf.hi}:${cs.displayDb}`,
          })}
          height={300}
          ariaLabel="Matched-filter output versus delay"
          filename="matched-filter-output"
        />
        <p className="mt-1 text-muted">
          Output normalized to a constant noise level: the matched peak is 0 dB and any drop is an SNR loss. Shaded: −3 dB mainlobe; dashed: peak sidelobe level
          {recordTrain ? '; dotted: other pulses at multiples of the PRI' : ''}.
        </p>
      </Card>

      <Card title="Compression metrics">
        <table className="w-full">
          <thead>
            <tr className="text-[0.6875rem] text-muted">
              <th className="text-left font-normal" />
              <th className="text-right font-normal">Measured</th>
              <th className="pl-3 text-right font-normal">Theory</th>
            </tr>
          </thead>
          <tbody>
            <Row k="Compressed width τ_c (−3 dB)" v={sec(m.widthSec)} sub={sec(theory.width)} />
            <Row k="Pulse FWHM" v={sec(m.pulseFwhm)} sub="" />
            <Row k="Compression ratio FWHM/τ_c" v={formatNumber(m.ratio, 4)} sub={theory.ratio === null ? '—' : formatNumber(theory.ratio, 4)} />
            <Row k="Time–bandwidth product TB" v={m.tb === null ? '—' : formatNumber(m.tb, 4)} sub="" />
            <Row k="Peak sidelobe level (PSLR)" v={dB(m.pslrDb)} sub={dB(theory.pslr)} />
            <Row k="Integrated sidelobe level (ISLR)" v={dB(m.islrDb)} sub="" />
            <Row k="Weighting loss" v={dB(m.weightingLossDb)} sub={matched ? dB(0) : `${dB(enbwDb)} (ENBW)`} />
            <Row k="Peak delay shift (Doppler)" v={sec(m.delayShift)} sub={theory.shift === null ? '—' : sec(theory.shift)} />
            <Row k="Doppler loss" v={dB(m.dopplerLossDb)} sub={dB(theory.dopplerLoss)} />
            <Row k="Range resolution ΔR = c·τ_c/2" v={formatEngineering(m.rangeResolutionM, 'm', 4)} sub="" />
            {train ? (
              <>
                <Row k={`Integration gain (${res.reference.centers.length} pulses, SNR)`} v={dB(m.integrationGainDb)} sub={dB(theory.gain)} />
                <Row k="Integration loss (jitter, phase)" v={dB(m.integrationLossDb)} sub={dB(0)} />
              </>
            ) : null}
            {m.ambiguities
              .filter((a) => Math.abs(a.m) <= 2)
              .map((a) => (
                <Row key={a.m} k={`Range ambiguity m = ${a.m > 0 ? '+' : ''}${a.m} (${sec(a.delay)})`} v={dB(a.db)} sub={train ? dB(20 * Math.log10((signal.pulseCount - Math.abs(a.m)) / signal.pulseCount)) : '—'} />
              ))}
          </tbody>
        </table>
        <p className="mt-2 text-muted">
          Theory: LFM τ_c ≈ 0.886/B and −13.26 dB sidelobes; Barker PSLR = 1/L; an unmodulated rect pulse compresses to a triangle (τ_c = (2 − √2)·τ). Theory columns assume no weighting.
        </p>
      </Card>

      <Card title="Detection in noise">
        <ToggleField label="Additive noise" path="signal.noise.enabled" tip="noise" />
        <NumberField label="Noise σ (RMS)" path="signal.noise.rms" min={0} max={Math.max(10 * s.amplitude, 1e-12)} step={Math.max(s.amplitude / 100, 1e-12)} disabled={!s.noise.enabled} />
        <table className="mt-2 w-full">
          <tbody>
            <Row k="Reference energy E = Σx²·Δt" v={formatEngineering(m.referenceSumSq / signal.fs, 'V²s', 4)} />
            <Row
              k={`Output SNR, theory  Σx²/σ² = 2E/N₀ − losses${res.snr ? '' : ` (σ = ${formatNumber(s.noise.rms, 3)})`}`}
              v={res.snr ? dB(res.snr.outTheoryDb) : s.noise.rms > 0 ? dB(10 * Math.log10(m.referenceSumSq / s.noise.rms ** 2) - m.weightingLossDb - m.dopplerLossDb) : '—'}
            />
            {res.snr ? (
              <>
                <Row k="Input peak SNR  max x²/σ²" v={dB(res.snr.inDb)} />
                <Row k="Output SNR, this realization" v={dB(res.snr.outMeasuredDb)} sub={`±${formatNumber(res.snr.scatterDb, 2)} dB`} />
                <Row k="Processing gain" v={dB(res.snr.gainDb)} />
              </>
            ) : null}
          </tbody>
        </table>
        {!res.snr ? <p className="mt-2 text-muted">Turn the noise on to measure the output SNR of one noise realization.</p> : null}
        <p className="mt-2 text-muted">
          The matched filter maximizes the output SNR to 2E/N₀: it depends only on the pulse energy, not on its shape or bandwidth. A chirp and an unmodulated pulse of equal energy are equally detectable; only the chirp resolves
          targets that are closer than the pulse length. ± is the expected scatter of a single noise realization.
        </p>
      </Card>

      <Card title={`Ambiguity function — ${train ? 'nominal train' : 'reference pulse'}`} className="lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-end gap-x-4 gap-y-1">
          <ToggleField label="Auto span" path="analysis.compression.ambiguity.autoSpan" />
          {!cs.ambiguity.autoSpan ? (
            <>
              <div className="min-w-[14rem] flex-1">
                <EngineeringInput label="Delay span ±" path="analysis.compression.ambiguity.delaySpanSec" kind="time" min={1e-10} max={1e-4} hardMin={1e-15} hardMax={1} lock={false} />
              </div>
              <div className="min-w-[14rem] flex-1">
                <EngineeringInput label="Doppler span ±" path="analysis.compression.ambiguity.dopplerSpanHz" kind="freq" min={1e3} max={1e10} hardMin={1e-3} hardMax={1e12} lock={false} />
              </div>
            </>
          ) : (
            <SmallButton
              onClick={() =>
                updateMany([
                  ['analysis.compression.ambiguity.autoSpan', false],
                  ['analysis.compression.ambiguity.delaySpanSec', auto.delaySpanSec],
                  ['analysis.compression.ambiguity.dopplerSpanHz', auto.dopplerSpanHz],
                ])
              }
              title="Edit the spans, starting from the automatic values"
            >
              Edit spans
            </SmallButton>
          )}
          <div className="w-40">
            <NumberField label="Dynamic range" path="analysis.compression.ambiguity.dbRange" min={10} max={120} step={5} suffix="dB" slider={false} />
          </div>
        </div>
        <div className={stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Plot
            data={[af.heat]}
            layout={baseLayout(C, {
              margin: { l: 60, r: 10, t: 6, b: 38 },
              showlegend: false,
              xaxis: axis(C, `delay τ (${af.tu.label})`),
              yaxis: axis(C, `Doppler ν (${af.fu.label})`),
              shapes: af.shapes,
              uirevision: `${presetId}:${cs.reference}:${span.delaySpanSec}:${span.dopplerSpanHz}`,
            })}
            height={340}
            ariaLabel="Ambiguity function heatmap; click to set the Doppler mismatch"
            filename="ambiguity-function"
            onClick={(_x, y) => update('analysis.compression.dopplerHz', Number((y * af.fu.scale).toPrecision(4)))}
          />
          <Plot
            data={[af.cut]}
            layout={baseLayout(C, {
              margin: { l: 60, r: 10, t: 6, b: 38 },
              showlegend: false,
              xaxis: axis(C, `Doppler ν (${af.fu.label})`),
              yaxis: axis(C, '|χ(0, ν)| (dB)', { range: [-cs.ambiguity.dbRange, 3], autorange: false }),
              shapes: af.cutShapes,
              uirevision: `${presetId}:${cs.reference}:${span.dopplerSpanHz}`,
            })}
            height={190}
            ariaLabel="Zero-delay cut of the ambiguity function"
            filename="ambiguity-zero-delay-cut"
          />
        </div>
        <p className="mt-1 text-muted">
          Click the heatmap to set ν. Orange line: current ν (its horizontal cut is the matched-filter output above).{' '}
          {!res.narrowband.baseband && res.narrowband.nuLimitHz < amb.nu[amb.nu.length - 1] ? 'Dashed: narrowband-model limit. ' : ''}
          Dotted lines on the cut: Doppler resolution ±{formatEngineering(af.res1, 'Hz')}
          {train ? '; dashed: ambiguities at multiples of the PRF' : ''}.
        </p>
        <p className="tabular mt-1 font-mono text-[0.6875rem] text-muted">
          χ(0,0) = {formatNumber(amb.peak, 4)} · volume in span = {formatNumber(amb.volume, 3)} · resampled at {formatEngineering(amb.fsResampled, 'Hz')} · grid {amb.tau.length} × {amb.nu.length} · {formatNumber(amb.ms, 3)} ms · span ±
          {formatEngineering(span.delaySpanSec, 's')} / ±{formatEngineering(span.dopplerSpanHz, 'Hz')}
        </p>
      </Card>
    </div>
  );
}
