import type { AnalysisConfig, SignalConfig } from '@/types/signal';
import type { Measurements } from './analyze';
import { codeChipSec, estimateSpectralExtent, pulseDuration } from './sampling';
import { isTrain, type SignalResult } from './signals';
import { cwtCost } from './wavelet';
import { stftCost } from './stft';
import { formatEngineering } from '@/lib/units/format';

export type WarningLevel = 'warning' | 'info';
export type WarningFix = 'fix-sampling' | 'extend-observation' | 'enable-carrier';

export interface LabWarning {
  id: string;
  level: WarningLevel;
  title: string;
  detail: string;
  fix?: WarningFix;
}

export const HEAVY_COST = 2.5e7;

export function collectWarnings(
  cfg: SignalConfig,
  a: AnalysisConfig,
  sig: SignalResult,
  m: Measurements,
  tfVisible: { stft: boolean; cwt: boolean },
): LabWarning[] {
  const out: LabWarning[] = [];
  const ext = estimateSpectralExtent(cfg);
  const nyq = sig.fs / 2;
  const fmt = (v: number, u: string) => formatEngineering(v, u);

  if (ext.carrierMaxHz > nyq) {
    out.push({
      id: 'nyquist-carrier',
      level: 'warning',
      title: 'Carrier exceeds the Nyquist frequency — aliasing will occur.',
      detail: `Highest carrier/instantaneous frequency ${fmt(ext.carrierMaxHz, 'Hz')} > f_N = ${fmt(nyq, 'Hz')}. The physical spectrum is unchanged; the samples cannot represent it.`,
      fix: cfg.sampling.aliasingDemo ? undefined : 'fix-sampling',
    });
  } else if (ext.fMaxHz > nyq) {
    out.push({
      id: 'nyquist-content',
      level: cfg.sampling.aliasingDemo ? 'info' : 'warning',
      title: 'Spectral content exceeds the Nyquist frequency — aliasing will occur.',
      detail: `Estimated significant content up to ≈ ${fmt(ext.fMaxHz, 'Hz')} > f_N = ${fmt(nyq, 'Hz')}.`,
      fix: cfg.sampling.aliasingDemo ? undefined : 'fix-sampling',
    });
  } else if (ext.unbounded && cfg.pulse.enabled) {
    out.push({
      id: 'unbounded',
      level: 'info',
      title: 'Ideal discontinuities have unbounded spectral support.',
      detail: 'Some aliasing of the slowly decaying spectral tails is unavoidable for any fₛ. Enable finite rise/fall times or a tapered envelope for a band-limited pulse.',
    });
  }

  if (cfg.pulse.enabled) {
    const half = pulseDuration(cfg) / 2;
    const cut = sig.pulses.filter((p) => p.tCenter - half < 0 || p.tCenter + half > sig.observation).length;
    if (cut > 0)
      out.push({
        id: 'truncated',
        level: 'warning',
        title: `${cut} pulse${cut > 1 ? 's are' : ' is'} truncated by the observation window.`,
        detail: 'The analyzed record cuts the waveform, which adds spectral content that is not part of the pulse. Extend the observation duration.',
        fix: 'extend-observation',
      });
  }

  if (isTrain(cfg)) {
    const inside = sig.pulses.filter((p) => p.tCenter >= 0 && p.tCenter <= sig.observation).length;
    if (inside < 2 && cfg.repetition.pulseCount >= 2)
      out.push({
        id: 'few-pulses',
        level: 'warning',
        title: 'The observation window contains fewer than two pulses.',
        detail: 'PRF structure cannot be meaningfully resolved.',
        fix: 'extend-observation',
      });
    if (m.recordBinSpacing > cfg.repetition.prfHz / 3)
      out.push({
        id: 'bin-vs-prf',
        level: 'warning',
        title: 'FFT bin spacing is larger than the expected spectral feature.',
        detail: `Δf = fₛ/N = ${fmt(m.recordBinSpacing, 'Hz')} vs PRF = ${fmt(cfg.repetition.prfHz, 'Hz')}. Increase the observation duration.`,
        fix: 'extend-observation',
      });
    if (cfg.pulse.widthSec * cfg.repetition.prfHz > 1)
      out.push({
        id: 'overlap',
        level: 'info',
        title: 'Pulses overlap (τ·PRF > 1).',
        detail: 'Adjacent pulses add; the duty cycle exceeds 100 %.',
      });
  } else if (cfg.pulse.enabled) {
    const chirpBw = cfg.chirp.enabled ? Math.abs(cfg.chirp.endFrequencyHz - cfg.chirp.startFrequencyHz) : 0;
    const b = Math.max(1 / Math.max(cfg.pulse.widthSec, 1e-15), chirpBw);
    if (m.recordBinSpacing > b / 4)
      out.push({
        id: 'bin-vs-pulse',
        level: 'warning',
        title: 'FFT bin spacing is coarse relative to the pulse bandwidth.',
        detail: `Δf = ${fmt(m.recordBinSpacing, 'Hz')} vs expected bandwidth ≈ ${fmt(b, 'Hz')}. Increase the observation duration for a well-resolved spectrum.`,
        fix: 'extend-observation',
      });
  }

  if (cfg.code.enabled && cfg.pulse.enabled) {
    const perChip = sig.fs * codeChipSec(cfg);
    if (perChip < 4)
      out.push({
        id: 'code-chip-samples',
        level: 'warning',
        title: 'Fewer than 4 samples per code chip.',
        detail: `T_c = ${fmt(codeChipSec(cfg), 's')} holds ${perChip.toFixed(1)} samples at fₛ = ${fmt(sig.fs, 'Hz')}; the phase steps are not resolved.`,
        fix: 'fix-sampling',
      });
    if (cfg.code.family !== 'barker' && !cfg.carrier.enabled && !cfg.chirp.enabled)
      out.push({
        id: 'code-polyphase-baseband',
        level: 'warning',
        title: 'A polyphase code needs a carrier.',
        detail: 'Without a carrier the real waveform is a·cos φ_code — an amplitude pattern, not a phase code. Binary (Barker) codes work at baseband.',
        fix: 'enable-carrier',
      });
  }

  if (cfg.repetition.enabled && !cfg.pulse.enabled)
    out.push({ id: 'train-no-pulse', level: 'info', title: 'Pulse train requires a pulse envelope.', detail: 'Enable the pulse envelope to repeat it.' });

  if (cfg.pulse.enabled && cfg.pulse.envelope === 'rect' && cfg.pulse.edgesEnabled) {
    const r = (cfg.pulse.riseTimeSec + cfg.pulse.fallTimeSec) / (2 * 0.8);
    if (r > cfg.pulse.widthSec)
      out.push({ id: 'edges-long', level: 'info', title: 'Edges longer than the pulse width.', detail: 'The ramps overlap: the pulse becomes triangular and never reaches full amplitude.' });
  }

  if (tfVisible.stft && stftCost(sig.n, a.stft) > HEAVY_COST)
    out.push({ id: 'stft-cost', level: 'info', title: 'This STFT configuration requires substantial computation.', detail: 'Frame count is limited automatically; consider less overlap or a shorter record.' });
  if (tfVisible.cwt && cwtCost(sig.n, a.cwt.scales) > HEAVY_COST)
    out.push({ id: 'cwt-cost', level: 'info', title: 'This CWT configuration requires substantial computation.', detail: 'Reduce the number of scales or the record length for faster updates.' });

  return out;
}
