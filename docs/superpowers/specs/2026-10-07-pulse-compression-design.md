# Pulse Compression, Matched Filter & Ambiguity Function — Design

**Date:** 2026-10-07 · **Status:** approved in brainstorming, awaiting spec review · **Branch:** `feature/pulse-compression`

## 1. Goal

Show what the chirp's time–bandwidth product *buys*: range resolution is set by bandwidth, detectability by
energy, and a matched filter decouples the two. Add a **Pulse compression** workspace tab (matched-filter
output, compression metrics, detection in noise, ambiguity function) and **phase-coded waveforms**
(Barker, Frank, P4) to the signal model. The ambiguity function generalizes the σₜσ_f uncertainty the lab
already teaches to two dimensions.

### Scope

| Stage | Content | Signal-model change |
|---|---|---|
| 1 | Matched filter, weighting, Doppler mismatch, metrics, SNR | no |
| 2 | Ambiguity function (heatmap + zero-delay cut) | no |
| 3 | Phase codes: Barker, Frank, P4 | yes (`signal.code`) |

**Out of scope:** wideband (time-scaling) ambiguity function; chip shaping; m-sequences and custom codes;
target scenes / multiple echoes / range–Doppler maps; Web Worker.

### Decisions

| Topic | Decision |
|---|---|
| Architecture | Self-contained workspace tab + pure React-free DSP modules (same pattern as Power / Instrument tabs) |
| Doppler model | Narrowband (frequency shift ν, Hz) with a warning when the approximation breaks |
| Reference for trains | Toggle: single pulse (default) / nominal full train |
| Code families | Barker (binary) and polyphase Frank + P4 |
| Weighting | Time-domain amplitude taper on the reference, per pulse |
| Noise controls | Duplicated inside the tab (bound to `signal.noise.*`) so the lesson works in every mode |

## 2. DSP core

### 2.1 Complex representation

- **Bandpass** signals (per the existing `decideKind`): analytic signal `analyticSignal()` (spectrum.ts).
- **Baseband** signals: the real record itself, so the output is the true real correlation (not a Hilbert
  envelope of it).

Call this `z(t)`. Downconversion by `f_c = carrier.centerHz` is used only where a reduced rate is needed
(ambiguity function); it does not change any magnitude.

### 2.2 Reference (template)

Rule: **the receiver knows everything deterministic and nothing random.**

- `'pulse'`: `signal.singlePulse` (already a clean, unjittered pulse at the train center, with the correct
  carrier phase reference).
- `'train'`: a nominal train synthesized with the existing `realizePulses` + `synthesize` on the **same fs/N
  grid** as the record, from a copy of the configuration with:
  - kept (deterministic): amplitude taper (`repetition.amplitudeVariation`), Δφ-per-pulse increment
    (`coherence.mode = 'increment'`), phase code, chirp;
  - removed (unknown): all jitter (timing random and periodic, amplitude, frequency), phase noise, random
    phase (`partial`/`incoherent` → `coherent`), noise, quantization.

  Jitter, phase noise or incoherence in the received record therefore show up as measurable integration loss.
- `'train'` with no train active falls back to `'pulse'` at compute time (stored value kept).

### 2.3 Weighting (mismatched filter)

Time-domain amplitude taper of the reference, applied per pulse: `w((t − tₙ)/span + ½)` from `windowValue`
(rect, Hann, Hamming, Blackman, Blackman-Harris), where `span` is the interval in which the single-pulse
envelope `|z|` exceeds −60 dB of its peak and `tₙ` are the nominal pulse centers. For a constant-envelope
pulse the SNR loss is exactly `10·log₁₀(ENBW)` — the same ENBW `windowStats()` reports in the Leakage tab.
Overlapping pulses make per-pulse weighting ambiguous → warning.

### 2.4 Doppler mismatch and matched-filter output

