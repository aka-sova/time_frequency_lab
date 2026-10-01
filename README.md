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
- **Cursors**: draggable t₁/t₂ and f₁/f₂ with Δt, Δf, Δt·Δf; "FFT of cursor selection only".
- **Learning tools**: context-sensitive explanations, warnings with one-click fixes, guided
  experiments, Fourier-synthesis mode (with a "randomize phases" twist), spectral-leakage laboratory
  with measured window metrics, KaTeX mathematics panel that follows the configuration, theory cards,
  parameter → effect table and a list of common conceptual mistakes.
- **Workflow**: 28 presets (configuration data), Basic/Advanced/Expert modes, *Isolate effect* buttons,
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

## Limitations

- All signals are real-valued and synthesized analytically; there is no import of measured data.
- The spectral-extent estimate used for auto sampling and Nyquist warnings is heuristic (≈ −60 dB
  content); ideal discontinuities have unbounded spectra and always alias slightly.
- The DFT sees a finite, implicitly periodic record; pulses cut by the observation window add spectral
  content (a warning is shown).
- STFT frame count and displayed frequency rows are limited for responsiveness; CWT cost is
  scales × N log N and is computed on the main thread (deferred).
- Phase plots are masked below the dB floor (the phase of numerical noise is meaningless).
- This is educational DSP/RF visualization software with normalized amplitudes — not an operational
  effects simulator.
