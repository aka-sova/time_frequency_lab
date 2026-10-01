/**
 * Analysis pipeline: spectra + measurements for an experiment. React-free;
 * the UI memoizes the individual stages.
 */
import type { AnalysisConfig, Experiment, SignalConfig, SpectrumKindSetting } from '@/types/signal';
import {
  detectCombLines,
  lineWidth,
  nullToNullBandwidth,
  occupiedBandwidth,
  rmsBandwidth,
  thresholdBandwidth,
  type Band,
  type CombLines,
  type SpectrumKind,
} from './bandwidth';
import { edgeTimes, fwhm, peakAbs, rms, rmsDuration, snrDb, type Crossing } from './measurements';
import { generateSignal, isTrain, type SignalResult } from './signals';
import { computeSpectrum, computeWelch, hilbertEnvelope, positiveHalf, type HalfSpectrum, type Spectrum } from './spectrum';

export interface Spectra {
  spectrum: Spectrum;
  half: HalfSpectrum;
  welch: Spectrum | null;
  single: Spectrum | null;
  singleHalf: HalfSpectrum | null;
  reference: Spectrum | null;
  segment: { start: number; end: number };
}

type SpectrumSettings = AnalysisConfig['spectrum'];
type Cursors = AnalysisConfig['cursors'];

/** Sample range analyzed by the FFT: the cursor interval when "FFT selection only" is on. */
export function analysisSegment(signal: SignalResult, selection: Cursors | null): { start: number; end: number } {
  if (selection && selection.enabled) {
    const lo = Math.min(selection.t1, selection.t2);
    const hi = Math.max(selection.t1, selection.t2);
    const start = Math.max(0, Math.min(signal.n - 8, Math.round(lo * signal.fs)));
    const end = Math.min(signal.n, Math.max(start + 8, Math.round(hi * signal.fs)));
    return { start, end };
  }
  return { start: 0, end: signal.n };
}

export function computeSpectra(signal: SignalResult, cfg: SignalConfig, sp: SpectrumSettings, selection: Cursors | null = null): Spectra {
  const seg = analysisSegment(signal, sp.fftSelection ? selection : null);
  const opts = { window: sp.window, zeroPad: sp.zeroPad, scaling: sp.scaling, ...seg };
  const spectrum = computeSpectrum(signal.x, signal.fs, opts);
  const train = isTrain(cfg) && signal.pulseCount > 1;
  const single = train ? computeSpectrum(signal.singlePulse, signal.fs, opts) : null;
  const welch =
    sp.display === 'psd' && sp.estimator === 'welch'
      ? computeWelch(signal.x.subarray(seg.start, seg.end), signal.fs, sp.welchSegments, sp.zeroPad, sp.scaling)
      : null;
  let reference: Spectrum | null = null;
  if (signal.reference) {
    const m = signal.reference.oversample;
    reference = computeSpectrum(signal.reference.x, signal.reference.fs, {
      window: sp.window,
      zeroPad: 1,
      scaling: sp.scaling,
      start: seg.start * m,
      end: seg.end * m,
    });
  }
  return {
    spectrum,
    half: positiveHalf(spectrum),
    welch,
    single,
    singleHalf: single ? positiveHalf(single) : null,
    reference,
    segment: seg,
  };
}

export function decideKind(cfg: SignalConfig, setting: SpectrumKindSetting, half: HalfSpectrum): SpectrumKind {
  if (setting !== 'auto') return setting;
  if (cfg.carrier.enabled || cfg.chirp.enabled) return 'bandpass';
  let peak = 0;
  for (let k = 0; k < half.mag.length; k++) peak = Math.max(peak, half.mag[k]);
  return half.mag[0] >= 0.5 * peak ? 'baseband' : 'bandpass';
}

export interface BandSet {
  bw3: Band;
  bw6: Band;
  bw10: Band;
  bw40: Band;
  obw90: Band;
  obw99: Band;
  nullToNull: Band;
  rms: { centroid: number; sigma: number };
  peakFrequency: number;
  peakMagnitude: number;
}

export function bandSet(h: HalfSpectrum, kind: SpectrumKind): BandSet {
  let p = 0;
  for (let k = 1; k < h.mag.length; k++) if (h.mag[k] > h.mag[p]) p = k;
  return {
    bw3: thresholdBandwidth(h.f, h.mag, 3, kind),
    bw6: thresholdBandwidth(h.f, h.mag, 6, kind),
    bw10: thresholdBandwidth(h.f, h.mag, 10, kind),
    bw40: thresholdBandwidth(h.f, h.mag, 40, kind),
    obw90: occupiedBandwidth(h.f, h.foldedPower, 0.9, kind),
    obw99: occupiedBandwidth(h.f, h.foldedPower, 0.99, kind),
    nullToNull: nullToNullBandwidth(h.f, h.mag, kind),
    rms: rmsBandwidth(h.f, h.foldedPower, kind),
    peakFrequency: h.f[p],
    peakMagnitude: h.mag[p],
  };
}

export interface TimeMeasurements {
  peak: number;
  rmsAmplitude: number;
  fwhm: Crossing;
  rise: number;
  fall: number;
  sigmaT: number;
  centroid: number;
  energy: number;
  cycles: number;
  duty: number;
}