- Received: `z_r(t) = z(t)·e^{j2πνt}` (narrowband).
- Output: `y(τ) = Σ z_r(t)·z_ref*(t − τ)`, computed by zero-padded FFT correlation (`fftInPlace` handles any
  length) at the **full** sample rate.
- Normalization: the matched, unweighted, zero-Doppler peak = 1 (0 dB), so weighting and Doppler losses read
  directly as a drop below 0 dB.
- With noise on, the outputs of `x_ideal` and of `x − x_ideal` (noise incl. quantization) are computed
  separately; the displayed noisy output is their sum.

### 2.5 Metrics

| Metric | Definition |
|---|---|
| τ_c | −3 dB width of the mainlobe of \|y\| (linear interpolation) |
| Compression ratio | FWHM of \|z_ref\| ÷ τ_c (rect pulse → 1; LFM → ≈ 1.13·TB); TB shown alongside |
| Mainlobe | between the first local minima on either side of the peak |
| PSLR | highest sidelobe outside the mainlobe ÷ peak, dB. For trains: within ±PRI/2 of the peak |
| ISLR | sidelobe energy ÷ mainlobe energy, dB (same window as PSLR) |
| Range ambiguities | trains: peak heights at m·PRI listed separately (not counted as sidelobes) |
| Peak delay shift | delay of the peak relative to ν = 0 (LFM: −ν/k) |
| Weighting loss | dB below matched peak at ν = 0 |
| Doppler loss | dB below the ν = 0 peak with the same weighting |
| Integration gain | train reference: peak(train ref, nominal record) ÷ peak(pulse ref), dB (ideal 20·log₁₀N) |
| Integration loss | train reference: peak on the actual record ÷ peak on the nominal record, dB |
| SNR_in | max\|x_ideal\|² / σ² |
| SNR_out (theory) | Σx_ideal² / σ² (= 2E/N₀ for real white noise, N₀/2 = σ²/fₛ) minus weighting and Doppler losses |
| SNR_out (measured) | \|y_ideal(peak)\|² / var(y_noise) |
| Processing gain | SNR_out (measured) − SNR_in, dB |
| ΔR | c·τ_c / 2 |

SNR rows are shown only when noise is on (theory row always).

### 2.6 Ambiguity function

Self-ambiguity of the (weighted) reference, convention chosen so that **a horizontal cut at ν equals the
matched-filter output with Doppler mismatch ν**:

  χ(τ, ν) = Σ z(t)·z*(t − τ)·e^{j2πνt} / E,  E = Σ|z|²

For an up-chirp the ridge peak lies at τ = −ν/k with magnitude ≈ 1 − |ν|/B.

- **Grid:** the reference is downconverted by f_c and resampled by exact band-limiting (FFT-bin truncation).
  The reduced rate is chosen so the occupied band plus the Doppler span fit without spectral wrap. Each ν row
  is one forward FFT + one inverse FFT against the precomputed conjugate spectrum of the reference.
- **Size:** ≤ 512 delay × ≤ 201 Doppler points; resampled length capped (constant `MAX_AMBIGUITY_SAMPLES`,
  8192) → `capped: true` and a warning.
- **Auto span:** delay ±reference duration (trains: ±(N−1)·PRI + T); Doppler ±max(B, 4/T) (trains: ±2.5·PRF).
- **Self-checks returned:** χ(0, 0) and volume Σ|χ|²·Δτ·Δν (≈ 1).
- Computed only while the tab is open, behind `useDeferredValue` (as the STFT panel).

### 2.7 Narrowband warning

The narrowband model shifts every spectral component by ν; physically the shift is ν·f/f_c (time scaling).
The resulting edge-of-band phase error over the pulse is ≈ (π/4)·|ν|·B·T/f_c. A warning is shown when
`|ν|·B·T / f_c ≥ 0.3` (≈ 0.24 rad; T = reference duration, B = occupied bandwidth) for the Doppler-mismatch
control. On the ambiguity heatmap, dashed horizontal lines mark the |ν| beyond which this limit is exceeded.
For baseband signals the warning states that Doppler is modeled as a frequency shift only; physically it is
time scaling.

