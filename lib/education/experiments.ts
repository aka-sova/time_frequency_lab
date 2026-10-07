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
  {
    id: 'e9',
    title: 'Same peak, different energy',
    preset: 'uwb-monocycle-power',
    control: 'Pulse → envelope',
    instruction: 'Compare the monocycle with the Gaussian (A side). Both have a 10 V peak. Open Power & energy.',
    expected: 'The monocycle carries less energy and has zero net area: peak amplitude alone does not describe a pulse.',
  },
  {
    id: 'e10',
    title: 'Average power versus PRF',
    preset: 'uwb-gaussian-50ohm',
    control: 'Pulse train → PRF',
    instruction: 'Enable the train and raise the PRF from 100 kHz to 100 MHz. Watch the marker on the average-power chart.',
    expected: 'Average power rises in proportion to PRF while the peak power stays at 2 W; when pulses start to overlap the line bends away from E·PRF.',
  },
  {
    id: 'e11',
    title: 'Lower the instrument bandwidth',
    preset: 'scope-bandwidth-limit',
    control: 'Instrument → bandwidth',
    instruction: 'Sweep the bandwidth from 5 GHz down to 150 MHz and watch the displayed peak and FWHM.',
    expected: 'The displayed peak falls and the pulse widens once 0.35/BW approaches the pulse width, even with a high sample rate: bandwidth and sample rate are different limits.',
  },
  {
    id: 'e12',
    title: 'Averaging with trigger jitter',
    preset: 'scope-trigger-jitter',
    control: 'Instrument → trigger jitter',
    instruction: 'Raise the jitter from 0 to 500 ps.',
    expected: 'The displayed pulse gets wider and lower by σ/√(σ² + σ_j²); the area is unchanged. Averaging does not fix jitter.',
  },
  {
    id: 'e13',
    title: 'Bandwidth sets range resolution',
    preset: 'lfm-tb100',
    control: 'Chirp (LFM) → end frequency',
    instruction: 'Keep the 1 µs pulse and raise the end frequency from 1.05 to 1.25 GHz (B = 100 → 300 MHz). Watch τ_c in the Pulse compression tab and the theoretical output SNR in the Detection card.',
    expected: 'τ_c falls as 0.886/B (8.9 → 3 ns) while the theoretical output SNR stays the same: the pulse energy has not changed.',
  },
  {
    id: 'e14',
    title: 'Weighting trade-off',
    preset: 'lfm-tb100',
    control: 'Pulse compression → weighting',
    instruction: 'Switch the weighting from None to Hann, Hamming, Blackman and Blackman-Harris.',
    expected: 'The peak sidelobe drops from −13 dB to near or below −40 dB, but the mainlobe widens and the peak falls by the SNR loss 10·log₁₀(ENBW) (1.3–3 dB).',
  },
  {
    id: 'e15',
    title: 'Doppler: shift or collapse',
    preset: 'barker-13',
    control: 'Pulse compression → Doppler mismatch ν',
    instruction: 'Raise ν from 0 to 3 MHz, then load “LFM range–Doppler coupling” and do the same.',
    expected: 'The Barker peak collapses and its sidelobes rise (Doppler-intolerant); the LFM peak only moves in delay by −ν/k and loses little.',
  },
  {
    id: 'e16',
    title: 'Coherence and integration',
    preset: 'coherent-train-ambiguity',
    control: 'Coherence → mode / σφ',
    instruction: 'Switch the coherence to partially coherent and raise σφ from 0 to 1.5 rad; finally choose random phase.',
    expected: 'The integration loss grows from 0 dB towards ≈ 9 dB: without a known pulse-to-pulse phase the 8 pulses no longer add coherently.',
  },
];