export interface Uncertainty {
  sigmaT: number;
  sigmaF: number;
  product: number;
  /** product · 4π (1 for a Gaussian envelope). */
  normalized: number;
  source: 'single pulse' | 'record';
  /** False for continuous waves: σ_f is then limited by the DFT bin spacing, not by the waveform. */
  valid: boolean;
}

export interface Measurements {
  kind: SpectrumKind;
  full: BandSet;
  single: BandSet | null;
  time: TimeMeasurements;
  uncertainty: Uncertainty;
  comb: CombLines | null;
  /** −3 dB width of the strongest non-DC spectral line (pulse trains). */
  lineWidth: Band | null;
  binSpacing: number;
  recordBinSpacing: number;
  nyquist: number;
  observation: number;
  segmentDuration: number;
  fractionalBandwidth: number;
  tbp: { fwhm3dB: number; rms: number; fwhm99: number };
  gaussianReference: { fwhm3dB: number; rms: number; fwhm99: number };
  sqnrDb: number;
  snrDb: number;
}

/** Gaussian reference products for the definitions above (see README). */
export function gaussianReference(kind: SpectrumKind) {
  const sideFactor = kind === 'baseband' ? 1 : 2;
  return {
    fwhm3dB: 0.31203 * sideFactor,
    rms: 1 / (4 * Math.PI),
    fwhm99: 0.68262 * sideFactor,
  };
}

export function computeMeasurements(signal: SignalResult, cfg: SignalConfig, kindSetting: SpectrumKindSetting, sp: Spectra): Measurements {
  const train = sp.single !== null;
  const refWave = train ? signal.singlePulse : signal.xIdeal;
  const refHalf = sp.singleHalf ?? sp.half;
  const kind = decideKind(cfg, kindSetting, refHalf);
  const env = kind === 'bandpass' ? hilbertEnvelope(refWave) : Float64Array.from(refWave, Math.abs);

  const w = fwhm(signal.t, env);
  const edges = edgeTimes(signal.t, env);
  const rd = rmsDuration(signal.t, env);
  const carrierHz = signal.carrier.on ? signal.carrier.centerHz : NaN;

  // Uncertainty pair from the clean reference waveform (rectangular window, no padding).
  const uSpec = positiveHalf(computeSpectrum(refWave, signal.fs, { window: 'rect', zeroPad: 1, scaling: 'ft' }));
  const rb = rmsBandwidth(uSpec.f, uSpec.foldedPower, kind);
  const product = rd.sigma * rb.sigma;

  const full = bandSet(sp.half, kind);
  const single = sp.singleHalf ? bandSet(sp.singleHalf, kind) : null;
  const envBands = single ?? full;
  const comb =
    train && cfg.repetition.prfHz > 0 ? detectCombLines(sp.half.f, sp.half.mag, cfg.repetition.prfHz / 2, 20) : null;
  const center = kind === 'bandpass' ? (Number.isFinite(carrierHz) ? carrierHz : envBands.rms.centroid) : NaN;
  const segN = sp.segment.end - sp.segment.start;

  return {
    kind,
    full,
    single,
    time: {
      peak: peakAbs(signal.x),
      rmsAmplitude: rms(signal.x, sp.segment.start, sp.segment.end),
      fwhm: w,
      rise: edges.rise,
      fall: edges.fall,
      sigmaT: rd.sigma,
      centroid: rd.centroid,
      energy: rd.energy,
      cycles: w.valid && Number.isFinite(carrierHz) ? carrierHz * w.width : NaN,
      duty: train && w.valid ? w.width * cfg.repetition.prfHz : NaN,
    },
    uncertainty: {
      sigmaT: rd.sigma,
      sigmaF: rb.sigma,
      product,
      normalized: cfg.pulse.enabled ? product * 4 * Math.PI : NaN,
      source: train ? 'single pulse' : 'record',
      valid: cfg.pulse.enabled,
    },
    comb,
    lineWidth: train && cfg.repetition.prfHz > 0 ? lineWidth(sp.half.f, sp.half.mag, cfg.repetition.prfHz / 2) : null,
    binSpacing: sp.spectrum.binSpacing,
    recordBinSpacing: sp.spectrum.recordBinSpacing,
    nyquist: signal.fs / 2,
    observation: signal.observation,
    segmentDuration: segN / signal.fs,
    fractionalBandwidth: envBands.bw3.valid && center > 0 ? envBands.bw3.width / center : NaN,
    tbp: {
      fwhm3dB: w.valid && envBands.bw3.valid ? w.width * envBands.bw3.width : NaN,
      rms: cfg.pulse.enabled ? product : NaN,
      fwhm99: w.valid && envBands.obw99.valid ? w.width * envBands.obw99.width : NaN,
    },
    gaussianReference: gaussianReference(kind),
    sqnrDb: cfg.sampling.quantizationEnabled ? snrDb(signal.xIdeal, signal.x) : NaN,
    snrDb: cfg.noise.enabled ? snrDb(signal.xIdeal, signal.x) : NaN,
  };
}

/** Full analysis without time–frequency transforms (used by sweeps & mini charts). */
export function analyzeLight(exp: Experiment) {
  const signal = generateSignal(exp.signal);
  const spectra = computeSpectra(signal, exp.signal, exp.analysis.spectrum, exp.analysis.cursors);
  const measurements = computeMeasurements(signal, exp.signal, exp.analysis.spectrum.kind, spectra);
  return { signal, spectra, measurements };
}
