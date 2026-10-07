# Pulse Compression, Matched Filter & Ambiguity Function — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add phase-coded waveforms (Barker, Frank, P4) to the signal model and a "Pulse compression" workspace tab with matched-filter output, compression metrics, detection in noise and the ambiguity function.

**Architecture:** Three new React-free DSP modules (`codes.ts`, `compression.ts`, `ambiguity.ts`) operate on the existing `SignalResult`. One phase term is added to `synthesize()`. A new `analysis.compression` config group flows through the existing sanitize/URL/preset machinery. The tab is a self-contained workspace panel (pattern of `PowerPanel` / `InstrumentPanel`). Spec: `docs/superpowers/specs/2026-10-07-pulse-compression-design.md`.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Plotly (`Plot` wrapper), Tailwind v4 tokens, Vitest.

**Execution mode:** inline in the authoring session, one commit per phase (user request). Code for each step is written directly into the files; this plan fixes interfaces, algorithms, test cases and expected values.

**Verification commands** (run at the end of every phase):
- `npx vitest run` — all tests pass (baseline: 12 files, 227 tests)
- `npx tsc --noEmit` — no output
- `npx eslint .` — no errors (UI phases)

---

## Spec corrections found while planning

1. **Integration gain is an SNR quantity:** coherent integration of N pulses gains **10·log₁₀N** in SNR (9.03 dB for N = 8); the peak *amplitude* grows N× but the noise amplitude grows √N×. The spec's "20·log₁₀N" / "18.06 dB" is replaced by 10·log₁₀N / 9.03 dB everywhere.
2. **Output normalization:** outputs are normalized to a constant output-noise level, `y / √(E_ref · Σ|h|²)` (h = weighted filter). The matched, unweighted, zero-Doppler peak is then exactly 1 (0 dB), and with weighting or Doppler the peak drop in dB **is** the SNR loss (Hamming: −1.34 dB, not the −5.35 dB coherent gain).
3. **Complex representation rule:** bandpass ⇔ carrier or chirp on (the `decideKind` auto rule for carrier signals). Carrier-less signals — including DC-free monocycles — use the real record, so the output is the true real correlation.

---

## File structure

**Create**
| File | Responsibility |
|---|---|
| `lib/dsp/codes.ts` | Code tables/generators, length snapping, family metadata |
| `lib/dsp/compression.ts` | Complex representation, reference (pulse/nominal train, weighting), FFT correlation, metrics, SNR, warnings |
| `lib/dsp/ambiguity.ts` | Band-limited resampling, χ(τ,ν) grid, zero-delay cut, volume, auto span |
| `components/workspace/CompressionPanel.tsx` | The tab |
| `tests/codes.test.ts`, `tests/compression.test.ts`, `tests/ambiguity.test.ts` | Unit tests |

**Modify** — `types/signal.ts`, `lib/dsp/signals.ts`, `lib/dsp/sampling.ts`, `lib/dsp/warnings.ts`, `lib/presets/defaults.ts`, `lib/presets/presets.ts`, `lib/presets/isolate.ts`, `lib/presets/minMode.ts`, `lib/state/sanitize.ts`, `lib/state/url.ts`, `components/lab/context.ts`, `components/lab/useLabState.ts` (section reset), `components/lab/Lab.tsx` (warning fix), `components/education/StatusBar.tsx` (fix label), `components/workspace/Workspace.tsx`, `components/controls/ControlPanel.tsx`, `components/controls/Section.tsx`, `app/globals.css`, education files, `README.md`, `docs/equation-verification.md`, existing tests.

---

## Phase 1 — Phase codes in the signal model (commit 1)

### Task 1.1: `lib/dsp/codes.ts`

- [ ] Write `tests/codes.test.ts` first:

