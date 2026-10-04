'use client';

import { useState } from 'react';
import { Maximize2, ScanLine, SlidersHorizontal } from 'lucide-react';
import type { SpectrumDisplay } from '@/types/signal';
import { allowed, useLab } from '@/components/lab/context';
import { Segmented, SmallButton, InfoTip, EngineeringInput, NumberField, SelectField, ToggleField } from '@/components/controls/primitives';
import { ANALYSIS_WINDOWS } from '@/lib/dsp/windows';
import { formatEngineering } from '@/lib/units/format';
import type { Measurements } from '@/lib/dsp/analyze';

function Check({ label, path, tip }: { label: string; path: string; tip?: string }) {
  const lab = useLab();
  const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], lab.exp) as boolean;
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-1 text-[0.71875rem] text-ink-2">
      <input type="checkbox" checked={v} onChange={() => lab.update(path, !v)} className="h-3 w-3 accent-accent" />
      {label}
      {tip ? <InfoTip tip={tip} label={label} /> : null}
    </label>
  );
}

export function TimeToolbar() {
  const lab = useLab();
  const a = lab.exp.analysis;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
      <h2 className="mr-1 text-[0.75rem] font-semibold uppercase tracking-wider text-ink-2">Time domain x(t)</h2>
      <SmallButton onClick={lab.fitTime} title="Frame the pulses" ariaLabel="Fit time axis to the signal">
        <ScanLine size={12} aria-hidden /> Fit
      </SmallButton>
      <SmallButton onClick={() => lab.update('analysis.time.range', { mode: 'full', min: 0, max: 0 })} active={a.time.range.mode === 'full'} ariaLabel="Show the full observation">
        <Maximize2 size={12} aria-hidden /> Full record
      </SmallButton>
      <Check label="Envelope" path="analysis.time.showEnvelope" />
      {allowed(lab.mode, 'advanced') ? (
        <>
          <Check label="Samples" path="analysis.time.showSamples" />
          <Check label="Physical reference" path="analysis.time.showReference" tip="aliasingDemo" />
          <Check label="Pulse markers" path="analysis.time.showMarkers" />
          <Check label="f_inst" path="analysis.time.showInstFreq" tip="chirp" />
          <Check label="Cursors" path="analysis.cursors.enabled" tip="cursors" />
        </>
      ) : null}
    </div>
  );
}

const DISPLAYS: { value: SpectrumDisplay; label: string; title: string }[] = [
  { value: 'magnitude', label: '|X|', title: 'Magnitude |X(f)|' },
  { value: 'normalized', label: 'Norm', title: 'Normalized |X|/max|X|' },
  { value: 'db', label: 'dB', title: '20·log10(|X|/max|X|)' },
  { value: 'power', label: '|X|²', title: 'Power / energy spectral density' },
  { value: 'psd', label: 'PSD', title: 'Power spectral density (power signals, noise)' },
];

