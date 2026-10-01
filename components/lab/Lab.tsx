'use client';

import { useCallback, useMemo } from 'react';
import { LabContext } from './context';
import { useLabState } from './useLabState';
import Header from '@/components/layout/Header';
import ControlPanel from '@/components/controls/ControlPanel';
import TimePlot from '@/components/plots/TimePlot';
import SpectrumPlot from '@/components/plots/SpectrumPlot';
import PhasePlot from '@/components/plots/PhasePlot';
import TimeFrequencyPanel from '@/components/plots/TimeFrequencyPanel';
import { SpectrumToolbar, TimeToolbar } from '@/components/plots/Toolbars';
import MeasurementStrip from '@/components/measurements/MeasurementStrip';
import CursorReadout from '@/components/measurements/CursorReadout';
import StatusBar from '@/components/education/StatusBar';
import Workspace from '@/components/workspace/Workspace';
import ErrorBoundary from '@/components/layout/ErrorBoundary';
import { generateSignal } from '@/lib/dsp/signals';
import { computeMeasurements, computeSpectra } from '@/lib/dsp/analyze';
import { collectWarnings, type LabWarning } from '@/lib/dsp/warnings';
import { autoSampling, MAX_SAMPLES, resolveSampling } from '@/lib/dsp/sampling';
import { experimentToQuery } from '@/lib/state/url';
import { sanitizeExperiment } from '@/lib/state/sanitize';
import { download, experimentJson, spectrumCsv, waveformCsv } from '@/lib/export';
import { nextPowerOfTwo } from '@/lib/dsp/fft';
import type { Experiment } from '@/types/signal';

const STATEMENT =
  'A signal cannot be arbitrarily localized in both time and frequency. Short temporal structures require a wider range of Fourier components. Carrier frequency determines where spectral energy is centered, while envelope shape and time scale largely determine how widely that energy is distributed.';

function useAnalysis(exp: Experiment | null) {
  const signalCfg = exp?.signal ?? null;
  const needRef = Boolean(signalCfg && (signalCfg.sampling.aliasingDemo || exp?.analysis.time.showReference));
  const signal = useMemo(() => (signalCfg ? generateSignal(signalCfg, { reference: needRef }) : null), [signalCfg, needRef]);
  const sp = exp?.analysis.spectrum ?? null;
  const selection = exp && sp?.fftSelection ? exp.analysis.cursors : null;
  const spectra = useMemo(() => (signal && signalCfg && sp ? computeSpectra(signal, signalCfg, sp, selection) : null), [signal, signalCfg, sp, selection]);
  const kind = sp?.kind ?? 'auto';
  const measurements = useMemo(() => (signal && signalCfg && spectra ? computeMeasurements(signal, signalCfg, kind, spectra) : null), [signal, signalCfg, spectra, kind]);
  return { signal, spectra, measurements };
}