### 2.8 Module interfaces

```ts
// lib/dsp/compression.ts
export type CompressionReference = 'pulse' | 'train';
export type CompressionWeighting = 'rect' | 'hann' | 'hamming' | 'blackman' | 'blackman-harris';
export interface ComplexSignal { re: Float64Array; im: Float64Array; fs: number; fc: number; kind: SpectrumKind }
export interface CompressionSettings { reference: CompressionReference; weighting: CompressionWeighting; dopplerHz: number }
export function buildReference(signal: SignalResult, cfg: SignalConfig, s: CompressionSettings): ComplexSignal;
export function matchedFilter(received: ComplexSignal, ref: ComplexSignal, dopplerHz: number): { tau: Float64Array; y: ComplexArray };
export function analyzeCompression(signal: SignalResult, cfg: SignalConfig, s: CompressionSettings): CompressionResult;
// CompressionResult: { tau, y (normalized, ideal), yNoisy | null, yUnweighted | null, metrics, snr | null, warnings, reference }

// lib/dsp/ambiguity.ts
export interface AmbiguityOptions { delaySpanSec: number; dopplerSpanHz: number; delayPoints?: number; dopplerPoints?: number }
export function autoAmbiguitySpan(ref: ComplexSignal, cfg: SignalConfig, reference: CompressionReference): { delaySpanSec: number; dopplerSpanHz: number };
export function ambiguity(ref: ComplexSignal, o: AmbiguityOptions): AmbiguityResult;
// AmbiguityResult: { tau, nu, magDb: Float32Array[] (rows by ν), zeroDelay: Float64Array, peak, volume, fsResampled, capped, ms }

// lib/dsp/codes.ts
export type CodeFamily = 'barker' | 'frank' | 'p4';
export const BARKER_LENGTHS: readonly number[]; // 2, 3, 4, 5, 7, 11, 13
export function codePhases(family: CodeFamily, length: number): Float64Array; // radians, one per chip
export function snapCodeLength(family: CodeFamily, length: number): number;
```

## 3. Phase codes in the signal model

### 3.1 Model

The general model in `lib/dsp/signals.ts` gains one phase term:

  x(t) = m(t)·Σₙ Aₙ·a(t − tₙ)·cos[2π(f₀u + ½ku²) + φₙ + φ_code(u)],  u = t − tₙ

- φ_code(u) = c[⌊(u + τ/2)/T_c⌋], T_c = τ/L, τ = `pulse.widthSec` (for Gaussian envelopes the FWHM). Outside
  the code span the phase holds the first/last chip value.