```ts
import { describe, expect, it } from 'vitest';
import { BARKER_LENGTHS, codePhases, snapCodeLength } from '@/lib/dsp/codes';

function aperiodicPeakSidelobe(ph: Float64Array): number {
  const L = ph.length;
  let pk = 0;
  for (let k = 1; k < L; k++) {
    let re = 0, im = 0;
    for (let i = 0; i + k < L; i++) { re += Math.cos(ph[i + k] - ph[i]); im += Math.sin(ph[i + k] - ph[i]); }
    pk = Math.max(pk, Math.hypot(re, im));
  }
  return pk;
}
function periodicPeakSidelobe(ph: Float64Array): number {
  const L = ph.length;
  let pk = 0;
  for (let k = 1; k < L; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < L; i++) { const d = ph[(i + k) % L] - ph[i]; re += Math.cos(d); im += Math.sin(d); }
    pk = Math.max(pk, Math.hypot(re, im));
  }
  return pk;
}

describe('phase codes', () => {
  it.each(BARKER_LENGTHS.map((l) => [l]))('Barker-%i has aperiodic sidelobes ≤ 1', (L) => {
    const ph = codePhases('barker', L);
    expect(ph.length).toBe(L);
    expect(aperiodicPeakSidelobe(ph)).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('Barker-13 peak sidelobe ratio is 1/13 (−22.28 dB)', () => {
    expect(20 * Math.log10(aperiodicPeakSidelobe(codePhases('barker', 13)) / 13)).toBeCloseTo(-22.28, 2);
  });
  it.each([4, 9, 16, 64, 100])('Frank L=%i is perfect periodic', (L) => {
    expect(periodicPeakSidelobe(codePhases('frank', L))).toBeLessThan(1e-9 * L);
  });
  it.each([2, 7, 16, 64, 255])('P4 L=%i is perfect periodic', (L) => {
    expect(periodicPeakSidelobe(codePhases('p4', L))).toBeLessThan(1e-9 * L);
  });
  it('P4-64 aperiodic PSLR ≈ −24.4 dB', () => {
    expect(20 * Math.log10(aperiodicPeakSidelobe(codePhases('p4', 64)) / 64)).toBeCloseTo(-24.36, 1);
  });
  it('snaps lengths per family', () => {
    expect(snapCodeLength('barker', 12)).toBe(13);
    expect(snapCodeLength('barker', 6)).toBe(5); // ties go to the shorter
    expect(snapCodeLength('barker', 1)).toBe(2);
    expect(snapCodeLength('frank', 50)).toBe(49);
    expect(snapCodeLength('frank', 2)).toBe(4);
    expect(snapCodeLength('frank', 500)).toBe(100);
    expect(snapCodeLength('p4', 1)).toBe(2);
    expect(snapCodeLength('p4', 70.4)).toBe(70);
    expect(snapCodeLength('p4', 999)).toBe(256);
  });
});
```

- [ ] Run `npx vitest run tests/codes.test.ts` → FAIL (module missing).
- [ ] Implement `lib/dsp/codes.ts`:

```ts
export type CodeFamily = 'barker' | 'frank' | 'p4';
export const CODE_FAMILIES: { id: CodeFamily; label: string }[] = [ { id: 'barker', label: 'Barker' }, { id: 'frank', label: 'Frank' }, { id: 'p4', label: 'P4' } ];
const BARKER: Record<number, string> = { 2: '+-', 3: '++-', 4: '++-+', 5: '+++-+', 7: '+++--+-', 11: '+++---+--+-', 13: '+++++--++-+-+' };
export const BARKER_LENGTHS = [2, 3, 4, 5, 7, 11, 13] as const;
export const FRANK_ORDERS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const; // L = M²
export const P4_MIN = 2, P4_MAX = 256;
export const isBinaryFamily = (f: CodeFamily) => f === 'barker';
export function snapCodeLength(family, length): number // nearest valid; ties → shorter; non-finite → family default (13 / 16 / 16)
export function codePhases(family, length): Float64Array  // snaps first
//   barker: '+' → 0, '−' → π
//   frank:  φ(iM + j) = 2π·i·j/M
//   p4:     φᵢ = π·i²/L − π·i
```