export function SpectrumToolbar({ m }: { m: Measurements }) {
  const lab = useLab();
  const sp = lab.exp.analysis.spectrum;
  const [more, setMore] = useState(false);
  const adv = allowed(lab.mode, 'advanced');
  return (
    <div className="px-4 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="mr-1 text-[0.75rem] font-semibold uppercase tracking-wider text-ink-2">Frequency domain</h2>
        <Segmented ariaLabel="Spectrum display" value={sp.display} onChange={(v) => lab.update('analysis.spectrum.display', v)} options={DISPLAYS} size="xs" />
        {(sp.display === 'power' || sp.display === 'psd') && (
          <Segmented
            size="xs"
            ariaLabel="Linear or dB"
            value={sp.powerDb ? 'db' : 'lin'}
            onChange={(v) => lab.update('analysis.spectrum.powerDb', v === 'db')}
            options={[
              { value: 'lin', label: 'lin' },
              { value: 'db', label: 'dB' },
            ]}
          />
        )}
        <SmallButton onClick={lab.fitFrequency} title="Frame the spectral envelope" ariaLabel="Fit frequency axis">
          <ScanLine size={12} aria-hidden /> Fit
        </SmallButton>
        <SmallButton onClick={() => lab.update('analysis.spectrum.range', { mode: 'full', min: 0, max: 0 })} active={sp.range.mode === 'full'} ariaLabel="Show 0 to Nyquist">
          <Maximize2 size={12} aria-hidden /> 0…f_N
        </SmallButton>
        {adv ? (
          <>
            <Segmented
              size="xs"
              ariaLabel="One- or two-sided"
              value={sp.sided}
              onChange={(v) => {
                lab.updateMany([
                  ['analysis.spectrum.sided', v],
                  ['analysis.spectrum.range', { mode: 'full', min: 0, max: 0 }],
                ]);
              }}
              options={[
                { value: 'one', label: 'one-sided', title: '0 … fₛ/2' },
                { value: 'two', label: 'two-sided', title: '−fₛ/2 … fₛ/2' },
              ]}
            />
            <Check label="Pulse envelope" path="analysis.spectrum.showSinglePulse" tip="singlePulse" />
            <Check label="Bands" path="analysis.spectrum.showBandMarkers" tip="bandMarkers" />
            <Check label="Phase" path="analysis.spectrum.showPhase" />
          </>
        ) : null}
        <label className="inline-flex items-center gap-1 text-[0.71875rem] text-ink-2">
          Floor
          <select
            value={sp.dbFloor}
            onChange={(e) => lab.update('analysis.spectrum.dbFloor', Number(e.target.value))}
            className="rounded-sm border border-line-strong bg-surface px-1 py-0.5 text-[0.71875rem]"
            aria-label="dB floor"
          >
            {[-20, -30, -40, -60, -80, -100, -120, -160].map((v) => (
              <option key={v} value={v}>
                {v} dB
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1 text-[0.71875rem] text-ink-2" title="Reveal spectral tails that are normally invisible">
          <input
            type="checkbox"
            checked={sp.dbFloor <= -100}
            onChange={() => lab.update('analysis.spectrum.dbFloor', sp.dbFloor <= -100 ? -60 : -100)}
            className="h-3 w-3 accent-accent"
          />
          Show theoretical tails
        </label>
        {adv ? (
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="ml-auto inline-flex items-center gap-1 text-[0.71875rem] text-muted hover:text-ink">
            <SlidersHorizontal size={12} aria-hidden /> FFT settings
          </button>
        ) : null}
      </div>
      {more && adv ? (
        <div className="mt-1 grid gap-x-4 rounded-sm border border-line bg-surface/50 px-3 py-1 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <SelectField label="Analysis window" path="analysis.spectrum.window" tip="window" options={ANALYSIS_WINDOWS.map((w) => ({ value: w.id, label: w.label }))} />
            <SelectField
              label="Zero padding"
              tip="zeroPad"
              value={[1, 2, 4, 8].includes(sp.zeroPad) ? sp.zeroPad : 0}
              onChange={(v) => v > 0 && lab.update('analysis.spectrum.zeroPad', v)}
              options={[
                { value: 1, label: 'None (1×)' },
                { value: 2, label: '2×' },
                { value: 4, label: '4×' },
                { value: 8, label: '8×' },
                ...([1, 2, 4, 8].includes(sp.zeroPad) ? [] : [{ value: 0, label: `Custom (${sp.zeroPad}×)` }]),
              ]}
            />
            <NumberField label="Custom zero padding" path="analysis.spectrum.zeroPad" min={1} max={16} step={0.5} suffix="×" slider={false} />
          </div>
          <div>
            <ToggleField label="Mark un-padded DFT bins" path="analysis.spectrum.showRawBins" tip="rawBins" />
            <p className="text-[0.6875rem] text-muted">
              Bin spacing {formatEngineering(m.binSpacing, 'Hz')} (padded) vs {formatEngineering(m.recordBinSpacing, 'Hz')} (record). More FFT samples ≠ more information.
            </p>
            <ToggleField label="Centered (fftshift)" path="analysis.spectrum.centered" tip="centered" />
            <ToggleField label="Log frequency axis" path="analysis.spectrum.logFrequency" />
            <ToggleField label="Nyquist marker" path="analysis.spectrum.showNyquist" />
          </div>
          <div>
            <ToggleField label="FFT of cursor selection only" path="analysis.spectrum.fftSelection" tip="fftSelection" />
            {sp.fftSelection && !lab.exp.analysis.cursors.enabled ? (
              <SmallButton onClick={() => lab.update('analysis.cursors.enabled', true)}>Enable cursors</SmallButton>
            ) : null}
            {sp.range.mode === 'manual' ? (
              <>
                <EngineeringInput label="f min" path="analysis.spectrum.range.min" kind="freq" min={0} max={50e9} log={false} hardMin={-1e12} hardMax={1e12} lock={false} tip="freqRange" />
                <EngineeringInput label="f max" path="analysis.spectrum.range.max" kind="freq" min={1e3} max={50e9} hardMin={-1e12} hardMax={1e12} lock={false} />
              </>
            ) : (
              <SmallButton onClick={() => lab.update('analysis.spectrum.range', { mode: 'manual', min: 0, max: m.nyquist })}>Set manual range</SmallButton>
            )}
          </div>
          <div>
            <SelectField
              label="Spectrum scaling"
              path="analysis.spectrum.scaling"
              tip="scaling"
              level="expert"
              options={[
                { value: 'ft', label: 'Fourier-transform estimate (V/Hz)' },
                { value: 'amplitude', label: 'Amplitude spectrum (V)' },
              ]}
            />
            <SelectField
              label="PSD estimator"
              path="analysis.spectrum.estimator"
              tip="estimator"
              level="expert"
              options={[
                { value: 'periodogram', label: 'Periodogram' },
                { value: 'welch', label: 'Welch (averaged)' },
              ]}
            />
            {sp.estimator === 'welch' ? <NumberField label="Welch segments" path="analysis.spectrum.welchSegments" min={2} max={32} integer level="expert" /> : null}
            <SelectField
              label="Bandwidth convention"
              path="analysis.spectrum.kind"
              tip="spectrumKind"
              level="expert"
              options={[
                { value: 'auto', label: `Auto (${m.kind})` },
                { value: 'baseband', label: 'Baseband (from DC)' },
                { value: 'bandpass', label: 'Bandpass (two edges)' },
              ]}
            />
            <SelectField
              label="Phase reference"
              path="analysis.spectrum.phaseReference"
              tip="phaseReference"
              level="expert"
              options={[
                { value: 'center', label: 'Pulse center' },
                { value: 'start', label: 'Record start' },
              ]}
            />
            <ToggleField label="Unwrap phase" path="analysis.spectrum.phaseUnwrap" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