- The same code on every pulse (referenced to each pulse's own center): trains, jitter and coherence work
  unchanged; `singlePulse` and the nominal train reference inherit the code.
- Rectangular chips (instantaneous phase steps).
- Carrier off: the carrier term becomes cos(φ_code(u)) — exactly ±1 for binary codes (baseband Barker).
  Polyphase with carrier off → warning with one-click fix "Turn carrier on" (`warnings.ts`).
- Code + chirp together is allowed (phase terms add); no special UI.
- `instFreq` (f_inst overlay) is unchanged (carrier + chirp only); the explanation text says so.

### 3.2 Code families (`lib/dsp/codes.ts`)

| Family | Valid lengths L | Phases |
|---|---|---|
| Barker | 2, 3, 4, 5, 7, 11, 13 | 0/π per the standard tables: 2 `+−`, 3 `++−`, 4 `++−+`, 5 `+++−+`, 7 `+++−−+−`, 11 `+++−−−+−−+−`, 13 `+++++−−++−+−+` |
| Frank | M², M = 2…10 (4…100) | φ(iM + j) = 2π·i·j/M, i, j = 0…M−1 |
| P4 | 2…256 | φᵢ = π·i²/L − π·i, i = 0…L−1 |

### 3.3 Config, sanitize, URL, templates

```ts
// SignalConfig
code: { enabled: boolean; family: CodeFamily; length: number } // default { false, 'barker', 13 }
```

- Sanitize: `family` enum; `length` snapped by `snapCodeLength` (nearest Barker length / nearest M² with
  M = 2…10 / integer 2…256).
- URL keys: `pce` (enabled, bool), `pcf` (family), `pcl` (length).
- `SignalType` gains `'phase-code'`; `signalTypeTemplate('phase-code')` → carrier on, pulse on (rect), code
  on, chirp off, repetition off. Other templates set `code.enabled = false`.
- `lib/presets/isolate.ts`: isolate key `code` (phase-coded rect pulse with carrier, everything else off).
- `lib/presets/minMode.ts`: `code.enabled` → Advanced ("the phase-code parameters").

### 3.4 Sampling and warnings

- `estimateSpectralExtent()`: with a code on, envelope extent ≥ 10/T_c and `unbounded = true` (chip edges are
  treated like rect edges at chip scale).
- New warning: fewer than 4 samples per chip → fix raises fₛ.

## 4. User interface

### 4.1 Workspace tab "Pulse compression" (`components/workspace/CompressionPanel.tsx`)

Placed after "Instrument model". Grid `lg:grid-cols-2 2xl:grid-cols-3`; cards from `parts.tsx`; plots via
`Plot` + `usePalette()` (light/dark for free).

**Warnings strip** (top, `Warn`): narrowband approximation exceeded; reference cut by record edges; weighting
with overlapping pulses; ambiguity grid capped; polyphase code with carrier off (with fix).

**Card 1 — Matched filter** (spans 2 columns)
- Controls: Reference `Segmented` pulse / train (train disabled with a note when no train); Weighting
  `SelectField`; Doppler mismatch ν — signed linear `EngineeringInput` (Hz) with a "0" reset; display dB /
  linear and dB floor.
- Plot |y(τ)|: noiseless output; noisy output when noise is on; faint unweighted ghost when weighting ≠ rect;
  shaded −3 dB band; dashed PSLR level; peak marker (Doppler shift visible); PRI markers for trains.
- Default view: ±reference duration (single pulse) or the whole output support (trains). Double-click returns
  to it (existing `Plot` behavior).

**Card 2 — Compression metrics**: `Row` table with measured and theory columns. Theory where a closed form
exists: τ_c (LFM 0.886/B; rect τ), PSLR (LFM −13.26 dB; Barker 20·log₁₀(1/L)), delay shift (−ν/k), weighting
loss (10·log₁₀ ENBW), integration gain (20·log₁₀N). Also compression ratio vs TB, ISLR, Doppler loss, ΔR,
integration loss, range-ambiguity peaks.

**Card 3 — Detection in noise**: SNR_in, SNR_out theory, SNR_out measured, processing gain. Hosts its own
`Noise on` toggle and `σ` field bound to `signal.noise.enabled` / `signal.noise.rms` (seeded, reproducible).

**Card 4 — Ambiguity function** (spans 2 columns)
- Heatmap |χ(τ, ν)| in dB (palette heatmap colorscale), dB range control (default 40 dB), horizontal line at
  the current ν. **Clicking the heatmap sets ν** to that row (`Plot` `onClick`).
- Zero-delay cut |χ(0, ν)| below it, with 1/T marked (trains: 1/(N·PRI) and ±PRF ambiguities).
- Controls: auto span (default on) or manual delay span / Doppler span.
- Footer: χ(0, 0), volume, resampled rate, grid size, compute time (ms).

Performance: matched filter in `useMemo` (signal, settings); ambiguity in `useMemo` over a `useDeferredValue`
of (reference, ambiguity settings). Nothing is computed while the tab is closed.

### 4.2 Control panel — "Phase code" section

Advanced level, directly after "Chirp (LFM)", new `SectionColor` `'code'` (token defined for light and dark in
`app/globals.css`), `enablePath="signal.code.enabled"`, `isolateKeys={['code']}`.
- Family `Segmented` (Barker / Frank / P4); Barker length `SelectField`; Frank M `SelectField` (label shows
  L = M²); P4 length `NumberField` (integer).
- Readouts: L, T_c, B ≈ 1/T_c, TB ≈ L; Barker: expected PSLR 20·log₁₀(1/L).
- Note: the f_inst overlay shows carrier + chirp only.

## 5. Config, URL state and presets

### 5.1 `analysis.compression`

```ts
compression: {
  reference: 'pulse' | 'train';                // default 'pulse'
  weighting: CompressionWeighting;             // default 'rect'
  dopplerHz: number;                           // default 0
  displayDb: boolean;                          // default true
  dbFloor: number;                             // default −60
  ambiguity: {
    autoSpan: boolean;                         // default true
    delaySpanSec: number;                      // default 1e-6 (used when autoSpan is false)
    dopplerSpanHz: number;                     // default 100e6
    dbRange: number;                           // default 40
  };
}
```

- Sanitize: enums for `reference` / `weighting`; `dopplerHz` ∈ [−1e12, 1e12]; spans ∈ (0, 1e12]; `dbRange`
  ∈ [10, 120]; `dbFloor` ∈ [−200, −10].
- URL keys: `mfr` reference, `mfw` weighting, `mfd` Doppler, `mfl` display dB, `mff` dB floor, `afa` auto
  span, `aft` delay span, `aff` Doppler span, `afr` dB range.
- `WorkspaceTab` and `Preset.tab` gain `'compression'`.

### 5.2 Presets — new category "Radar & pulse compression"

All open the compression tab, use auto sampling, respect Nyquist (existing test) and get a numeric test.

| id | Configuration | Headline (tested) |
|---|---|---|
| `mf-rect-pulse` | 1 µs rect pulse, carrier on, no code/chirp | compression ratio ≈ 1; zero-delay first null at 1/T |
| `lfm-tb100` | 1 µs rect, LFM 0.95 → 1.05 GHz (B = 100 MHz) | τ_c ≈ 8.86 ns; PSLR ≈ −13.3 dB; ratio ≈ 113 |
| `lfm-hamming` | as `lfm-tb100`, weighting Hamming | PSLR ≤ −40 dB; τ_c ≈ 1.47× unweighted; loss ≈ 1.34 dB |
| `lfm-doppler-coupling` | f_c = 1 GHz, 2.5 µs rect, LFM B = 20 MHz (TB = 50), ν = 2 MHz (inside the narrowband limit: 0.1 < 0.3) | peak shift ≈ −250 ns (≈ 5 τ_c); Doppler loss ≈ 0.92 dB |
| `barker-13` | Barker-13, carrier on | PSLR ≈ −22.3 dB |
| `p4-64` | P4, L = 64, carrier on | PSLR ≈ −24.4 dB (below Barker-13); LFM-like ridge (peak shift sign matches an up-chirp) |
| `coherent-train-ambiguity` | 8-pulse coherent train, reference = train | integration gain ≈ 18.06 dB; peaks at m·PRI |
| `same-energy-detection` | `compareWith`: 1 µs unmodulated RF pulse (A) vs the same pulse with LFM B = 100 MHz (B); same amplitude and duration ⇒ same energy; noise on | SNR_out equal within 0.5 dB; τ_c 1 µs vs ≈ 8.9 ns (≈ 113×) |

Mode switching uses the existing `minMode` derivation, no special cases: code/chirp presets → Advanced;
`same-energy-detection` (noise on) → Expert. Accepted: the switch never goes down and offers "Back to …".

## 6. Tests

| File | Checks |
|---|---|
| `tests/codes.test.ts` | Barker aperiodic autocorrelation sidelobes ≤ 1 (exact); Frank and P4 periodic autocorrelation sidelobes = 0 (≤ 1e-9); `snapCodeLength` for each family |
| `tests/compression.test.ts` | rect: triangle base 2τ, τ_c = τ; LFM TB ≥ 200: τ_c = 0.886/B (±2 %), PSLR −13.26 dB (±0.3 dB); Hamming: PSLR ≤ −40 dB, loss = 10·log₁₀ ENBW (±0.01 dB); Barker-13 PSLR −22.28 dB (±0.1 dB); coherent train gain 20·log₁₀N (±0.1 dB); incoherent train loss > 0; seeded noise: measured SNR_out within ±0.5 dB of Σx²/σ², equal for an unmodulated pulse and the equal-energy LFM; `'train'` without a train falls back to `'pulse'` |
| `tests/ambiguity.test.ts` | χ(0,0) = 1; volume = 1 (±2 %); zero-Doppler cut = matched-filter output; LFM ridge peak at τ = −ν/k; train peaks at (m·PRI, n·PRF) with heights (N−\|m\|)/N; zero-delay first null at 1/T; `capped` set beyond the limit |
| `tests/dsp.test.ts` (add) | baseband binary code = ±a(u) exactly; phase steps at chip boundaries; existing coherence tests unchanged with a code on |
| `tests/presets.test.ts` (add) | each headline in §5.2 |
| `tests/state.test.ts` (add) | URL round-trip for all new keys; sanitize ranges and length snapping |
| `tests/minmode.test.ts` (add) | pins the mode of each new preset |

## 7. Education content and documentation

- **Theory card** "Matched filter & ambiguity" (`TheoryPanel`, KaTeX): y(τ), SNR_out = 2E/N₀, compression
  ratio ≈ TB, χ(τ,ν) definition and volume property (link to σₜσ_f), narrowband-Doppler caveat.
- **Math panel**: shows the φ_code(u) term when a code is on (as it shows the chirp term).
- **Guided experiments** (`lib/education/experiments.ts`): (1) B ↑ at fixed T → τ_c ↓, SNR_out unchanged;
  (2) weighting trade-off; (3) Doppler: LFM shifts, Barker collapses; (4) jitter on a coherent train →
  integration loss.
- **Tooltips / explanations** for code family and length, reference, weighting, ν, spans, dB range.
- **Tutorial**: one new step introducing the tab (`lib/tutorial/steps.ts`).
- **README**: feature bullet; new modules in the architecture table; 4 rows in "What a student should
  discover"; numerical conventions (χ sign convention, normalization to the matched peak); limitations
  (narrowband Doppler, rectangular chips, ambiguity grid cap).
- **`docs/equation-verification.md`**: rows for every equation in §2 and §3 with source, method and test.

## 8. Files

**Create:** `lib/dsp/codes.ts`, `lib/dsp/compression.ts`, `lib/dsp/ambiguity.ts`,
`components/workspace/CompressionPanel.tsx`, `tests/codes.test.ts`, `tests/compression.test.ts`,
`tests/ambiguity.test.ts`.

**Modify:** `types/signal.ts`, `lib/dsp/signals.ts`, `lib/dsp/sampling.ts`, `lib/dsp/warnings.ts`,
`lib/presets/defaults.ts`, `lib/presets/presets.ts`, `lib/presets/isolate.ts`, `lib/presets/minMode.ts`,
`lib/state/sanitize.ts`, `lib/state/url.ts`, `components/lab/context.ts`, `components/workspace/Workspace.tsx`,
`components/controls/ControlPanel.tsx`, `components/controls/Section.tsx`, `app/globals.css`,
`components/education/TheoryPanel.tsx`, `components/education/MathPanel.tsx`, `lib/education/experiments.ts`,
`lib/education/tooltips.ts`, `lib/education/explanations.ts`, `lib/tutorial/steps.ts`, `README.md`,
`docs/equation-verification.md`, existing test files listed in §6.