- [ ] Run the test → PASS.

### Task 1.2: config type, defaults, sanitize, URL

- [ ] `types/signal.ts`: `SignalType` gains `'phase-code'`; `SignalConfig.code: { enabled: boolean; family: CodeFamily; length: number }` (import type from `@/lib/dsp/codes`).
- [ ] `lib/presets/defaults.ts`: `code: { enabled: false, family: 'barker', length: 13 }`; `SIGNAL_TYPES` gains `{ id: 'phase-code', label: 'Phase-coded pulse', description: 'a(t)·cos[2πf₀t + φ_code(t)] — Barker / Frank / P4.' }`; `signalTypeTemplate`: `'phase-code'` → `{ signalType, carrier: { enabled: true }, pulse: { enabled: true, envelope: 'rect' }, code: { enabled: true }, chirp: { enabled: false }, repetition: { enabled: false } }`; templates `sinusoid`, `rect`, `gaussian`, `gaussian-derivative`, `burst`, `chirp` add `code: { enabled: false }`.
- [ ] `lib/state/sanitize.ts`: `ENUMS.signalType` gains `'phase-code'`; `ENUMS.codeFamily = ['barker','frank','p4']`; rule `{ path: 'signal.code.family', values: ENUMS.codeFamily }`; after the rule loop, snap `signal.code.length` with `snapCodeLength`.
- [ ] `lib/state/url.ts`: `['pce','signal.code.enabled','bool'], ['pcf','signal.code.family','str'], ['pcl','signal.code.length','num']`.
- [ ] Tests in `tests/state.test.ts`: sanitize snaps `{ family: 'frank', length: 50 }` → 49 and an unknown family → `'barker'`; URL round-trip of a P4-37 configuration.

### Task 1.3: `synthesize()` phase term

- [ ] Tests in `tests/dsp.test.ts` (`describe('phase codes in the signal model')`):
  - baseband Barker-13 (carrier off, rect τ = 1.3 µs, fs = 100 MHz, N = 1024): every sample inside the pulse is ±1 and the sign sequence sampled at chip centers equals `+++++−−++−+−+`.
  - carrier on, Barker-5: for chip m, `x(t) = cos(2πf₀u + φ₀ + π·[chip m is '−'])` at chip-center samples (to 1e-12).
  - a 4-pulse coherent train with a code: every pulse equals the single pulse shifted (pulse-locked reference) — checks the code is per pulse.
  - code on with pulse off has no effect (`x` identical to code off).
- [ ] Implement in `synthesize()`:

```ts
const code = cfg.code.enabled && pulseOn ? codePhases(cfg.code.family, cfg.code.length) : null;
const chips = code ? code.length : 0;
const codeHalf = 0.5 * cfg.pulse.widthSec;
const chipSec = code ? cfg.pulse.widthSec / chips : 1;
// per sample:
const pc = code ? code[Math.min(chips - 1, Math.max(0, Math.floor((u + codeHalf) / chipSec)))] : 0;
const c = carrier.on ? Math.cos(twoPi * (p.frequencyHz * u + 0.5 * k * u * u) + p.phaseRad + pc) : code ? Math.cos(pc) : 1;
```
  Update the header comment of `signals.ts` with the φ_code(u) term.

### Task 1.4: sampling, warnings, isolate, minMode

