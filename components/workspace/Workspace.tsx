'use client';

import type { Experiment } from '@/types/signal';
import type { Measurements, Spectra } from '@/lib/dsp/analyze';
import type { SignalResult } from '@/lib/dsp/signals';
import { useLab, type WorkspaceTab } from '@/components/lab/context';
import MeasurementsPanel from '@/components/measurements/MeasurementsPanel';
import ABPanel from './ABPanel';
import PowerPanel from './PowerPanel';
import InstrumentPanel from './InstrumentPanel';
import CompressionPanel from './CompressionPanel';
import SweepPanel from './SweepPanel';
import LeakagePanel from './LeakagePanel';
import SynthesisPanel from './SynthesisPanel';
import TheoryPanel from '@/components/education/TheoryPanel';
import ExperimentsPanel from '@/components/education/ExperimentsPanel';

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'measurements', label: 'Measurements' },
  { id: 'power', label: 'Power & energy' },
  { id: 'instrument', label: 'Instrument model' },
  { id: 'compression', label: 'Pulse compression' },
  { id: 'experiments', label: 'Guided experiments' },
  { id: 'ab', label: 'A/B compare' },
  { id: 'sweep', label: 'Parameter sweep' },
  { id: 'leakage', label: 'Leakage & windows' },
  { id: 'synthesis', label: 'Fourier synthesis' },
  { id: 'theory', label: 'Theory & math' },
];

interface Props {
  tab: WorkspaceTab;
  setTab: (t: WorkspaceTab) => void;
  signal: SignalResult;
  spectra: Spectra;
  measurements: Measurements;
  compare: { exp: Experiment; signal: SignalResult; measurements: Measurements } | null;
  onSaveA: () => void;
  onClearA: () => void;
  onSwapAB: () => void;
}

export default function Workspace({ tab, setTab, signal, measurements, compare, onSaveA, onClearA, onSwapAB }: Props) {
  const { exp } = useLab();
  return (
    <section className="border-t border-line" aria-label="Analysis workspace">
      <div role="tablist" aria-label="Workspace" className="flex overflow-x-auto border-b border-line bg-panel px-2 thin-scroll">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-[0.78125rem] ${tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink-2'}`}
          >
            {t.label}
            {t.id === 'ab' && compare ? <span className="ml-1 text-s5">●</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="p-4">
        {tab === 'measurements' ? <MeasurementsPanel signal={signal} m={measurements} /> : null}
        {tab === 'power' ? <PowerPanel signal={signal} /> : null}
        {tab === 'instrument' ? <InstrumentPanel signal={signal} /> : null}
        {tab === 'compression' ? <CompressionPanel signal={signal} /> : null}
        {tab === 'ab' ? <ABPanel a={compare} live={{ exp, signal, measurements }} onSave={onSaveA} onClear={onClearA} onSwap={onSwapAB} /> : null}
        {tab === 'sweep' ? <SweepPanel /> : null}
        {tab === 'leakage' ? <LeakagePanel /> : null}
        {tab === 'synthesis' ? <SynthesisPanel /> : null}
        {tab === 'theory' ? <TheoryPanel /> : null}
        {tab === 'experiments' ? <ExperimentsPanel /> : null}
      </div>
    </section>
  );
}
