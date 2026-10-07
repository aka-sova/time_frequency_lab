# Time–Frequency Lab

**Explore how waveform structure in time determines spectral structure in frequency.**

An interactive, browser-only RF/DSP laboratory for engineers and engineering students. Change a signal
parameter and immediately see the waveform, its magnitude/power/phase spectrum, its spectrogram and
wavelet transform, and a set of measured quantities (bandwidth under several definitions, durations,
time–bandwidth products, comb spacing, line width …). Every displayed number is computed from the
generated waveform or from a clearly labeled analytical formula.

> Screenshots: _placeholder — add `docs/screenshot-main.png` and `docs/screenshot-tf.png`._

---

## What a student should discover in 15–30 minutes

| Experiment | Observation |
|---|---|
| τ ↓ | B ↑ (B ∝ 1/τ) |
| t_r ↓ | more high-frequency content (the main lobe barely moves) |
| f₀ ↑ | the spectrum moves; its width does not change |
| PRF ↑ | comb-line spacing increases; the single-pulse envelope is unchanged |
| T_burst ↑ | individual lines narrow (Δf_line ≈ 0.886/T_burst) |
| coherence loss | the comb loses contrast; pulse bandwidth is unchanged |
| fₛ < 2f_max | aliasing — the physical spectrum is unchanged |
| T_obs ↑ | DFT bin spacing Δf = 1/T_obs ↓ |
| same peak, other shape | energy and net area change: a monocycle carries less energy than a Gaussian of equal peak |
| PRF ↑ | average power ∝ PRF (peak power fixed) until pulses overlap |
| instrument BW ↓ | displayed peak ↓ and FWHM ↑ even at a high sample rate |
| trigger jitter σ_j ↑ | averaged pulse widens: σ_avg = √(σ² + σ_j²), peak × σ/σ_avg |
| chirp / code bandwidth B ↑ at fixed T | matched-filter output narrows as ≈ 1/B; output SNR (2E/N₀) unchanged |
| reference weighting | range sidelobes ↓, mainlobe ↑, SNR loss = 10·log₁₀(ENBW) |
| Doppler on LFM vs Barker | LFM peak shifts by −ν/k (range–Doppler coupling); Barker peak collapses |
| coherent train, train reference | +10·log₁₀N integration gain; ambiguities at m·PRI and n·PRF (bed of nails) |