- [ ] `estimateSpectralExtent()`: when `cfg.code.enabled && cfg.pulse.enabled`: `env = Math.max(env, 10 / chipSec); unbounded = true`.
- [ ] `warnings.ts`: `WarningFix` gains `'enable-carrier'`. New warnings: `code-chip-samples` (fs·T_c < 4, level warning, fix `fix-sampling`) and `code-polyphase-baseband` (code on, family ≠ barker, carrier and chirp off; fix `enable-carrier`). `Lab.tsx` handles `'enable-carrier'` with `update('signal.carrier.enabled', true)`; `StatusBar.tsx` labels it "Turn carrier on".
- [ ] `isolate.ts`: `IsolateKey` gains `'code'` (label "phase code"); `CLEAN` gains `code: { ...DEFAULT_SIGNAL.code, enabled: false }`; case `'code'` → `{ signalType: 'phase-code', carrier on, pulse rect without edges, code: { ...c.code, enabled: true } }`.
- [ ] `minMode.ts`: `{ mode: 'advanced', reason: 'the phase-code parameters', active: (e) => e.signal.code.enabled && e.signal.pulse.enabled }`.
- [ ] `context.ts` `SectionKey` gains `'code'`; `useLabState.resetSection` resets `signal.code` (follow the existing pattern for `chirp`).
- [ ] Tests: `tests/dsp.test.ts` — auto sampling of Barker-13 at 1 µs has fs·T_c ≥ 4; `collectWarnings` emits `code-polyphase-baseband` for P4 with carrier off; `tests/presets.test.ts` — `isolate('code', e)` keeps family/length and turns jitter off; `tests/minmode.test.ts` — a code-on experiment needs Advanced.
- [ ] Run all verification commands → PASS. **Commit:** `feat(dsp): phase-coded pulses (Barker, Frank, P4) in the signal model`.

---

## Phase 2 — Matched filter (commit 2)

### Task 2.1: `lib/dsp/compression.ts`

Interfaces:

```ts
export type CompressionReference = 'pulse' | 'train';
export type CompressionWeighting = 'rect' | 'hann' | 'hamming' | 'blackman' | 'blackman-harris';
export interface ComplexSignal { re: Float64Array; im: Float64Array; fs: number; fc: number; kind: SpectrumKind }
export interface CompressionSettings { reference: CompressionReference; weighting: CompressionWeighting; dopplerHz: number }
export interface ReferenceInfo {
  signal: ComplexSignal;          // weighted reference
  unweighted: ComplexSignal;
  train: boolean;                 // effective (false when 'train' requested without a train)
  centers: number[];              // nominal pulse centers (s)
  span: [number, number];         // weighting span, offsets from a pulse center (s)
  duration: number;               // span width (pulse) or (N−1)·PRI + span width (train)
  overlap: boolean;               // span > PRI
  cut: boolean;                   // reference not ≈ 0 at the record edges
}
export function isBandpass(cfg: SignalConfig): boolean;         // carrier || chirp
export function toComplex(x: ArrayLike<number>, fs: number, cfg: SignalConfig): ComplexSignal;
export function nominalConfig(cfg: SignalConfig): SignalConfig; // known deterministic, unknown random
export function buildReference(signal: SignalResult, cfg: SignalConfig, s: CompressionSettings): ReferenceInfo;
export function correlate(rx: ComplexSignal, h: ComplexSignal, dopplerHz: number): { tau: Float64Array; re: Float64Array; im: Float64Array };
export interface CompressionMetrics {
  peakIndex: number; peakDelay: number; delayShift: number;
  widthSec: number;               // τ_c (−3 dB)
  pulseFwhm: number; ratio: number; tb: number | null;
  pslrDb: number; islrDb: number; // −Infinity when there are no sidelobes
  weightingLossDb: number; dopplerLossDb: number;
  rangeResolutionM: number;
  ambiguities: { delay: number; db: number }[];   // trains: peaks at m·PRI (m ≠ 0)
  integrationGainDb: number | null; integrationLossDb: number | null;
}
export interface SnrResult { sigma: number; inDb: number; outTheoryDb: number; outMeasuredDb: number; gainDb: number }
export interface CompressionResult {
  tau: Float64Array; mag: Float64Array;              // normalized |y| (noiseless)
  magNoisy: Float64Array | null; magUnweighted: Float64Array | null;
  metrics: CompressionMetrics; snr: SnrResult | null;
  reference: ReferenceInfo;
  narrowband: { ratio: number; nuLimitHz: number; exceeded: boolean; baseband: boolean };
}
export function analyzeCompression(signal: SignalResult, cfg: SignalConfig, s: CompressionSettings): CompressionResult;
```

