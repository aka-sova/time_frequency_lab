/**
 * Context-sensitive one-line explanations, chosen from the parameter that
 * just changed and the direction of the change.
 */
export interface Explanation {
  title: string;
  text: string;
  /** Optional button shown with the message (e.g. “Back to Basic” after an automatic mode switch). */
  action?: { label: string; run: () => void };
}

type Dir = 'up' | 'down' | 'set';

export function explainChange(path: string, prev: unknown, next: unknown, ctx: { nyquistOk: boolean }): Explanation | null {
  const dir: Dir = typeof prev === 'number' && typeof next === 'number' ? (next > prev ? 'up' : next < prev ? 'down' : 'set') : 'set';
  const p = path.replace(/^signal\./, '').replace(/^analysis\./, '');
  switch (p) {
    case 'pulse.widthSec':
      return dir === 'down'
        ? { title: 'Pulse width ↓', text: 'Shortening the pulse increases the range of Fourier components required to reproduce its rapid temporal localization: the spectrum broadens as 1/τ.' }
        : { title: 'Pulse width ↑', text: 'A longer pulse is less localized in time, so fewer frequencies are needed: the spectral envelope narrows as 1/τ.' };
    case 'pulse.riseTimeSec':
    case 'pulse.fallTimeSec':
      return dir === 'down'
        ? { title: 'Faster edge', text: 'Faster edges require higher-frequency components. The main lobe (set by τ) barely changes; the high-frequency tail rises (B_edge ∝ 1/t_r).' }
        : { title: 'Slower edge', text: 'Slower edges suppress high-frequency content: the spectral tail drops while the main lobe, set by the pulse width, stays similar.' };
    case 'pulse.edgesEnabled':
      return { title: 'Edge model', text: 'An ideal step has infinitely fast edges and spectral tails decaying only as 1/f. Finite rise/fall times band-limit the pulse.' };
    case 'pulse.envelope':
      return { title: 'Envelope shape', text: 'Envelope shape controls how energy is distributed: abrupt shapes give narrow main lobes with strong sidelobes; smooth shapes give low sidelobes and wider main lobes.' };
    case 'carrier.frequencyHz':
      return { title: 'Carrier frequency', text: 'Carrier frequency translates the spectrum around f₀; the envelope width remains controlled primarily by the modulation/envelope.' };
    case 'carrier.phaseRad':
      return { title: 'Phase', text: 'The carrier phase shifts the oscillation under the envelope. It changes the spectral phase but not the magnitude spectrum (except when ±f₀ images overlap).' };
    case 'carrier.enabled':
      return next
        ? { title: 'Carrier on', text: 'Multiplying by cos(2πf₀t) shifts the baseband envelope spectrum to ±f₀: X(f) = ½[A(f−f₀) + A(f+f₀)].' }
        : { title: 'Baseband', text: 'Without a carrier the envelope itself is the signal; its spectrum is centered at DC.' };
    case 'amplitude':
      return { title: 'Amplitude', text: 'Amplitude scales the whole spectrum uniformly; normalized and dB-relative displays do not change.' };
    case 'repetition.prfHz':
      return { title: 'PRF', text: 'PRF primarily changes the separation between spectral-comb lines rather than the single-pulse spectral envelope.' };
    case 'repetition.pulseCount':
      return dir === 'up'
        ? { title: 'More pulses', text: 'A longer coherent train (T_burst ↑) concentrates energy into narrower lines: Δf_line ≈ 1/T_burst.' }
        : { title: 'Fewer pulses', text: 'A shorter train localizes the burst in time, so each spectral line broadens: Δf_line ≈ 1/T_burst.' };
    case 'repetition.enabled':
      return { title: 'Pulse train', text: 'Repetition samples the single-pulse spectrum at multiples of PRF (for a coherent train). The pulse shape still sets the envelope.' };
    case 'coherence.mode':
    case 'coherence.phaseNoiseRmsRad':
      return next === 'coherent'
        ? { title: 'Coherent', text: 'A deterministic pulse-to-pulse phase relation lets the pulses add in phase at the comb frequencies, forming sharp lines.' }
        : { title: 'Coherence reduced', text: 'Pulse-to-pulse phase uncertainty reduces the sharp comb structure, redistributing energy around the ideal spectral lines. Single-pulse bandwidth is unchanged.' };
    case 'coherence.phaseIncrementRad':
      return { title: 'Phase increment', text: 'A constant phase step per pulse is still coherent: the comb shifts by Δφ/(2π)·PRF without broadening.' };
    case 'coherence.reference':
      return { title: 'Carrier reference', text: 'Gated CW puts lines at f₀ + k·PRF; pulse-locked copies put lines at k·PRF. They coincide when f₀ is a multiple of PRF.' };
    case 'jitter.timingRmsSec':
    case 'jitter.timingEnabled':
      return { title: 'Timing jitter', text: 'Random pulse timing smears the comb: line power is reduced by exp(−(2πfσ_t)²) and the rest forms a broadband floor — stronger at higher frequencies.' };
    case 'jitter.amplitudeRms':
    case 'jitter.amplitudeEnabled':
      return { title: 'Amplitude jitter', text: 'Pulse-to-pulse amplitude variation keeps the lines in place but adds a noise-like floor shaped by the single-pulse spectrum.' };
    case 'jitter.frequencyRmsHz':
    case 'jitter.frequencyEnabled':
      return { title: 'Frequency jitter', text: 'Pulse-to-pulse carrier variation decorrelates the pulses and broadens the comb around f₀.' };
    case 'jitter.seed':
      return { title: 'New realization', text: 'A different seed draws a new random realization with the same statistics.' };
    case 'chirp.enabled':
    case 'chirp.startFrequencyHz':
    case 'chirp.endFrequencyHz':
      return { title: 'Chirp', text: 'A linear chirp sweeps the instantaneous frequency across the pulse; the occupied bandwidth becomes ≈ |k|·T, far wider than 1/T. Look at the spectrogram.' };
    case 'sampling.sampleRateHz':
      if (dir === 'down' && !ctx.nyquistOk)
        return { title: 'Undersampling', text: 'The physical spectrum has not changed. The digital representation is now undersampling it — components beyond fₛ/2 fold back as aliases.' };
      return { title: 'Sample rate', text: 'fₛ sets the representable range (Nyquist fₛ/2) and, with N, the bin spacing fₛ/N. It does not create or remove physical bandwidth.' };
    case 'sampling.sampleCount':
      return { title: 'Observation length', text: 'A longer record (T_obs = N/fₛ) gives a finer DFT bin spacing Δf = 1/T_obs — more actual information about narrow features.' };
    case 'sampling.quantizationEnabled':
    case 'sampling.bits':
      return { title: 'Quantization', text: 'Finite ADC resolution adds an error floor (≈ 6 dB per bit); it does not change the signal bandwidth.' };
    case 'sampling.aliasingDemo':
      return { title: 'Aliasing demonstration', text: 'Physical waveform → physical spectrum → sampling → correct representation or aliasing. The reference shows what exists before sampling.' };
    case 'spectrum.zeroPad':
      return { title: 'Zero padding', text: 'Zero padding interpolates the DFT representation but does not add information. More FFT samples ≠ more information.' };
    case 'spectrum.window':
      return { title: 'Analysis window', text: 'Narrow main lobe ↔ larger sidelobes; lower sidelobes ↔ wider main lobe. The window changes what we measure, not the signal.' };
    case 'spectrum.sided':
      return { title: 'Spectrum sides', text: 'Real signals have conjugate-symmetric spectra, X(−f) = X*(f): the negative frequencies carry no new information but are mathematically present.' };
    case 'spectrum.dbFloor':
      return { title: 'Dynamic range', text: 'Lowering the floor reveals spectral tails that a linear plot hides. Exact support, effective bandwidth and occupied bandwidth are different things.' };
    case 'stft.windowLength':
      return dir === 'up'
        ? { title: 'Longer STFT window', text: 'Long window: Δf ↓, Δt ↑. Frequencies are resolved finely but events are smeared in time.' }
        : { title: 'Shorter STFT window', text: 'Short window: Δt ↓, Δf ↑. Events are sharp in time but each frequency spreads.' };
    case 'cwt.omega0':
      return { title: 'Wavelet ω₀', text: 'Larger ω₀ gives more cycles per wavelet: better frequency, worse time resolution at every scale. The product stays bounded by 1/(4π).' };
    case 'spectrum.fftSelection':
      return { title: 'FFT of selection', text: 'Analyzing a shorter interval broadens every spectral feature: observation duration limits measured resolution.' };
    default:
      return null;
  }
}
