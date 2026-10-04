/**
 * Presets are pure configuration data merged onto DEFAULT_EXPERIMENT.
 * Every preset respects Nyquist unless it is explicitly an aliasing
 * demonstration (checked by tests/presets.test.ts).
 */
import type { DeepPartial, Experiment } from '@/types/signal';

export type PresetCategory = 'Fundamentals' | 'Pulse trains' | 'Sampling & DFT' | 'Time–frequency' | 'UWB & bandwidth' | 'Power & energy' | 'Instrument model' | 'Experiments';

export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  experiment: DeepPartial<Experiment>;
  /** Fit the time/frequency view to the signal when the preset loads (default true unless a range is given). */
  fitTime?: boolean;
  fitFrequency?: boolean;
  /** Configuration loaded as the A side of an A/B comparison. */
  compareWith?: DeepPartial<Experiment>;
  /** Workspace tab to reveal. */
  tab?: 'measurements' | 'power' | 'instrument' | 'ab' | 'sweep' | 'leakage' | 'synthesis' | 'theory' | 'experiments';
  intentional?: 'aliasing';
}

const MANUAL = (fs: number, n: number) => ({ mode: 'manual' as const, sampleRateHz: fs, sampleCount: n });
const NO_TRAIN = { enabled: false };

const FWHM_05NS = 1.1774100225e-9; // FWHM of a Gaussian with σ = 0.5 ns
const GAUSS_V = {
  signalType: 'gaussian' as const,
  amplitude: 10,
  amplitudeUnit: 'V' as const,
  carrier: { enabled: false },
  pulse: { envelope: 'gaussian' as const, widthSec: FWHM_05NS },
  repetition: { enabled: false, prfHz: 100e3 },
  sampling: MANUAL(100e9, 4096),
};
const INSTRUMENT_SIGNAL = { ...GAUSS_V, amplitude: 1 };
const SPEC_2GHZ = { spectrum: { range: { mode: 'manual' as const, min: 0, max: 2e9 } } };