Algorithms:
- `toComplex`: bandpass → `analyticSignal(x)`; otherwise re = x, im = 0. `fc = carrierModel(cfg, n/fs).centerHz` (0 when baseband).
- `nominalConfig`: copy with all jitter flags off, `coherence.mode` `'partial' | 'incoherent'` → `'coherent'`, noise off, quantization off. Taper, Δφ increment, code and chirp kept.
- `buildReference`: single pulse = `signal.singlePulse`; train (requested, `isTrain(cfg)`, `pulseCount > 1`) = `synthesize(nominal, realizePulses(nominal, observation), fs, n, observation).x`. Weighting span = `activeRange(|singlePulse|, 1e-3)` as offsets from the train center `tc`; `w(t) = windowValue(name, (t − tₙ − lo)/(hi − lo))` for each center, 0 outside; `rect` → no weighting.
- `correlate`: L = nextPowerOfTwo(2N); A = FFT(rx·e^{j2πνt}), B = FFT(h); y = IFFT(A·conj(B)); reorder lags −(N−1)…(N−1); τ = k/fs.
- Normalization: divide by `√(E_ref,unweighted · Σ|h|²)`.
- Main peak: global max of the ν = 0 noiseless output; among equal maxima (within 1e-9) the one nearest τ = 0. Metrics window: whole output (single pulse) or ±PRI/2 around the peak (trains). Doppler output: max within the same window shifted by the expected coupling is not assumed — search the whole window.
- Mainlobe: walk outward from the peak while |y| decreases; τ_c from linear interpolation at −3 dB. PSLR = max outside the mainlobe in the window; ISLR = Σ|y|² outside / inside.
- SNR (noise or quantization on): noise = x − xIdeal; σ² = mean noise²; y_n = correlate(toComplex(noise), h, ν); var = mean |y_n|² over lags k where the shifted reference support lies inside the record. `inDb = 10log(max xIdeal² / σ²)`; `outTheoryDb = 10log(Σ ref_unweighted_real² / σ²) − weightingLoss − dopplerLoss` (real energies); `outMeasuredDb = 10log(|y_ideal,raw(peak)|² / var)`.
- Integration (train reference only): gain = `10log(E_train / E_pulse)` of the nominal real references; loss = `20log(peak on the actual record / peak on the nominal record)` with the same filter.
- Narrowband: B ≈ 1/τ_c, T = `reference.duration`; ratio = |ν|·B·T/f_c; `nuLimitHz = 0.3·f_c/(B·T)`; baseband → `baseband: true`, ratio = NaN.

### Task 2.2: `tests/compression.test.ts`

Experiments use `mergeExperiment(DEFAULT_EXPERIMENT, …)` with manual sampling.

| Case | Setup | Expect |
|---|---|---|
| rect RF pulse | 1 GHz, rect 1 µs, fs 4 GHz, N 16384 | peak 1 (±1e-6); τ_c = 1 µs (±1 %); PSLR = −∞; ratio ≈ 1 (±2 %) |
| LFM TB 200 | 0.9→1.1 GHz, 1 µs, fs 4 GHz, N 16384 | τ_c = 0.886/B (±2 %); PSLR −13.26 dB (±0.3); ratio ≈ 1.13·TB (±3 %) |
| Hamming | same, weighting hamming | PSLR ≤ −40 dB; weightingLoss = 10log(ENBW_hamming) = 1.34 dB (±0.02); τ_c ×1.47 (±5 %) |
| Doppler coupling | B 20 MHz, T 2.5 µs, ν 2 MHz | delayShift = −250 ns (±2 %); dopplerLoss = 0.92 dB (±0.1) |
| Barker-13 | carrier 1 GHz, τ 1 µs | PSLR −22.28 dB (±0.1) |
| baseband Barker-13 | carrier off | PSLR −22.28 dB (±0.1); output real-correlation based |
| coherent train | 100 ns burst, PRF 2 MHz, 8 pulses, reference train | integrationGain 9.03 dB (±0.05); ambiguity peaks at ±500 ns with 20log(7/8) dB (±0.05) |
| incoherent train | same with coherence incoherent | integrationLoss > 3 dB |
| train fallback | reference 'train' on a single pulse | `reference.train === false` |
| noise | rect RF pulse and LFM TB 100, amplitude 1, noise rms 1, seed 3 | outMeasured within ±0.5 dB of outTheory; outTheory equal for both (±0.01 dB) |

