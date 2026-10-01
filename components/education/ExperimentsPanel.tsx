'use client';

import { FlaskConical } from 'lucide-react';
import { GUIDED_EXPERIMENTS } from '@/lib/education/experiments';
import { useLab } from '@/components/lab/context';

const DISCOVERIES = [
  ['τ ↓', 'B ↑'],
  ['t_r ↓', 'more high-frequency content'],
  ['f₀ ↑', 'spectrum moves in frequency'],
  ['PRF ↑', 'comb spacing increases'],
  ['T_burst ↑', 'individual spectral features narrow'],
  ['coherence loss', 'comb less sharply organized'],
  ['fₛ < 2f_max', 'aliasing'],
  ['T_obs ↑', 'Δf_DFT ↓'],
];

export default function ExperimentsPanel() {
  const lab = useLab();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <ol className="grid gap-2 md:grid-cols-2">
        {GUIDED_EXPERIMENTS.map((e, i) => (
          <li key={e.id} className="rounded-sm border border-line bg-surface p-3 text-[12.5px]">
            <div className="flex items-center gap-2">
              <span className="tabular font-mono text-[11px] text-muted">Experiment {i + 1}</span>
              <h3 className="font-semibold text-ink">{e.title}</h3>
            </div>
            <p className="mt-1 text-ink-2">{e.instruction}</p>
            <p className="mt-1 text-[11.5px] text-muted">Control: {e.control}</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-[11.5px] text-accent-strong">Expected observation</summary>
              <p className="mt-1 text-ink-2">{e.expected}</p>
            </details>
            <button
              type="button"
              onClick={() => {
                lab.applyPreset(e.preset);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="mt-2 inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[11.5px] text-ink-2 hover:text-ink"
            >
              <FlaskConical size={12} aria-hidden /> Load setup
            </button>
          </li>
        ))}
      </ol>
      <aside className="rounded-sm border border-line bg-surface p-3 text-[12.5px]">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">What you should discover</h3>
        <ul className="mt-2 space-y-1">
          {DISCOVERIES.map(([a, b]) => (
            <li key={a} className="flex gap-2">
              <span className="w-28 shrink-0 font-mono text-ink">{a}</span>
              <span className="text-ink-2">⇒ {b}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-2 text-ink">
          Short time localization ⇔ broad frequency content — a property of the waveform and of Fourier analysis, not an artifact of digital sampling.
        </p>
        <p className="mt-2 text-[11.5px] text-muted">Tip: use “Isolate” in a control section to reset unrelated parameters, and the lock icons to keep values fixed when switching presets.</p>
      </aside>
    </div>
  );
}
