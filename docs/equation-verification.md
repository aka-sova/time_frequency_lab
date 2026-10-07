# Equation verification

The power/energy and instrument features were ported from `docs/reference/UWB_Pulse_Lab_HE.html`
(a standalone Hebrew page). Every formula was re-derived and checked numerically before it was
implemented; the checks live in the test suite so they keep running.

| # | Equation | Method | Result | Test |
|---|---|---|---|---|
| E1 | `P = v²/R`, `E = ∫P dt`; Gaussian `v = A·exp(−t²/2σ²)` ⇒ `P_pk = A²/R`, `E = A²σ√π/R` | numeric integral, A = 10 V, R = 50 Ω, σ = 0.5 ns | `P_pk = 2 W`, `E = 1.772454 nJ` (matches the closed form to 14 digits); 177.245 µW at 100 kHz | `tests/power.test.ts` › *E1*; `tests/presets.test.ts` › *uwb-gaussian-50ohm* |
| E2 | `S = E²/η₀`, fluence `= ∫S dt`, `η₀ = 376.730313412 Ω` (CODATA 2022) | 10 V/m peak | `S_pk = 0.265442 W/m²`; sinusoid average = peak/2 | `tests/power.test.ts` › *E2*; preset *field-10vm-air* |
| E3 | Single pole: `τ = 1/(2π·BW)`, `t_r(10–90 %) = ln 9·τ ≈ 0.3497/BW` | analytic + numeric step response | correct (0.35 is the rounded textbook value; both constants are exposed) | `tests/instrument.test.ts` › *10–90 % step rise time*; `tests/budget.test.ts` |
| E4 | Gaussian through a single pole | closed form `y(t) = σ√(2π)/(2τ)·exp(σ²/2τ² − t/τ)·erfc((σ/τ − t/σ)/√2)` | max error < 5×10⁻⁶ (≈ 1×10⁻⁶ at Δt = 2 ps). The implementation uses the ramp-invariant recurrence `y_i = a·y_{i−1} + (1−a)·x_{i−1} + m·(Δt − τ(1−a))`, exact for piecewise-linear input at any Δt/τ | `tests/instrument.test.ts` › *lowpassFirstOrder* |
| E5 | Trigger-jitter averaging = convolution with `N(0, σ_j²)`; `σ_avg = √(σ² + σ_j²)`, `V_pk,avg = σ/σ_avg` | σ = 0.5 ns, σ_j = 0.25 ns | ratio 0.894427; area preserved. **This is the expectation of an infinite average — no noise.** | `tests/instrument.test.ts` › *gaussianAverage* |
| E6 | Rise-time combination `t_r ≈ √(Σ t_i²)` with `t = 0.35/BW` | exact two identical single-pole step response | exact 10–90 % = 3.358 τ vs quadrature 3.107 τ → **quadrature is ≈ 8 % low** for single-pole cascades; exact only for Gaussian responses | `tests/budget.test.ts` › *DOCUMENTS the limit* |
| E7 | `u_P/P = √((2u_V/V)² + (u_R/R)²)`, `U = k·u` | 3 % / 1 % example | `u = 6.083 %`, `U(k = 2) = 12.17 %`. First order, independent errors, no covariance; k = 2 is not an automatic 95 % guarantee | `tests/budget.test.ts` › *power uncertainty* |
| E8 | Pulse-width definitions on a Gaussian (σ of the amplitude) | analytic | amplitude FWHM 2.3548σ; power FWHM 1.6651σ; central 90 % energy 2.3262σ | `tests/pulsewidth.test.ts` |
| E9 | Monocycle `u·e^{1/2}·e^{−u²/2}` (peak 1 at u = ±1) and doublet `(1−u²)e^{−u²/2}` | analytic | identical to the lab's existing `gaussian-d1` / `gaussian-d2` envelopes (already covered) | — |
| E10 | Alias frequency `|f − round(f/fs)·fs|` | compared with `aliasFrequency` | identical to the lab's `lib/dsp/sampling.ts` (already covered) | — |