export default function Lab() {
  const st = useLabState();
  const { exp, api } = st;
  const { signal, spectra, measurements } = useAnalysis(exp);
  const compareExp = useMemo(() => (st.compare ? { signal: st.compare.signal, analysis: exp.analysis } : null), [st.compare, exp.analysis]);
  const cmp = useAnalysis(compareExp);

  const tfVisible = { stft: exp.analysis.tfView !== 'cwt', cwt: exp.analysis.tfView !== 'stft' };
  const warnings = useMemo(
    () => (signal && measurements ? collectWarnings(exp.signal, exp.analysis, signal, measurements, tfVisible) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signal, measurements, exp.signal, exp.analysis, tfVisible.stft, tfVisible.cwt],
  );

  const onFix = useCallback(
    (w: LabWarning) => {
      const s = exp.signal;
      if (w.fix === 'fix-sampling') {
        const a = autoSampling(s);
        api.updateMany([
          ['signal.sampling.sampleRateHz', a.sampleRateHz],
          ['signal.sampling.sampleCount', a.sampleCount],
          ['signal.sampling.aliasingDemo', false],
        ]);
      } else if (w.fix === 'extend-observation') {
        const { fs, n } = resolveSampling(s);
        const span = s.repetition.enabled ? (s.repetition.pulseCount + 1) / s.repetition.prfHz : 0;
        const need = Math.max(2 * n, Math.ceil((span + 16 * s.pulse.widthSec) * fs), 4 * Math.ceil(fs / Math.max(s.repetition.prfHz, 1)));
        api.updateMany([
          ['signal.sampling.sampleRateHz', fs],
          ['signal.sampling.sampleCount', Math.min(MAX_SAMPLES, nextPowerOfTwo(need))],
        ]);
      }
    },
    [api, exp.signal],
  );

  const onExport = useCallback(
    (what: 'waveform' | 'spectrum' | 'json') => {
      if (what === 'json') return download('time-frequency-experiment.json', experimentJson(exp, st.presetId), 'application/json');
      if (!signal || !spectra) return;
      if (what === 'waveform') download('waveform.csv', waveformCsv(signal, exp.signal.amplitudeUnit), 'text/csv');
      else {
        const tRef = exp.signal.pulse.enabled ? (signal.pulses[Math.floor(signal.pulses.length / 2)]?.tCenter ?? 0) : 0;
        download('spectrum.csv', spectrumCsv(spectra.spectrum, tRef, exp.signal.amplitudeUnit), 'text/csv');
      }
    },
    [exp, signal, spectra, st.presetId],
  );

  const onImport = useCallback(
    (file: File) => {
      file
        .text()
        .then((txt) => {
          const raw = JSON.parse(txt);
          const e = sanitizeExperiment(raw?.experiment ?? raw);
          st.loadExperiment(e);
          st.setExplanation({ title: 'Configuration imported', text: `Loaded ${file.name}. Values were validated and clamped to supported ranges.` });
        })
        .catch(() => st.setExplanation({ title: 'Import failed', text: 'The file is not a valid Time–Frequency Lab configuration (JSON).' }));
    },
    [st],
  );

  const onCopyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?${experimentToQuery(exp, st.presetId, st.mode)}`;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      window.prompt('Copy this experiment link:', url);
      return false;
    }
  }, [exp, st.presetId, st.mode]);

  if (!signal || !spectra || !measurements) return null;

  return (
    <LabContext.Provider value={api}>
      <div className="min-h-screen">
        <Header
          mode={st.mode}
          setMode={st.setMode}
          presetId={st.presetId}
          onPreset={api.applyPreset}
          hasA={st.compare !== null}
          onSaveA={() => {
            st.setCompare(exp);
            st.setTab('ab');
            st.setExplanation({ title: 'Saved as A', text: 'Now modify parameters: plots overlay A (dotted) and the live configuration B. The A/B tab lists the differences.' });
          }}
          onClearA={() => st.setCompare(null)}
          onCopyLink={onCopyLink}
          onExport={onExport}
          onImport={onImport}
          onResetExperiment={st.resetExperiment}
          onResetPreset={st.resetToPreset}
          undoLabel={st.undo?.label ?? null}
          onUndo={st.doUndo}
        />
        <main className="grid lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* On desktop the controls take the height of the plot column (absolute inner scroller),
              so they never stretch the grid row and leave a gap under the spectrum. */}
          <aside className="relative order-2 border-r border-line bg-panel lg:order-1" aria-label="Signal configuration">
            <div className="thin-scroll lg:absolute lg:inset-0 lg:overflow-y-auto">
              <ControlPanel />
            </div>
          </aside>
          <section className="order-1 min-w-0 lg:order-2" aria-label="Visualization">
            <StatusBar explanation={st.explanation} onDismiss={() => st.setExplanation(null)} warnings={warnings} onFix={onFix} />
            <MeasurementStrip signal={signal} m={measurements} />
            <CursorReadout />
            <div className="border-b border-line">
              <TimeToolbar />
              <div className="px-2">
                <ErrorBoundary label="Time-domain plot" resetKey={exp}>
                  <TimePlot signal={signal} compare={cmp.signal} height={290} />
                </ErrorBoundary>
              </div>
            </div>
            <div className="border-b border-line">
              <SpectrumToolbar m={measurements} />
              <div className="px-2">
                <ErrorBoundary label="Spectrum plot" resetKey={exp}>
                  <SpectrumPlot signal={signal} spectra={spectra} measurements={measurements} compare={cmp.spectra} height={310} />
                  {exp.analysis.spectrum.showPhase ? <PhasePlot signal={signal} spectra={spectra} height={190} /> : null}
                </ErrorBoundary>
              </div>
            </div>
          </section>
        </main>
        <ErrorBoundary label="Time–frequency panel" resetKey={exp}>
          <TimeFrequencyPanel signal={signal} spectra={spectra} />
        </ErrorBoundary>
        <ErrorBoundary label="Workspace" resetKey={exp}>
        <Workspace
          tab={st.tab}
          setTab={st.setTab}
          signal={signal}
          spectra={spectra}
          measurements={measurements}
          compare={st.compare && cmp.measurements && cmp.signal ? { exp: st.compare, signal: cmp.signal, measurements: cmp.measurements } : null}
          onSaveA={() => st.setCompare(exp)}
          onClearA={() => st.setCompare(null)}
          onSwapAB={() => {
            if (!st.compare) return;
            const a = st.compare;
            st.setCompare(exp);
            st.loadExperiment(a);
          }}
        />
        </ErrorBoundary>
        <footer className="border-t border-line bg-panel px-4 py-5">
          <p className="mx-auto max-w-4xl text-center text-[13px] leading-relaxed text-ink-2">{STATEMENT}</p>
          <p className="mt-2 text-center text-[11px] text-muted">
            Educational DSP/RF visualization — normalized amplitudes; not an operational effects simulator. All values are computed in your browser from the generated waveform.
          </p>
        </footer>
      </div>
    </LabContext.Provider>
  );
}
