'use client';

import type { Measurements } from '@/lib/dsp/analyze';
import type { SignalResult } from '@/lib/dsp/signals';
import { formatEngineering, formatNumber } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';

function Cell({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <div className="min-w-[6rem] border-r border-line px-3 py-1.5 last:border-r-0" title={title}>
      <div className="text-[0.65625rem] uppercase tracking-wider text-muted">{k}</div>
      <div className="tabular font-mono text-[0.8125rem] text-ink">{v}</div>
    </div>
  );
}

/** Instrument-style summary. Every value is computed from the generated waveform. */
export default function MeasurementStrip({ signal, m }: { signal: SignalResult; m: Measurements }) {
  const { exp } = useLab();
  const s = exp.signal;
  const env = m.single ?? m.full;
  const cells: { k: string; v: string; title?: string }[] = [];
  if (signal.carrier.on) cells.push({ k: s.chirp.enabled ? 'f_c (chirp)' : 'f₀', v: formatEngineering(signal.carrier.centerHz, 'Hz', 4) });
  if (s.pulse.enabled) cells.push({ k: 'Pulse FWHM', v: m.time.fwhm.valid ? formatEngineering(m.time.fwhm.width, 's') : '—', title: 'Measured full width at half maximum of the (Hilbert) envelope' });
  if (signal.carrier.on && s.pulse.enabled) cells.push({ k: 'Cycles', v: formatNumber(m.time.cycles, 3), title: 'f₀ · τ_FWHM' });
  if (s.pulse.enabled && s.repetition.enabled) {
    cells.push({ k: 'PRF', v: formatEngineering(s.repetition.prfHz, 'Hz') });
    cells.push({ k: 'Comb Δf (meas.)', v: m.comb && Number.isFinite(m.comb.spacing) ? formatEngineering(m.comb.spacing, 'Hz') : '—', title: 'Median spacing of detected spectral lines' });
  }
  cells.push({ k: 'FFT Δf', v: formatEngineering(m.recordBinSpacing, 'Hz'), title: 'fₛ/N of the analyzed record — DFT bin spacing, not bandwidth' });
  cells.push({ k: 'Nyquist', v: formatEngineering(m.nyquist, 'Hz', 4) });
  cells.push({ k: `−3 dB BW${m.single ? ' (pulse)' : ''}`, v: env.bw3.valid ? formatEngineering(env.bw3.width, 'Hz') : '—', title: m.kind === 'baseband' ? 'Baseband: DC to −3 dB edge' : 'Between the −3 dB edges around the peak' });
  if (m.lineWidth) cells.push({ k: '−3 dB line width', v: m.lineWidth.valid ? formatEngineering(m.lineWidth.width, 'Hz') : '—', title: 'Contiguous −3 dB width around the strongest non-DC spectral line' });
  cells.push({ k: '99 % BW', v: env.obw99.valid ? formatEngineering(env.obw99.width, 'Hz') : '—' });
  cells.push({ k: 'τ·B₋₃dB', v: formatNumber(m.tbp.fwhm3dB, 3), title: 'FWHM duration × −3 dB bandwidth (definition-dependent constant)' });
  if (m.uncertainty.valid) cells.push({ k: '4π·σtσf', v: formatNumber(m.uncertainty.normalized, 3), title: '1 for a Gaussian envelope (minimum uncertainty)' });
  return (
    <div className="flex overflow-x-auto border-b border-line bg-panel thin-scroll" role="group" aria-label="Measurement summary">
      {cells.map((c) => (
        <Cell key={c.k} {...c} />
      ))}
    </div>
  );
}
