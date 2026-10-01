export interface GuidedExperiment {
  id: string;
  title: string;
  preset: string;
  instruction: string;
  expected: string;
  control: string;
}

export const GUIDED_EXPERIMENTS: GuidedExperiment[] = [
  {
    id: 'e1',
    title: 'Shorten the pulse',
    preset: 'exp-pulse-width',
    control: 'Pulse → width τ',
    instruction: 'Reduce the pulse width from 100 ns to 5 ns. Observe the frequency spectrum and the τ-vs-B mini chart.',
    expected: 'The spectrum becomes broader: −3 dB bandwidth × τ stays constant (≈ 0.31 for this Gaussian, baseband definition).',
  },
  {
    id: 'e2',
    title: 'Change the carrier',
    preset: 'exp-carrier',
    control: 'Carrier → f₀',
    instruction: 'Keep the pulse width fixed and move f₀ between 0.5 and 2.5 GHz.',
    expected: 'The spectral envelope shifts while retaining approximately the same width.',
  },
  {
    id: 'e3',
    title: 'Increase PRF',
    preset: 'exp-prf',
    control: 'Pulse train → PRF',
    instruction: 'Increase PRF from 10 MHz to 40 MHz. Compare the comb with the dashed single-pulse envelope.',
    expected: 'Spectral-line separation increases while the single-pulse envelope remains similar.',
  },
  {
    id: 'e4',
    title: 'Destroy coherence',
    preset: 'exp-coherence',
    control: 'Coherence → mode / σφ',
    instruction: 'Switch from fully coherent to partially coherent, increase σφ, then select random phase.',
    expected: 'Sharp spectral-comb features become less pronounced or broaden; the line-to-valley contrast drops toward 0 dB.',
  },
  {
    id: 'e5',
    title: 'Undersample',
    preset: 'exp-undersample',
    control: 'Sampling → fₛ',
    instruction: 'Lower the sample rate from 10 GS/s to 1.5 GS/s while watching the physical reference.',
    expected: 'Aliasing appears even though the original physical signal has not changed.',
  },
  {
    id: 'e6',
    title: 'Change the STFT window',
    preset: 'stft-resolution',
    control: 'Time–frequency → STFT window',
    instruction: 'Shorten the STFT window from 1024 to 64 samples.',
    expected: 'Time and frequency resolution trade against each other; a chirp looks sharpest at an intermediate window length.',
  },
  {
    id: 'e7',
    title: 'Lengthen the train',
    preset: 'exp-pulse-count',
    control: 'Pulse train → number of pulses',
    instruction: 'Double the number of pulses: 1, 2, 4, 8, 16, 32, 64.',
    expected: 'Individual spectral lines narrow as Δf_line ≈ 1/T_burst; their spacing (PRF) stays fixed.',
  },
  {
    id: 'e8',
    title: 'Sharpen the edges',
    preset: 'exp-rise-time',
    control: 'Pulse → rise / fall time',
    instruction: 'Reduce rise and fall time from 10 ns to 0.5 ns with the floor at −100 dB.',
    expected: 'High-frequency content rises by tens of dB while the main lobe (set by τ) barely changes.',
  },
];