and that *short time localization ⇔ broad frequency content* is a property of the waveform and of
Fourier analysis, not an artifact of sampling.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
npm test         # numerical unit tests (Vitest)
```

Requires Node.js 20+.

## Deployment to Vercel

The app is a single statically prerendered Next.js page; all computation runs in the browser.

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Import it in Vercel — the framework preset **Next.js** is detected automatically.
3. Deploy. No environment variables, secrets, databases, serverless functions or native binaries are needed.

`npx vercel` from the project root works as well.

---

## Features

- **Signal families** (templates over one general model): continuous sinusoid, rectangular pulse,
  Gaussian, Gaussian monocycle / Ricker (UWB), windowed carrier burst (rect, Gaussian, Hann, Hamming,
  Blackman, raised-cosine/Tukey), pulse train, linear chirp, composite.
- **Pulse controls**: width, center, envelope, independent 10–90 % rise and 90–10 % fall times (linear or
  raised-cosine edges).
- **Pulse train**: PRF, pulse count (×2/÷2), duty cycle, deterministic amplitude taper.
- **Coherence**: fully coherent (gated CW or pulse-locked copies), fixed Δφ per pulse, Gaussian phase
  noise, random phase.
- **Jitter**: timing (random Gaussian or deterministic sinusoidal), amplitude, carrier frequency — all
  seeded and reproducible; each effect uses an independent random stream.
- **Chirp (LFM)**: start/end frequency, up/down swap, f_inst overlay, k, B ≈ |k|T and TBP readouts.
- **Phase codes**: Barker (2–13), Frank (L = M²) and P4 (2–256 chips) across the pulse, with or without a carrier
  (binary codes are ±1 at baseband); T_c, B ≈ 1/T_c, TB ≈ L and the expected Barker PSLR.
- **AM and additive noise** (expert mode).
- **Sampling**: auto/manual fₛ and N, observation time, ADC quantization (bits, measured SQNR),
  aliasing demonstration with a dense *physical* reference waveform and spectrum.
- **Frequency domain**: |X|, normalized, dB, power/ESD, PSD (periodogram or Welch); one-/two-sided;
  centered or raw DFT order; log/linear axis; analysis windows; zero padding (with raw-bin markers);
  dB floor incl. "Show theoretical tails"; Nyquist markers; measured band shading; comb-spacing
  annotation; single-pulse envelope overlays (×N coherent, ×√N incoherent); optional phase spectrum
  (wrapped/unwrapped, referenced to pulse center or record start).
- **Time–frequency**: STFT (window length, overlap, FFT length, window, dynamic range, log axis) with
  resolution readouts; Morlet / Mexican-hat CWT with σ_t, σ_f per scale; side-by-side
  Fourier vs STFT vs wavelet comparison.
- **Measurements**: −3/−6/−10/−40 dB, 90 %/99 % occupied, null-to-null and RMS bandwidth — for the
  displayed spectrum and for the single-pulse envelope; FWHM, RMS duration, rise/fall, duty cycle, peak
  and RMS amplitude, carrier cycles, fractional bandwidth; τ·B₋₃dB, τ·B₉₉%, σ_tσ_f with Gaussian
  reference values; comb spacing, line width and line-to-valley contrast; a live τ-vs-B mini chart.
- **Power & energy** (tab): amplitude in volts across a load R, or V/m in free space (η₀ = 376.73 Ω) —
  peak power, energy / fluence, equivalent width E/P_peak, net area, average power at a PRF *including
  overlapping pulses*, an average-power-vs-PRF chart, and pulse width under several definitions
  (amplitude / power FWHM, energy fractions, custom level, main-lobe vs outermost crossing).
- **Instrument model** (tab): any waveform seen through trigger-jitter averaging, a single-pole
  bandwidth limit, scope sampling (rate and phase) and an optional ADC clip, with true-vs-displayed
  peak, FWHM and rise time, plus small rise-time-budget and first-order power-uncertainty calculators.
  Equations and their checks: [docs/equation-verification.md](docs/equation-verification.md).
- **Pulse compression** (tab): matched filter against one clean pulse or the nominal train (known taper and phase
  steps, no random effects), optional reference weighting (Hann … Blackman-Harris) and a narrowband Doppler mismatch ν.
  Output normalized to a constant noise level, so a drop below 0 dB is an SNR loss. Measured vs theory: τ_c, compression
  ratio, TB, PSLR/ISLR, weighting and Doppler loss, range–Doppler shift, ΔR = c·τ_c/2, integration gain/loss and range
  ambiguities. Detection in noise: E, 2E/N₀ and one noise realization with its expected scatter. Ambiguity function
  |χ(τ, ν)| heatmap (click to set ν; narrowband-limit lines) with an exact zero-delay cut, χ(0,0) and volume checks.
- **Plot navigation**: drag to zoom; **double-click** a plot to return to its current view (the range chosen by Fit /
  Full record / the preset). Plotly's built-in double-click is replaced because it restores the range from the first draw,
  which is stale after a preset, Fit or unit change.
- **Cursors**: draggable t₁/t₂ and f₁/f₂ with Δt, Δf, Δt·Δf; "FFT of cursor selection only".
- **Learning tools**: context-sensitive explanations, warnings with one-click fixes, guided
  experiments, Fourier-synthesis mode (with a "randomize phases" twist), spectral-leakage laboratory
  with measured window metrics, KaTeX mathematics panel that follows the configuration, theory cards,
  parameter → effect table and a list of common conceptual mistakes.
- **Presets and interface mode**: when a preset (or a link without a mode) uses controls the current mode hides — a chirp,
  jitter, coherence, finite rise/fall time, quantization/aliasing demo, AM/noise … — the lab switches **up** to the lowest
  mode that shows them, says why in the message bar and offers **Back to Basic**. It never switches down, and a link that
  names a mode keeps it. The minimum is derived from the signal configuration in `lib/presets/minMode.ts`; a preset can add
  its own requirement with `Preset.minMode`, and `tests/minmode.test.ts` pins the result for every preset.
- **Tutorial**: the **Tutorial** button in the top bar opens a 26-step guided tour (Next / Previous / X, Esc to close). A card
  explains each area while the matching part of the screen is highlighted; some steps ask you to act (change the mode,
  load a preset, save A) and unlock **Next** when done, or you can press **Do it for me**. It covers the layout, mode
  selection, the control panel, two preset demonstrations and every workspace tab. The card can be dragged. Content lives
  in `lib/tutorial/steps.ts`; placement logic in `lib/tutorial/position.ts`.
- **Text size**: − / + buttons in the header scale all UI text and plot fonts from 50 % to 300 % in 10 % steps
  (click the percentage to reset). The setting is remembered in the browser. Above ~250 % on a narrow window the
  page scrolls horizontally, because layout breakpoints do not follow the text scale.
- **Workflow**: 44 presets (configuration data), Basic/Advanced/Expert modes, *Isolate effect* buttons,
  parameter locks, A/B comparison with difference table, parameter sweeps, per-section reset, undo,
  shareable URL (`?preset=coherent-train&f0=1e9&pw=1e-8&prf=1e6`), CSV/JSON export, JSON import, PNG
  export from each plot's toolbar.

---

## Architecture

```text
app/                    Next.js App Router (layout, page, icon, global styles)
components/
  lab/                  Lab shell, state hook (presets, locks, isolate, undo, URL sync), context
  controls/             Control panel, collapsible sections, engineering inputs (slider + number + unit)
  plots/                Plotly wrapper, time / spectrum / phase plots, STFT/CWT panel, toolbars
  measurements/         Measurement strip, detailed measurement panel, cursor readout
  workspace/            Tabs: A/B, sweep, leakage, Fourier synthesis
  education/            KaTeX, math panel, theory, guided experiments, status bar
  layout/               Header, error boundary
