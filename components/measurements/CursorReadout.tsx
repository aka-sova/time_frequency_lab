'use client';

import { useLab } from '@/components/lab/context';
import { EngineeringInput } from '@/components/controls/primitives';
import { formatEngineering, formatNumber } from '@/lib/units/format';

/** Readout and keyboard entry for the draggable measurement cursors. */
export default function CursorReadout() {
  const { exp, update } = useLab();
  const c = exp.analysis.cursors;
  if (!c.enabled) return null;
  const dt = Math.abs(c.t2 - c.t1);
  const df = Math.abs(c.f2 - c.f1);
  return (
    <div className="border-b border-line bg-panel px-4 py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12px]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">Cursors</span>
        <span className="text-muted">
          Δt = <span className="tabular font-mono text-ink">{formatEngineering(dt, 's')}</span>
        </span>
        <span className="text-muted">
          1/Δt = <span className="tabular font-mono text-ink">{formatEngineering(1 / dt, 'Hz')}</span>
        </span>
        <span className="text-muted">
          Δf = <span className="tabular font-mono text-ink">{formatEngineering(df, 'Hz')}</span>
        </span>
        <span className="text-muted">
          Δt·Δf = <span className="tabular font-mono text-ink">{formatNumber(dt * df, 4)}</span>
        </span>
        <span className="text-[11px] text-muted">Drag the yellow lines (click one to activate it) or type values below.</span>
        <button type="button" className="ml-auto text-[11px] text-muted underline hover:text-ink" onClick={() => update('analysis.cursors.enabled', false)}>
          Hide cursors
        </button>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-4">
        <EngineeringInput label="t₁" path="analysis.cursors.t1" kind="time" min={0} max={Math.max(c.t1, c.t2, 1e-9) * 2} log={false} lock={false} hardMin={0} />
        <EngineeringInput label="t₂" path="analysis.cursors.t2" kind="time" min={0} max={Math.max(c.t1, c.t2, 1e-9) * 2} log={false} lock={false} hardMin={0} />
        <EngineeringInput label="f₁" path="analysis.cursors.f1" kind="freq" min={0} max={Math.max(c.f1, c.f2, 1) * 2} log={false} lock={false} hardMin={-1e12} />
        <EngineeringInput label="f₂" path="analysis.cursors.f2" kind="freq" min={0} max={Math.max(c.f1, c.f2, 1) * 2} log={false} lock={false} hardMin={-1e12} />
      </div>
    </div>
  );
}