export const PRESETS: Preset[] = [
  {
    id: 'default',
    name: 'Default: 20 ns RF burst at 1 GHz',
    category: 'Fundamentals',
    description: 'Rectangular 20 ns burst of a 1 GHz carrier (≈ 20 cycles). The spectrum is a sinc envelope centered on f₀.',
    experiment: {},
  },
  {
    id: 'pure-sinusoid',
    name: 'Pure sinusoid',
    category: 'Fundamentals',
    description: 'An ideal narrowband signal. With an integer number of periods in the record, the DFT shows a single line.',
    experiment: {
      signal: { signalType: 'sinusoid', carrier: { enabled: true, frequencyHz: 10e6 }, pulse: { enabled: false }, repetition: NO_TRAIN, sampling: MANUAL(160e6, 4096) },
      analysis: { spectrum: { scaling: 'amplitude', zeroPad: 1, dbFloor: -80 } },
    },
  },
  {
    id: 'long-rf-burst',
    name: 'Long RF burst (200 ns)',
    category: 'Fundamentals',
    description: '200 carrier cycles: long duration in time → narrow spectral envelope (≈ 4.4 MHz at −3 dB).',
    experiment: { signal: { pulse: { envelope: 'rect', widthSec: 200e-9 }, sampling: MANUAL(10e9, 16384) } },
  },
  {
    id: 'short-rf-burst',
    name: 'Short RF burst (5 ns)',
    category: 'Fundamentals',
    description: 'Only 5 carrier cycles: the spectral envelope is ≈ 40× wider than the 200 ns burst.',
    experiment: { signal: { pulse: { envelope: 'rect', widthSec: 5e-9 }, sampling: MANUAL(10e9, 4096) } },
  },
  {
    id: 'single-rect',
    name: 'Single rectangular pulse',
    category: 'Fundamentals',
    description: 'Baseband rect(t/τ): X(f) = Aτ·sinc(fτ) with nulls at multiples of 1/τ.',
    experiment: {
      signal: { signalType: 'rect', carrier: { enabled: false }, pulse: { envelope: 'rect', widthSec: 20e-9 }, sampling: MANUAL(5e9, 4096) },
      analysis: { spectrum: { range: { mode: 'manual', min: 0, max: 300e6 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'gaussian-pulse',
    name: 'Gaussian pulse',
    category: 'Fundamentals',
    description: 'Gaussian in time ↔ Gaussian in frequency. No nulls, no sidelobes — the minimum-uncertainty shape.',
    experiment: {
      signal: { signalType: 'gaussian', carrier: { enabled: false }, pulse: { envelope: 'gaussian', widthSec: 10e-9 }, sampling: MANUAL(2e9, 4096) },
      analysis: { spectrum: { dbFloor: -80, range: { mode: 'manual', min: 0, max: 150e6 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'uwb-monocycle',
    name: 'Gaussian monocycle (UWB)',
    category: 'UWB & bandwidth',
    description: 'A 0.3 ns Gaussian monocycle. Extreme time localization → multi-GHz spectrum with no DC content.',
    experiment: {
      signal: {
        signalType: 'gaussian-derivative',
        carrier: { enabled: false },
        pulse: { envelope: 'gaussian-d1', widthSec: 0.3e-9 },
        sampling: MANUAL(40e9, 4096),
      },
      analysis: { spectrum: { range: { mode: 'manual', min: 0, max: 6e9 } }, stft: { windowLength: 32, nfft: 256 } },
    },
    fitFrequency: false,
  },
  {
    id: 'uwb-gaussian-50ohm',
    name: 'Gaussian UWB pulse: 10 V into 50 Ω',
    category: 'Power & energy',
    description: 'σ = 0.5 ns, 10 V peak: 2 W peak power, 1.77245 nJ per pulse, 177 µW average at 100 kHz. Power scales with V², energy with V²·σ.',
    experiment: { signal: GAUSS_V, analysis: { ...SPEC_2GHZ, load: { resistanceOhm: 50 } } },
    fitFrequency: false,
    tab: 'power',
  },
  {
    id: 'uwb-monocycle-power',
    name: 'Monocycle vs Gaussian: same peak, different energy',
    category: 'Power & energy',
    description: 'A bipolar monocycle with the same 10 V peak carries less energy and has zero net area (no DC). A side = the Gaussian of the previous preset.',
    experiment: {
      signal: { ...GAUSS_V, signalType: 'gaussian-derivative', pulse: { envelope: 'gaussian-d1', widthSec: FWHM_05NS } },
      analysis: { spectrum: { range: { mode: 'manual', min: 0, max: 4e9 } }, load: { resistanceOhm: 50 } },
    },
    compareWith: { signal: GAUSS_V },
    fitFrequency: false,
    tab: 'power',
  },
  {
    id: 'field-10vm-air',
    name: 'Field pulse: 10 V/m in free space',
    category: 'Power & energy',
    description: 'Peak power density E²/η₀ = 0.265 W/m² and fluence in J/m² for a Gaussian field pulse. Plane-wave, far-field relation only.',
    experiment: { signal: { ...GAUSS_V, amplitude: 10, amplitudeUnit: 'V/m' }, analysis: SPEC_2GHZ },
    fitFrequency: false,
    tab: 'power',
  },
  {
    id: 'prf-overlap-power',
    name: 'Average power when pulses overlap',
    category: 'Power & energy',
    description: 'Gaussian pulses repeated every 1 ns (PRF 1 GHz) overlap: amplitudes add before squaring, so average power is not E·PRF. See the average-power-vs-PRF chart.',
    experiment: {
      signal: { ...GAUSS_V, repetition: { enabled: true, prfHz: 1e9, pulseCount: 12 }, coherence: { mode: 'coherent', reference: 'pulse' } },
      analysis: { load: { resistanceOhm: 50 } },
    },
    tab: 'power',
  },
  {
    id: 'scope-bandwidth-limit',
    name: 'Instrument bandwidth too low (150 MHz)',
    category: 'Instrument model',
    description: 'A 0.5 ns-σ pulse seen through a 150 MHz single pole: the peak drops by about 42 % and the pulse looks about 1.6× wider. Sampling is not the limit here.',
    experiment: { signal: INSTRUMENT_SIGNAL, analysis: { instrument: { bandwidthHz: 0.15e9, sampleRateHz: 40e9, samplePhasePct: 25, triggerJitterRmsSec: 0, clipEnabled: false } } },
    fitFrequency: false,
    tab: 'instrument',
  },
  {
    id: 'scope-trigger-jitter',
    name: 'Trigger jitter in averaging (250 ps)',
    category: 'Instrument model',
    description: 'Averaging without time alignment convolves the pulse with the jitter distribution: σ_avg = √(σ² + σ_j²), peak × σ/σ_avg ≈ 0.894. Averaging does not remove jitter.',
    experiment: { signal: INSTRUMENT_SIGNAL, analysis: { instrument: { bandwidthHz: 5e9, sampleRateHz: 20e9, samplePhasePct: 25, triggerJitterRmsSec: 250e-12, clipEnabled: false } } },
    fitFrequency: false,
    tab: 'instrument',
  },
  {
    id: 'scope-undersampling',
    name: 'Too few samples across the pulse',
    category: 'Instrument model',
    description: 'A 5 GHz instrument sampling at 1 GS/s puts about one sample per FWHM. The peak read from samples depends on the sample phase; try sweeping it.',
    experiment: { signal: INSTRUMENT_SIGNAL, analysis: { instrument: { bandwidthHz: 5e9, sampleRateHz: 1e9, samplePhasePct: 0, triggerJitterRmsSec: 0, clipEnabled: false } } },
    fitFrequency: false,
    tab: 'instrument',
  },
  {
    id: 'scope-adc-clipping',
    name: 'ADC clipping flattens the peak',
    category: 'Instrument model',
    description: 'ADC full scale at 0.7 × the true peak: a flat top that looks like a flat pulse. The clip level is shown dashed.',
    experiment: { signal: INSTRUMENT_SIGNAL, analysis: { instrument: { bandwidthHz: 5e9, sampleRateHz: 40e9, samplePhasePct: 0, triggerJitterRmsSec: 0, clipEnabled: true, clipRatio: 0.7 } } },
    fitFrequency: false,
    tab: 'instrument',
  },
  {
    id: 'coherent-train',
    name: 'Coherent pulse train',
    category: 'Pulse trains',
    description: '12 coherent 20 ns bursts at PRF = 10 MHz. Energy organizes into lines spaced by PRF under the single-pulse envelope.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        repetition: { enabled: true, prfHz: 10e6, pulseCount: 12 },
        coherence: { mode: 'coherent', reference: 'continuous' },
        sampling: MANUAL(10e9, 16384),
      },
    },
  },
  {
    id: 'incoherent-train',
    name: 'Incoherent pulse train',
    category: 'Pulse trains',
    description: 'Same pulses, independent random phases. Lines dissolve; the average level follows the single-pulse envelope × √N.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        repetition: { enabled: true, prfHz: 10e6, pulseCount: 12 },
        coherence: { mode: 'incoherent' },
        sampling: MANUAL(10e9, 16384),
      },
    },
  },
  {
    id: 'prf-comb',
    name: 'PRF spectral comb (baseband)',
    category: 'Pulse trains',
    description: '32 baseband 10 ns pulses at 10 MHz PRF: sinc envelope (pulse width) sampled by a line comb (PRF).',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        carrier: { enabled: false },
        pulse: { envelope: 'rect', widthSec: 10e-9 },
        repetition: { enabled: true, prfHz: 10e6, pulseCount: 32 },
        sampling: MANUAL(2e9, 8192),
      },
      analysis: { spectrum: { range: { mode: 'manual', min: 0, max: 300e6 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'timing-jitter',
    name: 'Timing jitter',
    category: 'Pulse trains',
    description: '150 ps RMS timing jitter on pulse-locked bursts at 1 GHz: line energy leaks into a smeared floor that grows with frequency.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        repetition: { enabled: true, prfHz: 10e6, pulseCount: 12 },
        coherence: { mode: 'coherent', reference: 'pulse' },
        jitter: { timingEnabled: true, timingRmsSec: 150e-12, timingMode: 'random' },
        sampling: MANUAL(10e9, 16384),
      },
    },
  },
  {
    id: 'phase-jitter',
    name: 'Phase jitter (partial coherence)',
    category: 'Pulse trains',
    description: 'Gaussian pulse-to-pulse phase noise (σφ ≈ 34°). Comb lines lose contrast; pulse bandwidth is unchanged.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        repetition: { enabled: true, prfHz: 10e6, pulseCount: 12 },
        coherence: { mode: 'partial', phaseNoiseRmsRad: 0.6 },
        sampling: MANUAL(10e9, 16384),
      },
    },
  },
  {
    id: 'linear-chirp',
    name: 'Linear chirp',
    category: 'Time–frequency',
    description: '200 ns LFM pulse sweeping 0.5 → 1.5 GHz. TBP ≈ 200; the spectrogram shows the frequency ramp directly.',
    experiment: {
      signal: {
        signalType: 'chirp',
        pulse: { envelope: 'rect', widthSec: 200e-9 },
        chirp: { enabled: true, startFrequencyHz: 0.5e9, endFrequencyHz: 1.5e9 },
        sampling: MANUAL(10e9, 4096),
      },
      analysis: { time: { showInstFreq: true }, stft: { windowLength: 128, showInstFreq: true } },
    },
  },
  {
    id: 'aliasing',
    name: 'Aliasing example',
    category: 'Sampling & DFT',
    description: 'A 1.3 GHz burst sampled at 2 GS/s (Nyquist 1 GHz). The physical spectrum is unchanged; the samples misrepresent it as 0.7 GHz.',
    experiment: {
      signal: {
        carrier: { frequencyHz: 1.3e9 },
        pulse: { envelope: 'gaussian', widthSec: 40e-9 },
        sampling: { ...MANUAL(2e9, 1024), aliasingDemo: true },
      },
      analysis: {
        time: { showReference: true, showSamples: true, range: { mode: 'manual', min: 250e-9, max: 262e-9 } },
        spectrum: { range: { mode: 'manual', min: 0, max: 2.5e9 } },
      },
    },
    fitTime: false,
    fitFrequency: false,
    intentional: 'aliasing',
  },
  {
    id: 'spectral-leakage',
    name: 'Spectral leakage',
    category: 'Sampling & DFT',
    description: 'A tone exactly halfway between DFT bins (64.5 cycles per record). Compare windows in the Leakage tab.',
    experiment: {
      signal: { signalType: 'sinusoid', carrier: { enabled: true, frequencyHz: 10.078125e6 }, pulse: { enabled: false }, sampling: MANUAL(160e6, 1024) },
      analysis: { spectrum: { scaling: 'amplitude', zeroPad: 8, showRawBins: true, dbFloor: -100, range: { mode: 'manual', min: 8e6, max: 12e6 } } },
    },
    fitFrequency: false,
    tab: 'leakage',
  },
  {
    id: 'gaussian-uncertainty',
    name: 'Gaussian uncertainty',
    category: 'UWB & bandwidth',
    description: 'σt·σf = 1/(4π) is reached by the Gaussian. Change τ: σt and σf move inversely, the product stays at the bound.',
    experiment: {
      signal: { signalType: 'gaussian', carrier: { enabled: false }, pulse: { envelope: 'gaussian', widthSec: 5e-9 }, sampling: MANUAL(4e9, 4096) },
      analysis: { spectrum: { dbFloor: -100, range: { mode: 'manual', min: 0, max: 400e6 } } },
    },
    fitFrequency: false,
    tab: 'measurements',
  },
  {
    id: 'stft-resolution',
    name: 'STFT resolution',
    category: 'Time–frequency',
    description: 'A chirp analyzed with a long (205 ns) window: excellent Δf, poor Δt. Shorten the window and watch the trade.',
    experiment: {
      signal: {
        signalType: 'chirp',
        pulse: { envelope: 'rect', widthSec: 400e-9 },
        chirp: { enabled: true, startFrequencyHz: 0.2e9, endFrequencyHz: 0.8e9 },
        sampling: MANUAL(5e9, 4096),
      },
      analysis: { stft: { windowLength: 1024, nfft: 2048, overlapPct: 90 }, tfView: 'stft' },
    },
  },
  {
    id: 'wavelet',
    name: 'Wavelet example',
    category: 'Time–frequency',
    description: 'A train of monocycles analyzed with a Morlet CWT: sharp in time at high frequency, sharp in frequency at low frequency.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        carrier: { enabled: false },
        pulse: { envelope: 'gaussian-d1', widthSec: 0.5e-9 },
        repetition: { enabled: true, prfHz: 50e6, pulseCount: 8 },
        sampling: MANUAL(20e9, 4096),
      },
      analysis: {
        spectrum: { range: { mode: 'manual', min: 0, max: 4e9 } },
        cwt: { autoRange: false, fMinHz: 40e6, fMaxHz: 5e9, scales: 72 },
        tfView: 'cwt',
      },
    },
    fitFrequency: false,
  },
  {
    id: 'uwb-vs-narrowband',
    name: 'UWB vs narrowband (A/B)',
    category: 'UWB & bandwidth',
    description: 'A: 100-cycle 1 GHz burst (narrow fractional bandwidth). B: 0.25 ns monocycle (fractional bandwidth > 100 %). Normalized amplitudes.',
    experiment: {
      signal: {
        signalType: 'gaussian-derivative',
        carrier: { enabled: false },
        pulse: { envelope: 'gaussian-d1', widthSec: 0.25e-9 },
        sampling: MANUAL(40e9, 8192),
      },
      analysis: { spectrum: { display: 'db', range: { mode: 'manual', min: 0, max: 8e9 } }, time: { range: { mode: 'full', min: 0, max: 0 } } },
    },
    compareWith: {
      signal: { signalType: 'burst', carrier: { enabled: true, frequencyHz: 1e9 }, pulse: { envelope: 'rect', widthSec: 100e-9 }, sampling: MANUAL(40e9, 8192) },
    },
    fitTime: false,
    fitFrequency: false,
    tab: 'ab',
  },
  {
    id: 'few-cycle',
    name: 'Few-cycle pulse',
    category: 'UWB & bandwidth',
    description: '1.5 carrier cycles inside the FWHM: fractional bandwidth ≈ 60 %, the spectrum reaches toward DC.',
    experiment: {
      signal: { pulse: { envelope: 'gaussian', widthSec: 1.5e-9 }, sampling: MANUAL(20e9, 4096) },
      analysis: { spectrum: { range: { mode: 'manual', min: 0, max: 3e9 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'many-cycle',
    name: 'Many-cycle pulse',
    category: 'UWB & bandwidth',
    description: '100 cycles inside the FWHM: fractional bandwidth ≈ 0.9 %. Same carrier, far narrower spectrum.',
    experiment: { signal: { pulse: { envelope: 'gaussian', widthSec: 100e-9 }, sampling: MANUAL(10e9, 16384) } },
  },

  // Guided experiments (fixed sampling so that only the studied parameter changes the plots)
  {
    id: 'exp-pulse-width',
    name: 'Experiment: pulse width vs bandwidth',
    category: 'Experiments',
    description: 'Baseband Gaussian, fixed sampling and axes. Vary τ only: B ∝ 1/τ.',
    experiment: {
      signal: { signalType: 'gaussian', carrier: { enabled: false }, pulse: { envelope: 'gaussian', widthSec: 50e-9 }, sampling: MANUAL(1e9, 8192) },
      analysis: {
        time: { range: { mode: 'manual', min: 3.946e-6, max: 4.246e-6 } },
        spectrum: { range: { mode: 'manual', min: 0, max: 150e6 } },
      },
    },
    fitTime: false,
    fitFrequency: false,
    tab: 'measurements',
  },
  {
    id: 'exp-carrier',
    name: 'Experiment: carrier frequency vs bandwidth',
    category: 'Experiments',
    description: 'Gaussian 20 ns burst. Vary f₀ only: the envelope translates, its width stays the same.',
    experiment: {
      signal: { pulse: { envelope: 'gaussian', widthSec: 20e-9 }, sampling: MANUAL(10e9, 4096) },
      analysis: { spectrum: { range: { mode: 'manual', min: 0, max: 3e9 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'exp-prf',
    name: 'Experiment: PRF vs spectral comb',
    category: 'Experiments',
    description: 'Coherent train of 10 ns Gaussian bursts. Vary PRF: line spacing = PRF, envelope unchanged.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        pulse: { envelope: 'gaussian', widthSec: 10e-9 },
        repetition: { enabled: true, prfHz: 10e6, pulseCount: 16 },
        sampling: MANUAL(10e9, 32768),
      },
      analysis: { spectrum: { zeroPad: 2, range: { mode: 'manual', min: 0.85e9, max: 1.15e9 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'exp-coherence',
    name: 'Experiment: coherence vs spectral structure',
    category: 'Experiments',
    description: 'Identical pulses; switch coherence mode. The comb sharpness changes, the envelope does not.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        pulse: { envelope: 'gaussian', widthSec: 10e-9 },
        repetition: { enabled: true, prfHz: 20e6, pulseCount: 16 },
        sampling: MANUAL(10e9, 16384),
      },
      analysis: { spectrum: { range: { mode: 'manual', min: 0.85e9, max: 1.15e9 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'exp-pulse-count',
    name: 'Experiment: number of pulses vs line width',
    category: 'Experiments',
    description: 'PRF fixed at 10 MHz. Double N = 1, 2, 4 … 64: lines narrow as Δf_line ≈ 1/T_burst.',
    experiment: {
      signal: {
        signalType: 'pulse-train',
        carrier: { enabled: false },
        pulse: { envelope: 'gaussian', widthSec: 20e-9 },
        repetition: { enabled: true, prfHz: 10e6, pulseCount: 1 },
        sampling: MANUAL(1e9, 8192),
      },
      analysis: { spectrum: { zeroPad: 8, range: { mode: 'manual', min: 0, max: 35e6 } }, time: { range: { mode: 'full', min: 0, max: 0 } } },
    },
    fitFrequency: false,
    fitTime: false,
  },
  {
    id: 'exp-rise-time',
    name: 'Experiment: rise time vs high-frequency content',
    category: 'Experiments',
    description: '50 ns trapezoid with 10 ns edges. Make the edges faster: the high-frequency tail rises while the main lobe stays.',
    experiment: {
      signal: {
        signalType: 'rect',
        carrier: { enabled: false },
        pulse: { envelope: 'rect', widthSec: 50e-9, edgesEnabled: true, riseTimeSec: 10e-9, fallTimeSec: 10e-9 },
        sampling: MANUAL(5e9, 8192),
      },
      analysis: { spectrum: { dbFloor: -100, range: { mode: 'manual', min: 0, max: 1e9 } } },
    },
    fitFrequency: false,
  },
  {
    id: 'exp-undersample',
    name: 'Experiment: undersampling',
    category: 'Experiments',
    description: '1 GHz Gaussian burst with the physical reference shown. Lower fₛ below 2 GHz and watch the alias appear.',
    experiment: {
      signal: { pulse: { envelope: 'gaussian', widthSec: 20e-9 }, sampling: { ...MANUAL(10e9, 4096), aliasingDemo: true } },
      analysis: { time: { showReference: true, showSamples: true }, spectrum: { range: { mode: 'manual', min: 0, max: 2.5e9 } } },
    },
    fitFrequency: false,
    intentional: 'aliasing',
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export const PRESET_CATEGORIES: PresetCategory[] = ['Fundamentals', 'Pulse trains', 'UWB & bandwidth', 'Power & energy', 'Instrument model', 'Sampling & DFT', 'Time–frequency', 'Experiments'];