lib/
  dsp/                  React-free DSP engine (see below)
  units/                formatEngineering / parseEngineering
  presets/              defaults, presets (data), fitting, isolate
  state/                path utilities, URL state, input sanitization
  education/            tooltips, explanations, guided experiments
types/signal.ts         Strongly typed Experiment = { signal: SignalConfig; analysis: AnalysisConfig }
tests/                  Vitest numerical tests
```

The DSP engine has no React dependency:

| Module | Responsibility |
|---|---|
| `fft.ts` | radix-2 Cooley–Tukey + Bluestein (any length), bin frequencies, `fftshift` |
| `signals.ts` | general signal model, envelopes, seeded pulse realizations, `generateSignal()` |
| `sampling.ts` | auto sampling, spectral-extent estimate, alias frequency |
| `windows.ts` | window functions and their coherent gain / ENBW |
| `spectrum.ts` | `computeSpectrum()`, Welch, one-sided folding, phase, unwrapping, analytic signal |
| `display.ts` | conversion to the plotted quantity (|X|, dB, ESD, PSD …) |
| `bandwidth.ts` | −X dB, occupied, null-to-null, RMS bandwidth, comb-line detection, line width |
| `measurements.ts` | FWHM, 10–90 % edges, RMS duration, SNR |
| `stft.ts`, `wavelet.ts` | STFT and frequency-domain CWT |
| `analyze.ts` | pipeline: spectra + measurements |
| `power.ts` | power / energy in V·R and V/m·η₀, periodic average power with overlap folding |
| `pulsewidth.ts` | pulse width by amplitude, power or cumulative-energy definition |
| `instrument.ts`, `budget.ts` | bandwidth / jitter / sampling / clip model; rise-time and uncertainty budgets |
| `codes.ts` | Barker / Frank / P4 phase codes and length snapping |
| `compression.ts` | matched filter: reference (pulse / nominal train), weighting, Doppler mismatch, metrics, SNR |
| `ambiguity.ts` | narrowband ambiguity function on a band-limited, downconverted reference; exact zero-delay cut |
| `leakage.ts`, `synthesis.ts`, `sweep.ts`, `warnings.ts`, `decimate.ts` | demos, sweeps, warnings, display decimation |

Performance: the record is regenerated and transformed synchronously (typical 4 k–32 k samples, max
131 072); STFT/CWT use `useDeferredValue` so sliders stay responsive; plots receive min/max-decimated
data (re-decimated for the zoomed range, so peaks are never lost).

---

## Numerical conventions

- Fourier transform: **X(f) = ∫ x(t) e^(−j2πft) dt** (ordinary frequency, no 2π factors elsewhere).
- DFT: X[k] = Σ x[n] e^(−j2πkn/N); the FFT is only the algorithm.
- **Fourier-transform estimate** (default for pulses): X(f_k) ≈ Δt·X[k] — physical units V/Hz,
  independent of fₛ and zero padding (a rect of width τ has |X(0)| = Aτ).
- **Amplitude spectrum**: X[k]/Σw — a bin-centered tone A·cos reads A/2 two-sided, A one-sided.
- **Periodogram PSD**: |X[k]|²/(fₛ·Σw²) [V²/Hz]; Σ PSD·Δf equals the mean power (Parseval, tested).
- **One-sided** views double power-like quantities (except DC and Nyquist); |X(f)| itself is not doubled.
- **Spectrum kind**: *baseband* signals (energy at DC) report bandwidths from 0 Hz to the edge;
  *bandpass* signals report the interval between lower and upper edges around the peak. Auto mode uses
  bandpass when a carrier is on, or when the DC level is > 6 dB below the peak.
- **−X dB bandwidth**: contiguous region around the spectral peak above the threshold, edges linearly
  interpolated in dB. For a pulse train this is the width of the strongest line; the single-pulse
  column gives the envelope bandwidth. The separate *line width* uses the strongest non-DC line.
- **Occupied bandwidth**: equal-tail definition (ITU-R SM.328) for bandpass; from DC for baseband.
- **RMS quantities**: σ_t from |x|² (baseband) or |z|² of the analytic signal (bandpass); σ_f from
  |X(f)|² two-sided about 0 (baseband) or positive-frequency about the centroid (bandpass). With these
  pairings σ_tσ_f ≥ 1/(4π) with equality for Gaussian envelopes (tested for both kinds).
- **Gaussian reference values** (amplitude FWHM × |X| bandwidth): τ·B₋₃dB = 0.312 (baseband) / 0.624
  (bandpass); τ·B₉₉% = 0.683 / 1.365; σ_tσ_f = 1/(4π) ≈ 0.0796. The often-quoted 0.441 refers to FWHM of
  |x|² and |X|² — a different definition.
- **Pulse width τ**: rect/trapezoid — 50 % width; Gaussian family — FWHM of the Gaussian; Hann/
  Hamming/Blackman/Tukey — full support. Rise/fall times are 10–90 %.
- **Coherent train (gated CW)**: φ_n = φ₀ + 2πf₀t_n → lines at f₀ + k·PRF; pulse-locked copies → lines
  at k·PRF.
- **CWT normalization**: unit-peak analytic filters (×2 on positive frequencies), so a tone A·cos gives
  |W| = A at its frequency for every scale (L¹-type, display-oriented).
- **Random numbers**: mulberry32 with per-effect streams derived from the seed.
- **Matched filter**: y(τ) = Σ z_r(t)·h*(t − τ) on the analytic signal (bandpass: carrier or chirp on) or the real
  samples (baseband), normalized by √(E·Σ|h|²) — the matched peak is 1 and a lower peak is the SNR loss.
  Output SNR is quoted for the real output (peak² over mean noise power): 2E/N₀ = Σx²/σ².
- **Ambiguity function**: χ(τ, ν) = Σ z(t)·z*(t − τ)·e^{j2πνt} / E, the same sign convention as the matched filter
  (the row at ν is the output with Doppler mismatch ν; an up-chirp ridge runs through τ = −ν/k).
- **Phase codes**: chip m = ⌊(u + τ/2)/T_c⌋, T_c = τ/L across the pulse-width parameter τ; rectangular chips.

## Limitations

- All signals are real-valued and synthesized analytically; there is no import of measured data.
- The spectral-extent estimate used for auto sampling and Nyquist warnings is heuristic (≈ −60 dB
  content); ideal discontinuities have unbounded spectra and always alias slightly.
- The DFT sees a finite, implicitly periodic record; pulses cut by the observation window add spectral
  content (a warning is shown).
- STFT frame count and displayed frequency rows are limited for responsiveness; CWT cost is
  scales × N log N and is computed on the main thread (deferred).
- Phase plots are masked below the dB floor (the phase of numerical noise is meaningless).
- The instrument model is a single-pole low-pass; trigger-jitter averaging is the *expected* trace of an
  infinite average (no noise); real instruments and sensors have other responses. The rise-time
  quadrature rule `√Σt²` is exact for Gaussian responses and ≈ 8 % low for cascaded single poles.
- Power density in V/m is the far-field plane-wave relation S = E²/η₀, not antenna or radiated power.
- Doppler is a narrowband frequency shift; a warning appears when |ν|·B·T/f_c ≥ 0.3 (a real Doppler shift scales
  the waveform in time). The ambiguity heatmap is band-limited to 99 % of the reference energy plus the Doppler span
  (sidelobe levels within ≈ 1 dB) and capped at 8192 resampled points; the zero-delay cut is exact.
- Phase-code chips are rectangular (instantaneous phase steps); a chip boundary between samples adds a small
  discretization error (≈ 0.1 dB on a Barker PSLR) — the presets use whole samples per chip.
- The measured output SNR is one noise realization; its expected scatter (shown) follows from the filter's noise
  correlation length and can exceed 1 dB for a narrowband filter or a train reference on a short record.
- This is educational DSP/RF visualization software with normalized amplitudes — not an operational
  effects simulator.
