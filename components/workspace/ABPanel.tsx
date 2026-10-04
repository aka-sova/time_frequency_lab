'use client';

import type { Experiment } from '@/types/signal';
import type { Measurements } from '@/lib/dsp/analyze';
import type { SignalResult } from '@/lib/dsp/signals';
import { resolveSampling } from '@/lib/dsp/sampling';
import { formatEngineering, formatNumber } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import { SmallButton } from '@/components/controls/primitives';

interface Side {
  exp: Experiment;
  signal: SignalResult;
  measurements: Measurements;
}

type Item = { label: string; a: string; b: string };

function rows(A: Side, B: Side): Item[] {
  const fa = resolveSampling(A.exp.signal);
  const fb = resolveSampling(B.exp.signal);
  const env = (m: Measurements) => m.single ?? m.full;
  const hz = (v: number) => formatEngineering(v, 'Hz');
  const sec = (v: number) => formatEngineering(v, 's');
  const sA = A.exp.signal;
  const sB = B.exp.signal;
  const list: Item[] = [
    { label: 'Signal type', a: sA.signalType, b: sB.signalType },
    { label: 'Carrier', a: A.signal.carrier.on ? formatEngineering(A.signal.carrier.centerHz, 'Hz', 4) : 'off', b: B.signal.carrier.on ? formatEngineering(B.signal.carrier.centerHz, 'Hz', 4) : 'off' },
    { label: 'Envelope', a: sA.pulse.enabled ? sA.pulse.envelope : 'none', b: sB.pulse.enabled ? sB.pulse.envelope : 'none' },
    { label: 'Pulse width', a: sA.pulse.enabled ? sec(sA.pulse.widthSec) : '—', b: sB.pulse.enabled ? sec(sB.pulse.widthSec) : '—' },
    { label: 'Rise / fall', a: sA.pulse.edgesEnabled ? `${sec(sA.pulse.riseTimeSec)} / ${sec(sA.pulse.fallTimeSec)}` : 'ideal', b: sB.pulse.edgesEnabled ? `${sec(sB.pulse.riseTimeSec)} / ${sec(sB.pulse.fallTimeSec)}` : 'ideal' },
    { label: 'PRF', a: sA.repetition.enabled ? hz(sA.repetition.prfHz) : 'single pulse', b: sB.repetition.enabled ? hz(sB.repetition.prfHz) : 'single pulse' },
    { label: 'Pulses', a: String(A.signal.pulseCount), b: String(B.signal.pulseCount) },
    { label: 'Coherence', a: sA.coherence.mode, b: sB.coherence.mode },
    { label: 'Chirp', a: sA.chirp.enabled ? `${hz(sA.chirp.startFrequencyHz)} → ${hz(sA.chirp.endFrequencyHz)}` : 'off', b: sB.chirp.enabled ? `${hz(sB.chirp.startFrequencyHz)} → ${hz(sB.chirp.endFrequencyHz)}` : 'off' },
    { label: 'Sample rate', a: hz(fa.fs), b: hz(fb.fs) },
    { label: 'Samples N', a: String(fa.n), b: String(fb.n) },
    { label: 'FWHM (measured)', a: A.measurements.time.fwhm.valid ? sec(A.measurements.time.fwhm.width) : '—', b: B.measurements.time.fwhm.valid ? sec(B.measurements.time.fwhm.width) : '—' },
    { label: 'Carrier cycles', a: formatNumber(A.measurements.time.cycles, 3), b: formatNumber(B.measurements.time.cycles, 3) },
    { label: '−3 dB bandwidth', a: env(A.measurements).bw3.valid ? hz(env(A.measurements).bw3.width) : '—', b: env(B.measurements).bw3.valid ? hz(env(B.measurements).bw3.width) : '—' },
    { label: '99 % bandwidth', a: hz(env(A.measurements).obw99.width), b: hz(env(B.measurements).obw99.width) },
    { label: 'Fractional BW', a: `${formatNumber(A.measurements.fractionalBandwidth * 100, 3)} %`, b: `${formatNumber(B.measurements.fractionalBandwidth * 100, 3)} %` },
    { label: 'Spectral peak', a: hz(env(A.measurements).peakFrequency), b: hz(env(B.measurements).peakFrequency) },
    { label: 'σtσf · 4π', a: formatNumber(A.measurements.uncertainty.normalized, 3), b: formatNumber(B.measurements.uncertainty.normalized, 3) },
    { label: 'Comb spacing', a: A.measurements.comb ? hz(A.measurements.comb.spacing) : '—', b: B.measurements.comb ? hz(B.measurements.comb.spacing) : '—' },
  ];
  return list;
}

export default function ABPanel({ a, live, onSave, onClear, onSwap }: { a: Side | null; live: Side; onSave: () => void; onClear: () => void; onSwap: () => void }) {
  useLab();
  if (!a) {
    return (
      <div className="max-w-2xl text-[0.78125rem] text-ink-2">
        <p>
          Save the current configuration as <strong className="text-s5">A</strong>, then change parameters. The live configuration becomes <strong className="text-s1">B</strong>; both are overlaid in the time and
          frequency plots (A dotted) and every difference is listed here.
        </p>
        <div className="mt-3">
          <SmallButton onClick={onSave}>Save current as A</SmallButton>
        </div>
      </div>
    );
  }
  const list = rows(a, live);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <SmallButton onClick={onSave}>Replace A with current</SmallButton>
        <SmallButton onClick={onSwap}>Swap A ↔ B</SmallButton>
        <SmallButton onClick={onClear}>Clear A</SmallButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full max-w-3xl text-[0.75rem]">
          <thead>
            <tr className="border-b border-line text-[0.6875rem] text-muted">
              <th className="py-1 text-left font-normal">Quantity</th>
              <th className="py-1 text-left font-normal">A (saved, dotted)</th>
              <th className="py-1 text-left font-normal">B (live)</th>
              <th className="py-1 text-left font-normal">Change</th>
            </tr>
          </thead>
          <tbody className="tabular font-mono">
            {list.map((r) => {
              const same = r.a === r.b;
              return (
                <tr key={r.label} className="border-b border-line/50">
                  <td className="py-1 pr-3 font-sans text-ink-2">{r.label}</td>
                  <td className="py-1 pr-3 text-ink">{r.a}</td>
                  <td className="py-1 pr-3 text-ink">{r.b}</td>
                  <td className={`py-1 font-sans ${same ? 'text-muted' : 'text-ink'}`}>{same ? 'unchanged' : `${r.a} → ${r.b}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