- [ ] Write the tests → FAIL; implement → PASS; verification commands. **Commit:** `feat(dsp): matched filter, weighting, Doppler mismatch and compression metrics`.

---

## Phase 3 — Ambiguity function (commit 3)

### Task 3.1: `lib/dsp/ambiguity.ts`

```ts
export interface AmbiguityOptions { delaySpanSec: number; dopplerSpanHz: number; delayPoints?: number /* 512 */; dopplerPoints?: number /* 201, odd */ }
export interface AmbiguityResult {
  tau: Float64Array; nu: Float64Array;
  mag: Float32Array[];         // rows by ν, |χ| normalized (χ(0,0) = 1), peak-preserving over each delay cell
  zeroDelay: Float64Array;     // |χ(0, ν)|
  peak: number;                // χ(0,0)
  volume: number;              // Σ|χ|²·Δτ·Δν at full lag resolution, within the Doppler span
  fsResampled: number; capped: boolean; ms: number;
}
export const MAX_AMBIGUITY_SAMPLES = 8192;
export function autoAmbiguitySpan(ref: ReferenceInfo, cfg: SignalConfig, widthSec: number): { delaySpanSec: number; dopplerSpanHz: number };
export function ambiguity(ref: ComplexSignal, o: AmbiguityOptions): AmbiguityResult;
```

Algorithm: downconvert by f_c → crop to `activeRange(|z|, 1e-4)` → FFT → W = smallest half-width holding 99 % of the energy → fs′ = min(fs, 1.25·(2W + 2·Dν)), M = ceil(M₀·fs′/fs) capped at `MAX_AMBIGUITY_SAMPLES` (`capped`) → band-limited resample (keep bins |f| < fs′/2, IFFT at length M, scale M/M₀) → `Bc = conj(FFT(z′, Lp))`, Lp = nextPowerOfTwo(2M) → per ν row: IFFT(FFT(z′·e^{j2πνt}, Lp)·Bc), normalize by E = Σ|z′|², accumulate volume, take lag 0 for `zeroDelay`, peak-preserving max into the delay cells.

Auto span: delay = `ref.duration` (single) or `(N−1)·PRI + span width` (train); Doppler = train ? 2.5·PRF : max(1/τ_c, 4/T).

### Task 3.2: `tests/ambiguity.test.ts`

| Case | Expect |
|---|---|
| any reference | `peak` = 1 (±1e-9) |
| Gaussian RF pulse, Doppler span = fs′/2 | volume = 1 (±2 %) |
| LFM 1 µs, 100 MHz | ν = 0 row equals the matched-filter output (`analyzeCompression` mag) at matching delays (±0.01); row at ν = 20 MHz peaks at τ = −ν/k = −200 ns (±1 delay cell) with \|χ\| ≈ 0.8 (±0.02) |
| rect RF pulse 1 µs | first null of `zeroDelay` at 1/T = 1 MHz (±3 %) |
| coherent 8-pulse train | peaks at (m·PRI, 0) with (8−\|m\|)/8 (±0.01) and at (0, ±PRF) ≈ 1 (±0.02) |
| tiny cap | `capped === true` when the resampled length would exceed the cap (call with an artificially large span) |

