/**
 * Typed experiment configuration. All physical quantities are stored in SI
 * units (seconds, hertz, radians, volts / normalized amplitude). Display
 * units are chosen at render time.
 */

export type SignalType =
  | 'sinusoid'
  | 'rect'
  | 'gaussian'
  | 'gaussian-derivative'
  | 'burst'
  | 'pulse-train'
  | 'chirp'
  | 'phase-code'
  | 'composite';

export type EnvelopeType =
  | 'rect'
  | 'gaussian'
  | 'gaussian-d1'
  | 'gaussian-d2'
  | 'hann'
  | 'hamming'
  | 'blackman'
  | 'tukey';

export type EdgeShape = 'linear' | 'cosine';

export type CoherenceMode = 'coherent' | 'increment' | 'partial' | 'incoherent';

/**
 * 'continuous': gated CW — the carrier phase is referenced to absolute time
 *   (phi_n = phi0 + 2*pi*f0*t_n), so lines fall at f0 + k*PRF.
 * 'pulse': every pulse is an identical copy referenced to its own center
 *   (phi_n = phi0), so lines fall at k*PRF.
 */
export type CarrierReference = 'continuous' | 'pulse';

export type AmplitudeVariation = 'none' | 'ramp' | 'alternating';

export type JitterMode = 'random' | 'periodic';

export type SamplingMode = 'auto' | 'manual';

export type AmplitudeUnit = 'normalized' | 'V' | 'V/m';

export type CodeFamily = 'barker' | 'frank' | 'p4';

export interface SignalConfig {
  signalType: SignalType;
  amplitude: number;
  amplitudeUnit: AmplitudeUnit;

  carrier: {
    enabled: boolean;
    frequencyHz: number;
    phaseRad: number;
  };

  pulse: {
    enabled: boolean;
    envelope: EnvelopeType;
    /** Rect/trapezoid: 50 % width. Gaussian family: FWHM of the Gaussian. Windows: full support. */
    widthSec: number;
    autoCenter: boolean;
    centerSec: number;
    edgesEnabled: boolean;
    edgeShape: EdgeShape;
    /** 10–90 % rise time. */
    riseTimeSec: number;
    /** 90–10 % fall time. */
    fallTimeSec: number;
    tukeyAlpha: number;
  };

  repetition: {
    enabled: boolean;
    prfHz: number;
    pulseCount: number;
    amplitudeVariation: AmplitudeVariation;
    amplitudeVariationDepth: number;
  };

  coherence: {
    mode: CoherenceMode;
    reference: CarrierReference;
    phaseIncrementRad: number;
    phaseNoiseRmsRad: number;
  };

  jitter: {
    timingEnabled: boolean;
    timingRmsSec: number;
    timingMode: JitterMode;
    /** Period (in pulses) of deterministic sinusoidal jitter. */
    timingPeriodPulses: number;
    amplitudeEnabled: boolean;
    amplitudeRms: number;
    frequencyEnabled: boolean;
    frequencyRmsHz: number;
    seed: number;
  };

  chirp: {
    enabled: boolean;
    startFrequencyHz: number;
    endFrequencyHz: number;
  };

  /** Phase code across each pulse: L chips of T_c = τ/L (lib/dsp/codes.ts). */
  code: {
    enabled: boolean;
    family: CodeFamily;
    /** Number of chips L (snapped to a valid length for the family). */
    length: number;
  };

  am: {
    enabled: boolean;
    depth: number;
    frequencyHz: number;
  };

  noise: {
    enabled: boolean;
    rms: number;
  };

  sampling: {
    mode: SamplingMode;
    sampleRateHz: number;
    sampleCount: number;
    quantizationEnabled: boolean;
    bits: number;
    aliasingDemo: boolean;
  };
}

export type SpectrumDisplay = 'magnitude' | 'normalized' | 'db' | 'power' | 'psd';
export type SpectrumScaling = 'ft' | 'amplitude';
export type Sidedness = 'one' | 'two';
export type SpectrumKindSetting = 'auto' | 'baseband' | 'bandpass';
export type PsdEstimator = 'periodogram' | 'welch';
export type AnalysisWindow =
  | 'rect'
  | 'hann'
  | 'hamming'
  | 'blackman'
  | 'blackman-harris'
  | 'flattop';
export type WaveletType = 'morlet' | 'mexican-hat';
export type TfView = 'stft' | 'cwt' | 'compare';
export type PhaseUnit = 'deg' | 'rad';

export interface AxisRange {
  mode: 'full' | 'manual';
  min: number;
  max: number;
}

export interface AnalysisConfig {
  phaseUnit: PhaseUnit;
  time: {
    range: AxisRange;
    showEnvelope: boolean;
    showSamples: boolean;
    showReference: boolean;
    showMarkers: boolean;
    showInstFreq: boolean;
  };
  spectrum: {
    display: SpectrumDisplay;
    powerDb: boolean;
    scaling: SpectrumScaling;
    sided: Sidedness;
    centered: boolean;
    logFrequency: boolean;
    window: AnalysisWindow;
    zeroPad: number;
    dbFloor: number;
    range: AxisRange;
    showSinglePulse: boolean;
    showRawBins: boolean;
    showBandMarkers: boolean;
    showNyquist: boolean;
    showPhase: boolean;
    phaseUnwrap: boolean;
    phaseReference: 'center' | 'start';
    fftSelection: boolean;
    estimator: PsdEstimator;
    welchSegments: number;
    kind: SpectrumKindSetting;
  };
  cursors: {
    enabled: boolean;
    t1: number;
    t2: number;
    f1: number;
    f2: number;
  };
  stft: {
    enabled: boolean;
    windowLength: number;
    overlapPct: number;
    nfft: number;
    window: AnalysisWindow;
    dbRange: number;
    logFrequency: boolean;
    showInstFreq: boolean;
  };
  cwt: {
    wavelet: WaveletType;
    omega0: number;
    autoRange: boolean;
    fMinHz: number;
    fMaxHz: number;
    scales: number;
    dbRange: number;
  };
  /** Frequency axis of the time–frequency panel (STFT / CWT), independent of the spectrum view. */
  tfRange: AxisRange;
  tfView: TfView;
  /** Load used to turn volts into watts (amplitudeUnit 'V'). Free space uses η₀ and ignores this. */
  load: {
    resistanceOhm: number;
  };
  /** Measurement-instrument model (Instrument tab). */
  instrument: {
    bandwidthHz: number;
    sampleRateHz: number;
    /** Offset of the first sample, % of the sample period. */
    samplePhasePct: number;
    triggerJitterRmsSec: number;
    clipEnabled: boolean;
    /** ADC full scale ÷ true peak amplitude. */
    clipRatio: number;
  };
}

export interface Experiment {
  signal: SignalConfig;
  analysis: AnalysisConfig;
}

export type UiMode = 'basic' | 'advanced' | 'expert';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