Additional numerical checks: overlapping-pulse average power is verified against a brute-force sum of
shifted copies (`tests/power.test.ts`); the cubic interpolation used to sample the filtered waveform
is verified to < 10⁻³ at 32× oversampling (`tests/instrument.test.ts`).

## Pulse compression and phase codes

| # | Equation | Method | Result | Test |
|---|---|---|---|---|
| P1 | Barker aperiodic autocorrelation sidelobes ≤ 1, PSLR = 1/L | exhaustive over the 7 tables | all ≤ 1; Barker-13: −22.28 dB | `tests/codes.test.ts` |
| P2 | Frank (L = M²) and P4 have zero periodic-autocorrelation sidelobes | L = 4…100 / 2…255 | < 10⁻⁹·L | `tests/codes.test.ts` |
| P3 | Matched filter of a rect pulse = triangle of base 2τ; τ_c(−3 dB) = (2 − √2)·τ | 1 µs pulse at 1 GHz | within 1 % | `tests/compression.test.ts`; preset *mf-rect-pulse* |
| P4 | LFM: τ_c = 0.886/B, PSLR = −13.26 dB, ratio ≈ 1.13·TB | TB = 100 and 200 | τ_c within 2 %, PSLR within 0.3 dB | `tests/compression.test.ts`; preset *lfm-tb100* |
| P5 | Weighting SNR loss = 10·log₁₀(ENBW) for a constant envelope | Hamming, TB = 200 | 1.34 dB within 0.02 dB; PSLR ≤ −40 dB; mainlobe × 1.47 | `tests/compression.test.ts`; preset *lfm-hamming* |
| P6 | LFM range–Doppler coupling τ = −ν/k, peak \|χ\| = 1 − \|ν\|/B | B = 20 MHz, T = 2.5 µs, ν = 2 MHz; ambiguity row at 20 MHz for B = 100 MHz | −250 ns within 2 %; 0.92 dB; 0.80 within 0.02 | `tests/compression.test.ts`, `tests/ambiguity.test.ts` |
| P7 | SNR_out = 2E/N₀ = Σx²/σ², independent of the waveform | seeded noise; average of the (unbiased) noise-variance estimate over 8 seeds on 32 µs records | within 0.5 dB, for single pulse, LFM and train references. Bandpass outputs are referred to the real output (I+Q carries 2× the noise power) | `tests/compression.test.ts` |
| P8 | Coherent integration gain 10·log₁₀N; train ambiguities (N − \|m\|)/N at m·PRI | 8 pulses, PRI 500 ns | 9.03 dB; −1.16 dB at ±PRI | `tests/compression.test.ts`, `tests/ambiguity.test.ts` |
| P9 | χ(0, 0) = 1, ∬\|χ\|² dτ dν = 1 | Gaussian RF pulse, Doppler span covering the spectrum | 1 to 10⁻⁹; volume within 2 % | `tests/ambiguity.test.ts` |
| P10 | Zero-delay cut \|χ(0, ν)\| = \|FT{\|z\|²}\|: rect → \|sinc(νT)\|; train → nulls at odd multiples of 1/(2·PRI) | 1 µs pulse; 8-pulse train | first null at 1/T within 3 %; \|χ(0, PRF)\| = sinc(0.2) within 0.005 | `tests/ambiguity.test.ts` |

Two estimation details were found while testing and are handled in the code: the noise-variance estimate must use only
lags with full reference overlap (the Hilbert tails of a gated carrier are not a valid support), and its scatter follows
the filter's noise correlation length Σ|R_h|²/R_h(0)², which for a train reference includes the repeats at m·PRI.

**Outcome:** no errors were found in the source page's equations. Two caveats are stated in the UI
and above (E5 and E6); one implementation was upgraded (E4).