- [ ] Tests → FAIL; implement → PASS; verification. **Commit:** `feat(dsp): narrowband ambiguity function with zero-delay cut and volume check`.

---

## Phase 4 — Config and the Pulse compression tab (commit 4)

### Task 4.1: `analysis.compression`

- [ ] `types/signal.ts`: `AnalysisConfig.compression` (spec §5.1). Defaults: `{ reference: 'pulse', weighting: 'rect', dopplerHz: 0, displayDb: true, dbFloor: -60, ambiguity: { autoSpan: true, delaySpanSec: 1e-6, dopplerSpanHz: 100e6, dbRange: 40 } }`.
- [ ] Sanitize rules (enums `compRef`, `compWeighting`; ranges per spec) and URL keys `mfr, mfw, mfd, mfl, mff, afa, aft, aff, afr`.
- [ ] `WorkspaceTab` and `Preset.tab` gain `'compression'`.
- [ ] Tests in `tests/state.test.ts`: URL round-trip of every new key; sanitize clamps `dbRange` 500 → 120, `dopplerHz` 1e15 → 1e12, unknown weighting → `'rect'`.

### Task 4.2: `components/workspace/CompressionPanel.tsx`

Layout per spec §4.1: warnings strip; Card "Matched filter" (`lg:col-span-2`) with Reference `Segmented`, Weighting `SelectField`, Doppler `EngineeringInput kind="freq" log={false} min={-span} max={span}` + "0" `SmallButton`, dB/linear `Segmented`, dB floor `NumberField`, and the |y(τ)| plot (noiseless, noisy, unweighted ghost, −3 dB shading, PSLR line, peak marker, PRI markers); Card "Compression metrics"; Card "Detection in noise" (noise toggle + σ field bound to `signal.noise.*`); Card "Ambiguity function" (`lg:col-span-2`) with heatmap (click → `update('analysis.compression.dopplerHz', y)`), ν line, narrowband-limit dashed lines, zero-delay cut, auto span toggle, manual spans, dB range, footer readouts.

- Computation: `useMemo(() => analyzeCompression(signal, exp.signal, settings))`; ambiguity in `useMemo` over `useDeferredValue({ ref, opts })`.
- Plot data decimated with `minMaxIndices` / `pick` (≤ 2000 points) over the default view.
- Delay axis in the engineering time unit chosen by `chooseUnit` for the view span; Doppler axis in Hz units likewise.
- [ ] `Workspace.tsx`: tab `{ id: 'compression', label: 'Pulse compression' }` after `instrument`; render `<CompressionPanel signal={signal} />`.
- [ ] Browser verification (preview `dev`): open the tab for the default burst, an LFM, a train; check console clean; light/dark; click the heatmap; screenshot.
- [ ] Verification commands. **Commit:** `feat(ui): Pulse compression tab with matched filter, metrics, SNR and ambiguity function`.

---

## Phase 5 — Phase-code controls (commit 5)

- [ ] `Section.tsx`: `SectionColor` gains `'code'`; `app/globals.css`: `--color-sec-code` for light and dark (teal-ish hue distinct from chirp: dark `#5fc4b8`, light `#1f7a70`).
- [ ] `ControlPanel.tsx`: Section "Phase code" (level advanced, after "Chirp (LFM)", `enablePath="signal.code.enabled"`, `isolateKeys={['code']}`, `resetKey="code"`): family `Segmented`; Barker length `SelectField`; Frank M `SelectField` (labels "M = 8 (L = 64)"); P4 `NumberField` integer 2–256; readouts L, T_c, B ≈ 1/T_c, TB ≈ L, Barker expected PSLR; `Note` about f_inst.
- [ ] Tooltips `codeFamily`, `codeLength` in `lib/education/tooltips.ts`; explanation entries for `code.*` in `lib/education/explanations.ts`.
- [ ] Browser verification (Advanced mode, Barker → Frank → P4, baseband Barker, P4 without carrier → warning fix works).
- [ ] Verification commands. **Commit:** `feat(ui): phase-code section in the control panel`.

---

## Phase 6 — Presets (commit 6)

- [ ] `PresetCategory` gains `'Radar & pulse compression'`. Presets (all `tab: 'compression'`, manual sampling, spectrum/TF view fitted):

| id | signal | analysis.compression |
|---|---|---|
| `mf-rect-pulse` | burst 1 GHz, rect 1 µs, fs 4 GHz, N 16384 | defaults |
| `lfm-tb100` | chirp 0.95→1.05 GHz, rect 1 µs, fs 4 GHz, N 16384 | defaults |
| `lfm-hamming` | as `lfm-tb100` | weighting `hamming` |
| `lfm-doppler-coupling` | chirp 0.99→1.01 GHz, rect 2.5 µs, fs 4 GHz, N 32768 | dopplerHz 2e6 |
| `barker-13` | phase-code Barker 13, 1 GHz, rect 1 µs, fs 4 GHz, N 16384 | defaults |
| `p4-64` | phase-code P4 64, 1 GHz, rect 1 µs, fs 4 GHz, N 16384 | defaults |
| `coherent-train-ambiguity` | burst 1 GHz rect 100 ns, PRF 2 MHz, 8 pulses, coherent, fs 4 GHz, N 32768 | reference `train` |
| `same-energy-detection` | B: `lfm-tb100` + noise rms 1; `compareWith` A: `mf-rect-pulse` + noise rms 1 | defaults |

  Every preset resets `analysis.compression` to the defaults explicitly where it relies on them (so URL/preset application starts clean).
- [ ] `tests/presets.test.ts`: one test per preset asserting its headline (τ_c, PSLR, delay shift, integration gain 9.03 dB, SNR equality ±0.5 dB). `tests/minmode.test.ts`: pin Advanced for chirp/code presets, Expert for `same-energy-detection`, Basic for `mf-rect-pulse` and `coherent-train-ambiguity`.
- [ ] Verification commands; quick browser check of two presets. **Commit:** `feat(presets): radar & pulse-compression presets with numeric tests`.

---

## Phase 7 — Education content and docs (commit 7)

- [ ] `TheoryPanel.tsx`: card "Matched filter & ambiguity" (KaTeX): y(τ), SNR_out = 2E/N₀, compression ratio ≈ TB, χ(τ,ν) and the volume property (link to σₜσ_f), narrowband caveat.
- [ ] `MathPanel.tsx`: φ_code(u) term when a code is on.
- [ ] `lib/education/experiments.ts`: 4 experiments (B ↑ at fixed T; weighting trade-off; Doppler LFM vs Barker; jitter → integration loss), each with preset/steps in the existing format.
- [ ] Tooltips for reference, weighting, ν, spans, dB range.
- [ ] `lib/tutorial/steps.ts`: one step highlighting the new tab (existing step format; `tests` for the tutorial if any count steps — update counts and README "25-step" → "26-step").
- [ ] `README.md`: feature bullets (phase codes, Pulse compression tab), architecture table rows (`codes.ts`, `compression.ts`, `ambiguity.ts`), 4 discovery rows, conventions (χ sign convention; normalization to constant output noise), limitations (narrowband Doppler, rectangular chips, ambiguity band-limited to 99 % energy and grid cap).
- [ ] `docs/equation-verification.md`: rows for matched-filter SNR, LFM τ_c and PSLR, Hamming loss = ENBW, Barker PSLR, Frank/P4 periodic property, χ(0,0), volume, LFM ridge τ = −ν/k, train peaks, integration gain.
- [ ] Verification commands + `npm run build`. **Commit:** `docs+education: pulse compression theory, experiments, tutorial step, README`.
