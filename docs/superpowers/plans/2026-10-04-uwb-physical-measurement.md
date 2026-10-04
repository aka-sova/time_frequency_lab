# UWB Power/Energy & Instrument-Model Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the physically-grounded, non-"systems-engineering" parts of `UWB_Pulse_Lab_HE.html` into the Time–Frequency Lab: absolute power/energy/fluence in V and V/m, pulse-width definitions, a measurement-instrument model (bandwidth limit, sampling phase, ADC clipping, trigger-jitter averaging), two small calculators, and 8 new presets — English only, light/dark themed, with every equation verified by tests.

**Architecture:** Pure, React-free DSP modules in `lib/dsp/` (`power`, `pulsewidth`, `instrument`, `budget`) that operate on the *existing* generated waveform (`SignalResult`) — nothing is re-simulated analytically. Two new config groups (`analysis.load`, `analysis.instrument`) plus a third amplitude unit (`V/m`) flow through the existing sanitize/URL/preset machinery. Two new workspace tabs (“Power & energy”, “Instrument model”) reuse `Plot`, `usePalette()` and the existing control primitives, so light/dark theming comes for free.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Plotly (`Plot` wrapper), Tailwind v4 theme tokens, Vitest.

---

## 0. Decisions already made (from your answers) and scope

| Topic | Decision |
|---|---|
| Language | English only. No Hebrew/RTL. All Hebrew copy is re-written, not translated 1:1. |
| Scope | **No** systems-engineering narrative (no 8-item requirement list, glossary, “what to report” stage walkthrough, source essay). Only physics/measurement features. |
| Theming | New UI uses only `usePalette()` (Plotly) and the existing Tailwind tokens (`border-line`, `bg-surface`, `text-ink-2`, …). No hard-coded colors. |
| Verification | Every equation is re-derived and checked in code (§2). Tests are added for each. |
| Presets | 8 new presets in 2 new categories (§6). |

**In scope (ported):**
1. Power / energy / fluence in physical units (V into R Ω, V/m in free space), equivalent width, net area, average power at a PRF **including overlapping pulses** (§3, Tasks 1, 4, 5).
2. Pulse-width *definitions* (amplitude FWHM, power FWHM, energy-fraction widths, custom % / central-vs-outer crossing) (Task 2).
3. Instrument model applied to **any** waveform of the lab: single-pole bandwidth limit, scope sample rate + sample phase, ADC clip, Gaussian trigger-jitter averaging (Tasks 6, 7).
4. Two small calculators: rise-time budget (`√Σtr²` + square-subtraction extraction) and first-order power uncertainty (Task 7).
5. Presets, guided experiments, theory equations, README, equation-verification doc (Tasks 8–10).

**Already in the app — not ported:** aliasing/fold demo (`aliasFrequency`, `aliasing` preset), Gaussian / monocycle / doublet / RF-burst shapes (`gaussian`, `gaussian-d1`, `gaussian-d2`, `burst`), bandwidth definitions, PRF comb, CSV export.

**Explicitly out of scope (optional follow-up, needs your OK):** the HTML’s *ripple / ringing* model (1–20 cycles, per-cycle levels, decay, in-pulse vs post-pulse). It changes the signal model in `lib/dsp/signals.ts`, so it deserves its own plan. See §11.

---

## 1. File structure

**Create**
| File | Responsibility |
|---|---|
| `lib/dsp/power.ts` | `ETA0`, `powerContext`, `trapezoid`, `energyStats`, `supportSpan`, `foldPeriodic`, `periodicStats` |
| `lib/dsp/pulsewidth.ts` | `pulseWidth(t, x, {basis, startPct, endPct, scope})` |
| `lib/dsp/instrument.ts` | `lowpassFirstOrder`, `gaussianAverage`, `interpolateCubic`, `activeRange`, `simulateInstrument` |
| `lib/dsp/budget.ts` | `riseFromBandwidth`, `combineRise`, `extractRise`, `powerUncertainty` |
| `components/workspace/parts.tsx` | `Card`, `Row`, `Warn` (shared by the two new panels) |
| `components/workspace/PowerPanel.tsx` | “Power & energy” tab |
| `components/workspace/InstrumentPanel.tsx` | “Instrument model” tab (+ rise budget + uncertainty cards) |
| `tests/power.test.ts`, `tests/pulsewidth.test.ts`, `tests/instrument.test.ts`, `tests/budget.test.ts`, `tests/state.test.ts` | Unit tests |
| `docs/equation-verification.md` | Equation table with sources, method, result |
| `docs/reference/UWB_Pulse_Lab_HE.html` | The original file moved here (it is the source of the ported equations; currently untracked in repo root) |

**Modify**
| File | Change |
|---|---|
| `types/signal.ts` | `AmplitudeUnit` (`'normalized'|'V'|'V/m'`), `AnalysisConfig.load`, `AnalysisConfig.instrument` |
| `lib/presets/defaults.ts` | defaults for `load`, `instrument` |
| `lib/state/sanitize.ts`, `lib/state/url.ts` | enum + ranges + short URL keys |
| `lib/units/format.ts` | `BaseUnit` + prefix lists for W, J, V/m, W/m², J/m², Ω; `VOLT_UNITS`, `FIELD_UNITS`; `amplitudeUnitLabel()` |
| `components/controls/primitives.tsx` | `UNIT_SETS`/`BASE` get `volt` and `field` |
| `components/controls/ControlPanel.tsx` | 3-way amplitude unit, log amplitude input for V / V/m |
| `components/plots/SpectrumPlot.tsx`, `components/plots/TimePlot.tsx`, `lib/export.ts` | V/m labels |
| `components/lab/context.ts`, `components/workspace/Workspace.tsx`, `lib/presets/presets.ts` | `'power' | 'instrument'` tab ids, preset categories |
| `lib/presets/presets.ts` | 8 new presets |
| `lib/education/experiments.ts`, `components/education/MathPanel.tsx`, `lib/education/tooltips.ts` | experiments, equations, tooltips |
| `README.md` | feature + verification notes |
| `tests/presets.test.ts` | numeric checks for the new presets |

---

## 2. Equation verification (done now, before any code — results are baked into tests in Tasks 1–7)

I extracted every formula from the HTML and checked it numerically in a scratch script (Node, trapezoid integration, 2×10⁵ points). Findings:

| # | Equation (as used in the HTML) | Check performed | Result |
|---|---|---|---|
| E1 | `P(t)=v²/R`, `E=∫P dt`; Gaussian `v=A·exp(−t²/2σ²)` ⇒ `P_pk=A²/R`, `E=A²σ√π/R` | numeric ∫ for A=10 V, R=50 Ω, σ=0.5 ns | `P_pk=2 W`, `E=1.772454×10⁻⁹ J` — matches closed form to 14 digits. The HTML’s “2 W / 1.77245 nJ / 177.245 µW @100 kHz” banner is correct. |
| E2 | Free space: `S=E²/η₀`, fluence `=∫S dt`, `η₀=376.730313412 Ω` (CODATA 2022) | 10 V/m peak | `S_pk=0.265442 W/m²`; sinusoid average `E²_rms/η₀=0.132721 W/m²` (= peak/2). Correct. Note: valid for a plane wave in the far field only (kept as a stated limit in the UI). |
| E3 | Single pole: `H=1/(1+jf/BW)`, `τ=1/(2π·BW)`, `t_r(10–90)=ln9·τ≈0.3497/BW` | analytic + numeric | Correct. The HTML rounds to the textbook `0.35/BW`; we expose both constants. |
| E4 | Gaussian pulse through single pole (numerical RC in HTML: `y_i = a·y_{i−1}+(1−a)(x_i+x_{i−1})/2`) | compared with the closed form `y(t)=σ√(2π)/(2τ)·exp(σ²/2τ²−t/τ)·erfc((σ/τ−t/σ)/√2)` | max abs error `1.0×10⁻⁶` at dt = 2.1 ps, τ=531 ps. Correct. **We will use the exact ramp-invariant recurrence** `y_i=a·y_{i−1}+(1−a)x_{i−1}+m(Δt−τ(1−a))` (exact for piecewise-linear input) so accuracy does not depend on dt/τ. |
| E5 | Trigger-jitter averaging = convolution with Gaussian: `σ_avg=√(σ²+σ_j²)`, `V_pk,avg=σ/σ_avg` | analytic (σ=0.5 ns, σ_j=0.25 ns) | ratio `0.894427`. Correct. This is the *expectation* of an infinite average (no noise); the UI must say so. |
| E6 | Rise-time combination `t_r,meas≈√(t_sig²+t_scope²+t_probe²)` with `t≈0.35/BW` | exact two-identical-single-pole step response (`1−e^{−t}(1+t)`) | exact 10–90 % = `3.358τ` vs quadrature `3.107τ` → **quadrature under-estimates by 8.1 %** for single-pole cascades. The rule is exact only for Gaussian responses. **Kept, but labelled “approximation”, and a test documents the 8 % bound.** |
| E7 | Power uncertainty `u_P/P=√((2u_V/V)²+(u_R/R)²)`, `U=k·u` | 3 % / 1 % example | `u=6.083 %`, `U(k=2)=12.17 %`. Correct for small, independent relative errors; no covariance term; `k=2 ≠ guaranteed 95 %`. Kept with that caveat. |
| E8 | Pulse-width definitions on a Gaussian (σ = Gaussian std of the *amplitude*) | analytic | amplitude FWHM `2.3548σ`; **power** FWHM `1.6651σ`; central 90 % energy (5→95 %) `2.3262σ`. Used as test oracles. |
| E9 | Monocycle `u·e^{1/2}·e^{−u²/2}` peak = 1 at `u=±1`; doublet `(1−u²)e^{−u²/2}` peak = 1 at 0 | analytic | Identical to the lab’s existing `gaussian-d1` / `gaussian-d2` envelopes. No port needed. |
| E10 | Alias frequency `|f−round(f/fs)·fs|` | compared with `aliasFrequency` | Identical in the lab (`lib/dsp/sampling.ts`). No port needed. |

**No errors found in the HTML’s equations.** Two caveats surfaced and are carried into the UI text: **E5** (expectation, not a noisy average) and **E6** (approximation, up to ~8 % off for single-pole cascades). One *implementation* upgrade (E4 exact recurrence).

---

## 3. Design notes that drive the tasks

* **Which waveform is analysed.** For a pulse train the panels use `signal.singlePulse` (clean, un-jittered, one pulse); otherwise `signal.xIdeal` (noise- and quantisation-free). Whole-train numbers use `xIdeal`.
* **Units.** `signal.amplitudeUnit` decides the physics: `'V'` → resistive load (`Z=analysis.load.resistanceOhm`), `'V/m'` → free space (`Z=η₀`), `'normalized'` → panels show a call-to-action to switch unit. No separate “mode” state.
* **Repeated-pulse average power.** `P_avg = E_pulse·PRF` only when pulses do not overlap. When `PRF⁻¹ < support span` the single pulse is *folded* modulo the period and the mean of `y²` is used (this is the HTML’s `computePeriodic`, re-implemented with linear interpolation and a hard cap so cost stays `O(n)`).
* **Bandpass signals** (carrier/chirp on): pulse-width definitions and instrument FWHM/rise use the Hilbert envelope (`hilbertEnvelope`) — same convention as `computeMeasurements`.
* **Instrument sampling from a dense grid.** Scope samples are taken from the filtered waveform by Catmull-Rom cubic interpolation (error test in Task 6). A warning is shown if the lab’s own sample rate is < 8× the scope bandwidth.
* **Performance.** `gaussianAverage` is one FFT pair of size `nextPow2(2n)` (n ≤ 131 072) — only when jitter > 0; everything is memoised on `analysis.instrument`.

---

## Task 0: Branch, baseline, and the source file

**Files:**
- Move: `UWB_Pulse_Lab_HE.html` → `docs/reference/UWB_Pulse_Lab_HE.html`

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feature/uwb-power-instrument
```

- [ ] **Step 2: Baseline — everything must be green before we start**

```bash
npm run typecheck && npm test && npm run lint
```
Expected: typecheck clean, all existing Vitest tests pass, lint clean. **If anything fails here, stop and report — do not start on a red baseline.**

- [ ] **Step 3: Move the reference file into the repo**

```bash
mkdir -p docs/reference && git mv -f UWB_Pulse_Lab_HE.html docs/reference/UWB_Pulse_Lab_HE.html 2>/dev/null || mv UWB_Pulse_Lab_HE.html docs/reference/UWB_Pulse_Lab_HE.html
git add docs/reference/UWB_Pulse_Lab_HE.html
git commit -m "docs: add UWB Pulse Lab reference page (source of ported equations)"
```
(Needs your OK: alternative is to leave it untracked and add it to `.gitignore`.)

---

## Task 1: `lib/dsp/power.ts` — power, energy, periodic average (TDD)

**Files:**
- Create: `lib/dsp/power.ts`
- Test: `tests/power.test.ts`
- Modify (type only, needed for compile): `types/signal.ts` (add `AmplitudeUnit` — see Task 3 Step 3; do that one-line type edit now)

- [ ] **Step 1: Add the `AmplitudeUnit` type** in `types/signal.ts` next to `SamplingMode`, and use it in `SignalConfig`:

```ts
export type AmplitudeUnit = 'normalized' | 'V' | 'V/m';
```
and change `amplitudeUnit: 'normalized' | 'V';` → `amplitudeUnit: AmplitudeUnit;`.

- [ ] **Step 2: Write the failing tests** — `tests/power.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPERIMENT, mergeExperiment } from '@/lib/presets/defaults';
import { generateSignal } from '@/lib/dsp/signals';
import { ETA0, energyStats, foldPeriodic, periodicStats, powerContext, supportSpan, trapezoid } from '@/lib/dsp/power';
import type { DeepPartial, Experiment } from '@/types/signal';

const exp = (p: DeepPartial<Experiment>) => mergeExperiment(DEFAULT_EXPERIMENT, p);
// Gaussian with σ = 0.5 ns  →  FWHM = 2√(2 ln2)·σ
const FWHM_05 = 2 * Math.sqrt(2 * Math.LN2) * 0.5e-9;

function gaussian10V() {
  const e = exp({
    signal: {
      signalType: 'gaussian',
      amplitude: 10,
      amplitudeUnit: 'V',
      carrier: { enabled: false },
      pulse: { envelope: 'gaussian', widthSec: FWHM_05 },
      repetition: { enabled: false },
      sampling: { mode: 'manual', sampleRateHz: 100e9, sampleCount: 4096 },
    },
  });
  return generateSignal(e.signal);
}

describe('powerContext', () => {
  it('maps amplitude units to physics', () => {
    expect(powerContext('normalized', 50)).toBeNull();
    expect(powerContext('V', 75)).toMatchObject({ quantity: 'load', impedance: 75, powerUnit: 'W', energyUnit: 'J' });
    expect(powerContext('V/m', 75)).toMatchObject({ quantity: 'field', impedance: ETA0, powerUnit: 'W/m²', energyUnit: 'J/m²' });
  });
  it('uses the CODATA-2022 impedance of free space', () => {
    expect(ETA0).toBeCloseTo(376.730313412, 9);
  });
});

describe('trapezoid', () => {
  it('integrates a ramp exactly', () => {
    const y = Float64Array.from({ length: 11 }, (_, i) => i); // 0..10, dt=1  → ∫ = 50
    expect(trapezoid(y, 1)).toBeCloseTo(50, 12);
  });
});

describe('energyStats — E1 (Gaussian into 50 Ω)', () => {
  it('peak power 2 W, energy A²σ√π/R = 1.77245 nJ', () => {
    const sig = gaussian10V();
    const s = energyStats(sig.singlePulse, sig.fs, 50);
    expect(s.peak).toBeCloseTo(10, 6);
    expect(s.peakPower).toBeCloseTo(2, 6);
    expect(s.energy / 1.7724538509e-9).toBeCloseTo(1, 4);
    expect(s.equivalentWidth / (0.5e-9 * Math.sqrt(Math.PI))).toBeCloseTo(1, 4); // E/Ppk = σ√π
    expect(Math.abs(s.netArea)).toBeGreaterThan(0); // unipolar Gaussian has area A·σ√(2π)
    expect(s.netArea / (10 * 0.5e-9 * Math.sqrt(2 * Math.PI))).toBeCloseTo(1, 4);
  });
  it('average power at 100 kHz is 177.245 µW', () => {
    const sig = gaussian10V();
    const p = periodicStats(sig.singlePulse, sig.fs, 100e3, 50);
    expect(p.overlap).toBe(false);
    expect(p.averagePower / 177.245e-6).toBeCloseTo(1, 4);
  });
});

describe('energyStats — E2 (free space)', () => {
  it('10 V/m peak → S_pk = 0.265442 W/m²', () => {
    const peakS = (10 * 10) / ETA0;
    expect(peakS).toBeCloseTo(0.265442, 6);
    const n = 4000;
    const x = Float64Array.from({ length: n }, (_, i) => 10 * Math.sin((2 * Math.PI * i * 40) / n)); // 40 whole periods
    const s = energyStats(x, 1e9, ETA0);
    expect(s.peakPower).toBeCloseTo(peakS, 5);
    // sinusoid: <S> = peak/2
    expect(s.energy / (n / 1e9) / (peakS / 2)).toBeCloseTo(1, 3);
  });
});

describe('monocycle', () => {
  it('has (numerically) zero net area, unlike a Gaussian', () => {
    const e = exp({
      signal: { signalType: 'gaussian-derivative', amplitude: 10, amplitudeUnit: 'V', carrier: { enabled: false }, pulse: { envelope: 'gaussian-d1', widthSec: FWHM_05 }, repetition: { enabled: false }, sampling: { mode: 'manual', sampleRateHz: 100e9, sampleCount: 4096 } },
    });
    const sig = generateSignal(e.signal);
    const s = energyStats(sig.singlePulse, sig.fs, 50);
    expect(Math.abs(s.netArea)).toBeLessThan(1e-6 * 10 * 1e-9);
    expect(s.peak).toBeCloseTo(10, 1); // monocycle normalised to peak 1
  });
});

describe('supportSpan / foldPeriodic / periodicStats', () => {
  const fs = 10e9;
  const rect = (len: number, lead: number, total: number) => Float64Array.from({ length: total }, (_, i) => (i >= lead && i < lead + len ? 1 : 0));

  it('supportSpan measures first→last significant sample', () => {
    expect(supportSpan(rect(100, 20, 200), fs)).toBeCloseTo(99 / fs, 15);
    expect(supportSpan(new Float64Array(10), fs)).toBe(0);
  });

  it('folds two overlapping copies of a rectangle into a constant 2', () => {
    const x = rect(100, 20, 200); // 10 ns wide
    const { y, dt } = foldPeriodic(x, fs, 5e-9); // period 5 ns → 2 copies overlap everywhere
    expect(y.length).toBe(50);
    expect(dt).toBeCloseTo(0.1e-9, 18);
    for (const v of y) expect(v).toBeCloseTo(2, 12);
  });

  it('overlap: mean power = (2 V)²/1 Ω = 4 W; peak 2 V; E·PRF would be wrong (2 W)', () => {
    const x = rect(100, 20, 200);
    const p = periodicStats(x, fs, 1 / 5e-9, 1);
    expect(p.overlap).toBe(true);
    expect(p.peak).toBeCloseTo(2, 12);
    expect(p.averagePower).toBeCloseTo(4, 9);
    const naive = energyStats(x, fs, 1).energy / 5e-9;
    expect(naive).toBeLessThan(p.averagePower); // cross terms matter
  });

  it('matches a brute-force sum of many shifted copies (non-integer-free period of 80 samples)', () => {
    const base = Float64Array.from({ length: 200 }, (_, i) => Math.exp(-0.5 * ((i - 100) / 25) ** 2)); // wide Gaussian
    const period = 80; // samples
    const total = 80 * 40;
    const long = new Float64Array(total + 400);
    for (let k = 0; k < 40; k++) for (let i = 0; i < base.length; i++) long[k * period + i] += base[i];
    // mean of long² over 20 whole periods well inside the train
    let acc = 0;
    for (let i = 8 * period; i < 28 * period; i++) acc += long[i] * long[i];
    const brute = acc / (20 * period);
    const p = periodicStats(base, 1, 1 / period, 1); // fs = 1 sample/s → time unit = samples
    expect(p.overlap).toBe(true);
    expect(p.averagePower / brute).toBeCloseTo(1, 9);
  });

  it('caps absurd PRF so cost stays bounded', () => {
    const x = rect(100, 20, 200);
    const p = periodicStats(x, fs, 1e15, 1);
    expect(Number.isFinite(p.averagePower)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/power.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dsp/power'`.

- [ ] **Step 4: Implement** `lib/dsp/power.ts`

```ts
/**
 * Power and energy of a sampled waveform in physical units (React-free).
 *
 *   resistive load:  P(t) = v²(t)/R          E = ∫ P dt            [W], [J]
 *   free space:      S(t) = E²(t)/η₀         fluence = ∫ S dt      [W/m²], [J/m²]
 *
 * The free-space relation holds for a plane wave far from the source; it is
 * not the radiated power of any particular antenna.
 */
import type { AmplitudeUnit } from '@/types/signal';

/** Impedance of free space, CODATA 2022 (Ω). */
export const ETA0 = 376.730313412;

export interface PowerContext {
  quantity: 'load' | 'field';
  /** Load resistance R, or η₀ for a field (Ω). */
  impedance: number;
  amplitudeUnit: 'V' | 'V/m';
  powerUnit: 'W' | 'W/m²';
  energyUnit: 'J' | 'J/m²';
}

/** Null for normalized amplitudes (no physical interpretation). */
export function powerContext(unit: AmplitudeUnit, resistanceOhm: number): PowerContext | null {
  if (unit === 'V') return { quantity: 'load', impedance: resistanceOhm, amplitudeUnit: 'V', powerUnit: 'W', energyUnit: 'J' };
  if (unit === 'V/m') return { quantity: 'field', impedance: ETA0, amplitudeUnit: 'V/m', powerUnit: 'W/m²', energyUnit: 'J/m²' };
  return null;
}

/** ∫ y dt on a uniform grid (trapezoid rule). */
export function trapezoid(y: ArrayLike<number>, dt: number): number {
  const n = y.length;
  if (n < 2) return 0;
  let s = 0.5 * (y[0] + y[n - 1]);
  for (let i = 1; i < n - 1; i++) s += y[i];
  return s * dt;
}

export interface EnergyStats {
  /** max |x| (V or V/m). */
  peak: number;
  /** peak² / Z. */
  peakPower: number;
  /** ∫ x²/Z dt (J or J/m²). */
  energy: number;
  /** E / P_peak — width of the rectangle with equal peak power and energy (s). */
  equivalentWidth: number;
  /** ∫ x dt (V·s or V·s/m): zero for a DC-free pulse such as a monocycle. */
  netArea: number;
}

export function energyStats(x: ArrayLike<number>, fs: number, z: number): EnergyStats {
  const n = x.length;
  const sq = new Float64Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    sq[i] = x[i] * x[i];
    peak = Math.max(peak, Math.abs(x[i]));
  }
  const dt = 1 / fs;
  const energy = trapezoid(sq, dt) / z;
  const peakPower = (peak * peak) / z;
  return { peak, peakPower, energy, equivalentWidth: peakPower > 0 ? energy / peakPower : NaN, netArea: trapezoid(x, dt) };
}

/** Time between the first and last sample with |x| > rel·peak (0 if none). */
export function supportSpan(x: ArrayLike<number>, fs: number, rel = 1e-6): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (!(peak > 0)) return 0;
  const thr = rel * peak;
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) <= thr) a++;
  while (b > a && Math.abs(x[b]) <= thr) b--;
  return (b - a) / fs;
}

/**
 * Superposes copies of x shifted by multiples of `period` onto one period:
 *   y(τ) = Σ_k x(τ + kT),  0 ≤ τ < T
 * on a grid of m = ⌈T·fs⌉ points (linear interpolation of x).
 */
export function foldPeriodic(x: ArrayLike<number>, fs: number, period: number): { y: Float64Array; dt: number } {
  const m = Math.max(2, Math.ceil(period * fs - 1e-9));
  const dt = period / m;
  const last = (x.length - 1) / fs;
  const y = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    for (let k = 0; ; k++) {
      const u = j * dt + k * period;
      if (u > last + 1e-15) break;
      const pos = u * fs;
      const i = Math.min(Math.floor(pos + 1e-9), x.length - 1);
      const frac = pos - i;
      sum += i + 1 < x.length && frac > 1e-9 ? x[i] + (x[i + 1] - x[i]) * frac : x[i];
    }
    y[j] = sum;
  }
  return { y, dt };
}

export interface PeriodicStats {
  period: number;
  /** True when copies of the pulse overlap in time (P_avg ≠ E·PRF). */
  overlap: boolean;
  peak: number;
  peakPower: number;
  energyPerPeriod: number;
  averagePower: number;
  /** peakPower / averagePower. */
  peakToAverage: number;
}

/**
 * Peak and average power of the pulse repeated at `prf`. Without overlap
 * this is E·PRF; with overlap the copies are summed (amplitudes add) first.
 */
export function periodicStats(x: ArrayLike<number>, fs: number, prf: number, z: number): PeriodicStats {
  const period = Math.max(1 / prf, 2 / fs); // never fold below two samples per period
  const single = energyStats(x, fs, z);
  const span = supportSpan(x, fs);
  if (!(period < span)) {
    const averagePower = single.energy / period;
    return { period, overlap: false, peak: single.peak, peakPower: single.peakPower, energyPerPeriod: single.energy, averagePower, peakToAverage: averagePower > 0 ? single.peakPower / averagePower : NaN };
  }
  const { y, dt } = foldPeriodic(x, fs, period);
  let sum = 0;
  let peak = 0;
  for (let j = 0; j < y.length; j++) {
    sum += y[j] * y[j];
    peak = Math.max(peak, Math.abs(y[j]));
  }
  const energyPerPeriod = (sum * dt) / z;
  const averagePower = energyPerPeriod / period;
  const peakPower = (peak * peak) / z;
  return { period, overlap: true, peak, peakPower, energyPerPeriod, averagePower, peakToAverage: averagePower > 0 ? peakPower / averagePower : NaN };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/power.test.ts`
Expected: PASS (all tests). If the E1 `4`-digit tolerance fails, print `s.energy` — it must be `1.7724538×10⁻⁹`; a failure means the Gaussian envelope or sampling in the test is wrong, not the integrator.

- [ ] **Step 6: Commit**

```bash
git add lib/dsp/power.ts tests/power.test.ts types/signal.ts
git commit -m "feat(dsp): power/energy/periodic-average in physical units, with tests (E1,E2)"
```

---

## Task 2: `lib/dsp/pulsewidth.ts` — pulse-width definitions (TDD)

**Files:**
- Create: `lib/dsp/pulsewidth.ts`
- Test: `tests/pulsewidth.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { pulseWidth } from '@/lib/dsp/pulsewidth';

const fs = 200e9;
const sigma = 0.5e-9;
const n = 8192;
const t = Float64Array.from({ length: n }, (_, i) => i / fs);
const t0 = (n / 2) / fs;
const gauss = Float64Array.from(t, (v) => Math.exp(-0.5 * ((v - t0) / sigma) ** 2));
const mono = Float64Array.from(t, (v) => {
  const u = (v - t0) / sigma;
  return u * Math.exp(0.5) * Math.exp(-0.5 * u * u);
});

describe('pulseWidth on a Gaussian (E8)', () => {
  it('amplitude FWHM = 2√(2 ln2)σ', () => {
    const r = pulseWidth(t, gauss, { basis: 'amplitude', startPct: 50, endPct: 50 });
    expect(r.valid).toBe(true);
    expect(r.width / (2 * Math.sqrt(2 * Math.LN2) * sigma)).toBeCloseTo(1, 3);
  });
  it('power FWHM = 2√(ln2)σ', () => {
    const r = pulseWidth(t, gauss, { basis: 'power', startPct: 50, endPct: 50 });
    expect(r.width / (2 * Math.sqrt(Math.LN2) * sigma)).toBeCloseTo(1, 3);
  });
  it('central 90 % of the energy (5→95 %) = 2.32617σ and holds 90 % of E', () => {
    const r = pulseWidth(t, gauss, { basis: 'energy', startPct: 5, endPct: 95 });
    expect(r.width / (2.3261743 * sigma)).toBeCloseTo(1, 3);
    expect(r.energyFraction).toBeCloseTo(0.9, 3);
  });
});

describe('pulseWidth on a bipolar monocycle', () => {
  it('central picks the lobe around the (first) peak; outer spans both lobes', () => {
    const c = pulseWidth(t, mono, { basis: 'amplitude', startPct: 50, endPct: 50, scope: 'central' });
    const o = pulseWidth(t, mono, { basis: 'amplitude', startPct: 50, endPct: 50, scope: 'outer' });
    // 50 % crossings of u·e^{(1−u²)/2}: u = 0.31911 and 1.92162
    expect(c.width / ((1.9216229 - 0.3191057) * sigma)).toBeCloseTo(1, 2);
    expect(o.width / (2 * 1.9216229 * sigma)).toBeCloseTo(1, 2);
  });
});

describe('pulseWidth validation', () => {
  it('rejects out-of-range percentages', () => {
    const r = pulseWidth(t, gauss, { basis: 'amplitude', startPct: -1, endPct: 50 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/0 and 100/);
  });
  it('energy basis needs end > start', () => {
    const r = pulseWidth(t, gauss, { basis: 'energy', startPct: 60, endPct: 40 });
    expect(r.valid).toBe(false);
  });
  it('a 0 % amplitude level is never crossed', () => {
    const r = pulseWidth(t, gauss, { basis: 'amplitude', startPct: 0, endPct: 0 });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/crossing/i);
  });
  it('all-zero waveform is invalid, not NaN-valid', () => {
    expect(pulseWidth(t, new Float64Array(n), { basis: 'power', startPct: 50, endPct: 50 }).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/pulsewidth.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `lib/dsp/pulsewidth.ts`

```ts
/**
 * Pulse width under several definitions (React-free). Percentages refer to the
 * absolute sample peak (amplitude, power) or to the cumulative energy.
 *
 *   amplitude: |x|/peak          power: (x/peak)²          energy: ∫x² / E_total
 *
 * 'central' takes the rising crossing closest to (before) the first absolute
 * peak and the first falling crossing after it, i.e. the width of the main
 * lobe. 'outer' takes the first rising and the last falling crossing, which
 * spans every lobe of a multi-lobe pulse.
 */
export type WidthBasis = 'amplitude' | 'power' | 'energy';
export type EdgeScope = 'central' | 'outer';

export interface WidthOptions {
  basis: WidthBasis;
  startPct: number;
  endPct: number;
  scope?: EdgeScope;
}

export interface WidthResult {
  valid: boolean;
  start: number;
  end: number;
  width: number;
  /** Fraction of the total energy between start and end. */
  energyFraction: number;
  error?: string;
}

const fail = (error: string): WidthResult => ({ valid: false, start: NaN, end: NaN, width: NaN, energyFraction: NaN, error });

function cumulativeEnergy(t: ArrayLike<number>, x: ArrayLike<number>): Float64Array {
  const c = new Float64Array(x.length);
  for (let i = 1; i < x.length; i++) c[i] = c[i - 1] + 0.5 * (x[i - 1] * x[i - 1] + x[i] * x[i]) * (t[i] - t[i - 1]);
  return c;
}

/** Linear interpolation of y(t) at tq (clamped to the ends). */
function valueAt(t: ArrayLike<number>, y: ArrayLike<number>, tq: number): number {
  if (tq <= t[0]) return y[0];
  const last = t.length - 1;
  if (tq >= t[last]) return y[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] < tq) lo = mid;
    else hi = mid;
  }
  return y[lo] + ((y[hi] - y[lo]) * (tq - t[lo])) / (t[hi] - t[lo]);
}

/** Time at which a nondecreasing y reaches `level`. */
function timeAt(t: ArrayLike<number>, y: ArrayLike<number>, level: number): number {
  const last = t.length - 1;
  if (level <= y[0]) return t[0];
  if (level >= y[last]) return t[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (y[mid] < level) lo = mid;
    else hi = mid;
  }
  const d = y[hi] - y[lo];
  return d > 0 ? t[lo] + ((level - y[lo]) / d) * (t[hi] - t[lo]) : t[hi];
}

export function pulseWidth(t: ArrayLike<number>, x: ArrayLike<number>, o: WidthOptions): WidthResult {
  const { basis, startPct, endPct } = o;
  const scope = o.scope ?? 'central';
  if (![startPct, endPct].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) return fail('Percentages must be between 0 and 100.');
  if (x.length < 3 || t.length !== x.length) return fail('Not enough samples.');

  let peak = 0;
  let peakIdx = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) {
      peak = a;
      peakIdx = i;
    }
  }
  if (!(peak > 0)) return fail('The waveform is identically zero.');

  const cum = cumulativeEnergy(t, x);
  const total = cum[cum.length - 1];
  let start: number;
  let end: number;

  if (basis === 'energy') {
    if (endPct <= startPct) return fail('For cumulative energy the end percentage must exceed the start percentage.');
    start = timeAt(t, cum, (total * startPct) / 100);
    end = timeAt(t, cum, (total * endPct) / 100);
  } else {
    const level = (i: number) => (basis === 'power' ? (x[i] / peak) ** 2 * 100 : (Math.abs(x[i]) / peak) * 100);
    const tPeak = t[peakIdx];
    const rising: number[] = [];
    const falling: number[] = [];
    const cross = (i: number, target: number) => {
      const a = level(i);
      const b = level(i + 1);
      return t[i] + ((target - a) / (b - a)) * (t[i + 1] - t[i]);
    };
    const eps = 1e-10 * Math.abs(t[t.length - 1] - t[0]);
    for (let i = 0; i < x.length - 1; i++) {
      const a = level(i);
      const b = level(i + 1);
      if (a < startPct && b >= startPct) {
        const tc = cross(i, startPct);
        if (tc <= tPeak + eps) rising.push(tc);
      }
      if (a >= endPct && b < endPct) {
        const tc = cross(i, endPct);
        if (tc >= tPeak - eps) falling.push(tc);
      }
    }
    if (!rising.length || !falling.length) return fail('No complete level crossing inside the record (a 0 % level is never crossed — use a small positive level).');
    start = scope === 'central' ? rising[rising.length - 1] : rising[0];
    end = scope === 'central' ? falling[0] : falling[falling.length - 1];
  }

  const eStart = valueAt(t, cum, start);
  const eEnd = valueAt(t, cum, end);
  return { valid: true, start, end, width: Math.max(0, end - start), energyFraction: total > 0 ? Math.max(0, eEnd - eStart) / total : NaN };
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/pulsewidth.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dsp/pulsewidth.ts tests/pulsewidth.test.ts
git commit -m "feat(dsp): pulse width by amplitude/power/energy definition (E8)"
```

---

## Task 3: Config, units and state plumbing (V/m, load, instrument)

**Files:**
- Modify: `types/signal.ts`, `lib/presets/defaults.ts`, `lib/state/sanitize.ts`, `lib/state/url.ts`, `lib/units/format.ts`, `components/controls/primitives.tsx`, `components/controls/ControlPanel.tsx`, `components/plots/SpectrumPlot.tsx`, `components/plots/TimePlot.tsx`, `lib/export.ts`
- Test: `tests/state.test.ts`

- [ ] **Step 1: Write the failing tests** — `tests/state.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPERIMENT } from '@/lib/presets/defaults';
import { sanitizeExperiment } from '@/lib/state/sanitize';
import { experimentToQuery, queryToExperiment } from '@/lib/state/url';
import { setPath } from '@/lib/state/path';
import { amplitudeUnitLabel, formatEngineering } from '@/lib/units/format';
import { waveformCsv } from '@/lib/export';
import { generateSignal } from '@/lib/dsp/signals';

describe('new config groups', () => {
  it('defaults: 50 Ω load and a 1 GHz / 10 GS/s instrument', () => {
    expect(DEFAULT_EXPERIMENT.analysis.load.resistanceOhm).toBe(50);
    expect(DEFAULT_EXPERIMENT.analysis.instrument).toMatchObject({ bandwidthHz: 1e9, sampleRateHz: 10e9, samplePhasePct: 0, triggerJitterRmsSec: 0, clipEnabled: false, clipRatio: 1.2 });
  });
  it('sanitize accepts V/m and clamps instrument/load ranges', () => {
    let e = setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'V/m');
    expect(sanitizeExperiment(e).signal.amplitudeUnit).toBe('V/m');
    e = setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'furlongs');
    expect(sanitizeExperiment(e).signal.amplitudeUnit).toBe('normalized');
    e = setPath(setPath(setPath(DEFAULT_EXPERIMENT, 'analysis.load.resistanceOhm', -5), 'analysis.instrument.samplePhasePct', 400), 'analysis.instrument.bandwidthHz', 1);
    const s = sanitizeExperiment(e).analysis;
    expect(s.load.resistanceOhm).toBe(0.1);
    expect(s.instrument.samplePhasePct).toBe(100);
    expect(s.instrument.bandwidthHz).toBe(1e6);
  });
  it('URL round-trips the new keys', () => {
    let e = setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'V/m');
    e = setPath(e, 'analysis.load.resistanceOhm', 75);
    e = setPath(e, 'analysis.instrument.bandwidthHz', 3e8);
    e = setPath(e, 'analysis.instrument.clipEnabled', true);
    const q = experimentToQuery(e, 'default');
    const back = queryToExperiment(q)!.experiment;
    expect(back.signal.amplitudeUnit).toBe('V/m');
    expect(back.analysis.load.resistanceOhm).toBe(75);
    expect(back.analysis.instrument.bandwidthHz).toBe(3e8);
    expect(back.analysis.instrument.clipEnabled).toBe(true);
  });
});

describe('units', () => {
  it('formats W, J, V/m, W/m², J/m², Ω with SI prefixes', () => {
    expect(formatEngineering(1.77245e-9, 'J')).toBe('1.77 nJ');
    expect(formatEngineering(177.245e-6, 'W')).toBe('177 µW');
    expect(formatEngineering(0.2654, 'W/m²')).toBe('265 mW/m²');
    expect(formatEngineering(10e3, 'V/m')).toBe('10.0 kV/m');
    expect(formatEngineering(50, 'Ω')).toBe('50.0 Ω');
  });
  it('amplitudeUnitLabel', () => {
    expect(amplitudeUnitLabel('normalized')).toBe('norm.');
    expect(amplitudeUnitLabel('V')).toBe('V');
    expect(amplitudeUnitLabel('V/m')).toBe('V/m');
  });
  it('CSV header names the field unit', () => {
    const sig = generateSignal(setPath(DEFAULT_EXPERIMENT, 'signal.amplitudeUnit', 'V/m').signal);
    expect(waveformCsv(sig, 'V/m').split('\n')[0]).toContain('V_per_m');
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/state.test.ts` → FAIL (`load`/`instrument` undefined, missing exports).

- [ ] **Step 3: `types/signal.ts`** — add to `AnalysisConfig` (before `tfView`):

```ts
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
```

- [ ] **Step 4: `lib/presets/defaults.ts`** — in `DEFAULT_ANALYSIS`, after `tfView: 'stft',` add:

```ts
  load: { resistanceOhm: 50 },
  instrument: { bandwidthHz: 1e9, sampleRateHz: 10e9, samplePhasePct: 0, triggerJitterRmsSec: 0, clipEnabled: false, clipRatio: 1.2 },
```

- [ ] **Step 5: `lib/state/sanitize.ts`** — `ampUnit: ['normalized', 'V', 'V/m'],` and in `RULES` (after the `analysis.tfView` rule):

```ts
  { path: 'analysis.load.resistanceOhm', min: 0.1, max: 1e6 },
  { path: 'analysis.instrument.bandwidthHz', min: 1e6, max: 1e12 },
  { path: 'analysis.instrument.sampleRateHz', min: 1e6, max: 1e13 },
  { path: 'analysis.instrument.samplePhasePct', min: 0, max: 100 },
  { path: 'analysis.instrument.triggerJitterRmsSec', min: 0, max: 1e-6 },
  { path: 'analysis.instrument.clipRatio', min: 0.05, max: 10 },
```

- [ ] **Step 6: `lib/state/url.ts`** — append to `URL_KEYS` (all keys are unused today):

```ts
  ['rl', 'analysis.load.resistanceOhm', 'num'],
  ['ibw', 'analysis.instrument.bandwidthHz', 'num'],
  ['ifs', 'analysis.instrument.sampleRateHz', 'num'],
  ['iph', 'analysis.instrument.samplePhasePct', 'num'],
  ['ijt', 'analysis.instrument.triggerJitterRmsSec', 'num'],
  ['ice', 'analysis.instrument.clipEnabled', 'bool'],
  ['icr', 'analysis.instrument.clipRatio', 'num'],
```

- [ ] **Step 7: `lib/units/format.ts`** — extend and add:

```ts
export type BaseUnit = 's' | 'Hz' | 'V' | 'rad' | '' | 'V/Hz' | 'Hz/s' | 'V/m' | 'W' | 'J' | 'W/m²' | 'J/m²' | 'Ω';
```
In `ALLOWED` add:
```ts
  W: ['', 'k', 'M', 'G', 'm', 'µ', 'n', 'p'],
  'W/m²': ['', 'k', 'M', 'G', 'm', 'µ', 'n', 'p'],
  J: ['', 'k', 'm', 'µ', 'n', 'p', 'f'],
  'J/m²': ['', 'k', 'm', 'µ', 'n', 'p', 'f'],
  'V/m': ['', 'k', 'M', 'm', 'µ'],
  Ω: ['', 'k', 'M', 'm'],
```
After `CHIRP_RATE_UNITS` add:
```ts
export const VOLT_UNITS: UnitChoice[] = [
  { label: 'mV', scale: 1e-3 },
  { label: 'V', scale: 1 },
  { label: 'kV', scale: 1e3 },
  { label: 'MV', scale: 1e6 },
];

export const FIELD_UNITS: UnitChoice[] = [
  { label: 'mV/m', scale: 1e-3 },
  { label: 'V/m', scale: 1 },
  { label: 'kV/m', scale: 1e3 },
  { label: 'MV/m', scale: 1e6 },
];

export function amplitudeUnitLabel(u: AmplitudeUnit): string {
  return u === 'normalized' ? 'norm.' : u;
}
```
and `import type { AmplitudeUnit } from '@/types/signal';` at the top.

- [ ] **Step 8: `lib/export.ts`** — add helper and use it:

```ts
function ampTag(u: AmplitudeUnit): string {
  return u === 'V' ? 'V' : u === 'V/m' ? 'V_per_m' : 'normalized';
}
```
Change both function signatures to `amplitudeUnit: AmplitudeUnit` (import the type), then: in `waveformCsv` `const u = ampTag(amplitudeUnit);`; in `spectrumCsv` replace the three `amplitudeUnit === 'V'` ternaries with `ampTag`-based ones:
```ts
  const tag = ampTag(amplitudeUnit);
  const unit = s.scaling === 'ft' ? (amplitudeUnit === 'normalized' ? 'norm_s' : `${tag}_per_Hz`) : tag;
  const rows = [`f_Hz,magnitude_${unit},magnitude_dB_re_peak,psd_two_sided_${amplitudeUnit === 'normalized' ? 'norm2' : `${tag}2`}_per_Hz,phase_rad`];
```

- [ ] **Step 9: plots** — `components/plots/SpectrumPlot.tsx` line 32:

```ts
export function unitLabels(amplitudeUnit: AmplitudeUnit) {
  if (amplitudeUnit === 'V') return { ft: 'V/Hz', amp: 'V', psd: 'V²/Hz' };
  if (amplitudeUnit === 'V/m') return { ft: 'V/m/Hz', amp: 'V/m', psd: '(V/m)²/Hz' };
  return { ft: 'a.u.·s', amp: 'a.u.', psd: 'a.u.²/Hz' };
}
```
`components/plots/TimePlot.tsx` line 41: `const ampUnit = amplitudeUnitLabel(cfg.amplitudeUnit);` (import from `@/lib/units/format`; import `AmplitudeUnit` type in SpectrumPlot).

- [ ] **Step 10: `components/controls/primitives.tsx`** — extend the unit tables:

```ts
import { CHIRP_RATE_UNITS, FIELD_UNITS, FREQ_UNITS, TIME_UNITS, VOLT_UNITS, … } from '@/lib/units/format'; // keep existing imports
const UNIT_SETS = { time: TIME_UNITS, freq: FREQ_UNITS, chirp: CHIRP_RATE_UNITS, volt: VOLT_UNITS, field: FIELD_UNITS } as const;
const BASE = { time: 's', freq: 'Hz', chirp: 'Hz/s', volt: 'V', field: 'V/m' } as const;
```

- [ ] **Step 11: `components/controls/ControlPanel.tsx`** — replace the amplitude `NumberField` (line 68) and the `Segmented` options:

```tsx
        {s.amplitudeUnit === 'normalized' ? (
          <NumberField label="Amplitude A" path="signal.amplitude" min={0} max={2} step={0.01} suffix="norm." tip="amplitude" lock />
        ) : (
          <EngineeringInput
            label="Amplitude A (peak)"
            path="signal.amplitude"
            kind={s.amplitudeUnit === 'V' ? 'volt' : 'field'}
            min={1e-2}
            max={1e5}
            hardMin={0}
            hardMax={1e6}
            tip="amplitude"
            hint={s.amplitudeUnit === 'V' ? <>Across the {lab.exp.analysis.load.resistanceOhm} Ω load set in the Power &amp; energy tab</> : <>Free-space plane wave, η₀ = 376.73 Ω</>}
          />
        )}
```
and in the `Segmented`:
```tsx
              options={[
                { value: 'normalized', label: 'norm.' },
                { value: 'V', label: 'V' },
                { value: 'V/m', label: 'V/m' },
              ]}
```
(Segmented’s generic `T extends string` accepts `'V/m'`.) Also the amplitude-unit `Gate level="advanced"` stays; because the new tabs tell users to switch unit, add a `Note` is unnecessary.

- [ ] **Step 12: Run everything**

```bash
npx vitest run tests/state.test.ts && npm run typecheck && npm test
```
Expected: new tests PASS; typecheck clean (it will flag any missed `'normalized' | 'V'` literal — fix those, they are the same one-line change); full suite PASS.

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "feat(state): V/m amplitude unit, load and instrument config, SI units for W/J/Ω"
```

---

## Task 4: Workspace shell — tab ids and shared card components

**Files:**
- Create: `components/workspace/parts.tsx`
- Modify: `components/lab/context.ts`, `components/workspace/Workspace.tsx`, `lib/presets/presets.ts` (type union + categories only)

- [ ] **Step 1: `components/workspace/parts.tsx`**

```tsx
import type { ReactNode } from 'react';

export function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-sm border border-line bg-surface ${className}`}>
      <h3 className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-2">{title}</h3>
      <div className="p-3 text-[12px]">{children}</div>
    </div>
  );
}

export function Row({ k, v, sub }: { k: ReactNode; v: ReactNode; sub?: ReactNode }) {
  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="py-1 pr-3 text-ink-2">{k}</td>
      <td className="tabular py-1 text-right font-mono text-ink">{v}</td>
      {sub !== undefined ? <td className="tabular py-1 pl-3 text-right font-mono text-muted">{sub}</td> : null}
    </tr>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-sm border border-line border-l-2 border-l-s4 bg-panel px-2 py-1 text-[11.5px] text-ink-2">{children}</p>;
}
```
> `border-l-s4` / `text-s5` are the existing series tokens used in `Workspace.tsx`; before using, confirm `s4` exists with `grep -n "\-\-color-s4\|s4" app/globals.css`. If it does not, use `border-l-accent`.

- [ ] **Step 2: `components/lab/context.ts`** — `export type WorkspaceTab = 'measurements' | 'power' | 'instrument' | 'ab' | 'sweep' | 'leakage' | 'synthesis' | 'theory' | 'experiments';`

- [ ] **Step 3: `lib/presets/presets.ts`** — in `Preset.tab` use `import type { WorkspaceTab } from '@/components/lab/context'` is a layering inversion (lib → components), so instead extend the literal union there identically: `tab?: 'measurements' | 'power' | 'instrument' | 'ab' | 'sweep' | 'leakage' | 'synthesis' | 'theory' | 'experiments';` and the categories:

```ts
export type PresetCategory = 'Fundamentals' | 'Pulse trains' | 'Sampling & DFT' | 'Time–frequency' | 'UWB & bandwidth' | 'Power & energy' | 'Instrument model' | 'Experiments';
export const PRESET_CATEGORIES: PresetCategory[] = ['Fundamentals', 'Pulse trains', 'UWB & bandwidth', 'Power & energy', 'Instrument model', 'Sampling & DFT', 'Time–frequency', 'Experiments'];
```

- [ ] **Step 4: `components/workspace/Workspace.tsx`** — add tabs after `measurements` and render them:

```tsx
import PowerPanel from './PowerPanel';
import InstrumentPanel from './InstrumentPanel';
…
  { id: 'measurements', label: 'Measurements' },
  { id: 'power', label: 'Power & energy' },
  { id: 'instrument', label: 'Instrument model' },
…
        {tab === 'power' ? <PowerPanel signal={signal} /> : null}
        {tab === 'instrument' ? <InstrumentPanel signal={signal} /> : null}
```

- [ ] **Step 5:** create temporary stub panels so the app compiles until Tasks 5 and 7 (they are replaced, not kept):

```tsx
// components/workspace/PowerPanel.tsx  (stub)
import type { SignalResult } from '@/lib/dsp/signals';
export default function PowerPanel(_: { signal: SignalResult }) { return <p className="text-muted">Power &amp; energy — coming next.</p>; }
```
(same shape for `InstrumentPanel.tsx`)

- [ ] **Step 6:** `npm run typecheck && npm test` → clean. Commit: `git add -A && git commit -m "feat(ui): workspace tab ids, shared card parts, preset categories"`.

---

## Task 5: `PowerPanel` — “Power & energy” tab

**Files:**
- Modify (replace stub): `components/workspace/PowerPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js-dist-min';
import type { SignalResult } from '@/lib/dsp/signals';
import { isTrain } from '@/lib/dsp/signals';
import { hilbertEnvelope } from '@/lib/dsp/spectrum';
import { energyStats, periodicStats, powerContext, supportSpan } from '@/lib/dsp/power';
import { pulseWidth, type EdgeScope, type WidthBasis, type WidthOptions } from '@/lib/dsp/pulsewidth';
import { formatEngineering, formatNumber } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import { NumberField, Segmented, SmallButton } from '@/components/controls/primitives';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';
import { Card, Row, Warn } from './parts';

const WIDTH_ROWS: { id: string; label: string; opts: WidthOptions }[] = [
  { id: 'fwhm', label: 'FWHM — amplitude at 50 %', opts: { basis: 'amplitude', startPct: 50, endPct: 50 } },
  { id: 'fwhmP', label: 'FWHM — power at 50 %', opts: { basis: 'power', startPct: 50, endPct: 50 } },
  { id: 'e90', label: 'Energy 5 → 95 % (90 % of E)', opts: { basis: 'energy', startPct: 5, endPct: 95 } },
  { id: 'e98', label: 'Energy 1 → 99 % (98 % of E)', opts: { basis: 'energy', startPct: 1, endPct: 99 } },
];

export default function PowerPanel({ signal }: { signal: SignalResult }) {
  const C = usePalette();
  const lab = useLab();
  const { exp } = lab;
  const s = exp.signal;
  const ctx = powerContext(s.amplitudeUnit, exp.analysis.load.resistanceOhm);
  const train = isTrain(s) && signal.pulseCount > 1;
  const pulse = train ? signal.singlePulse : signal.xIdeal;
  const bandpass = s.carrier.enabled || s.chirp.enabled;
  const impedance = ctx?.impedance ?? NaN;
  const prf = s.repetition.prfHz;

  const [custom, setCustom] = useState<{ basis: WidthBasis; startPct: number; endPct: number; scope: EdgeScope }>({ basis: 'amplitude', startPct: 10, endPct: 10, scope: 'central' });

  const calc = useMemo(() => {
    if (!Number.isFinite(impedance)) return null;
    const single = energyStats(pulse, signal.fs, impedance);
    const whole = train ? energyStats(signal.xIdeal, signal.fs, impedance) : null;
    const rep = periodicStats(pulse, signal.fs, prf, impedance);
    const curve = bandpass ? hilbertEnvelope(pulse) : pulse;
    const widths = WIDTH_ROWS.map((r) => ({ ...r, res: pulseWidth(signal.t, curve, r.opts) }));
    const customRes = pulseWidth(signal.t, curve, custom);
    return { single, whole, rep, widths, customRes, span: supportSpan(pulse, signal.fs) };
  }, [pulse, signal, train, bandpass, impedance, prf, custom]);

  const prfPlot = useMemo(() => {
    if (!calc || !ctx) return null;
    const lo = Math.log10(prf) - 3;
    const hi = Math.min(Math.log10(prf) + 3, Math.log10(signal.fs / 4));
    const xs = Array.from({ length: 49 }, (_, i) => 10 ** (lo + ((hi - lo) * i) / 48));
    const ys = xs.map((f) => periodicStats(pulse, signal.fs, f, impedance).averagePower);
    const data: Data[] = [
      { type: 'scatter', mode: 'lines', name: 'Average power', x: xs, y: ys, line: { color: C.signal, width: 2 }, hovertemplate: 'PRF %{x:.3g} Hz<br>P_avg %{y:.3g}<extra></extra>' },
      { type: 'scatter', mode: 'lines', name: 'Peak power', x: [xs[0], xs[xs.length - 1]], y: [calc.single.peakPower, calc.single.peakPower], line: { color: C.reference, width: 1, dash: 'dash' }, hoverinfo: 'skip' },
      { type: 'scatter', mode: 'markers', name: 'Current PRF', x: [prf], y: [calc.rep.averagePower], marker: { color: C.envelope, size: 10, line: { color: C.surface, width: 2 } }, hoverinfo: 'skip' },
    ];
    if (calc.span > 0) data.push({ type: 'scatter', mode: 'lines', name: 'Pulses start to overlap', x: [1 / calc.span, 1 / calc.span], y: [Math.min(...ys, calc.single.peakPower) / 2, calc.single.peakPower * 2], line: { color: C.cursor, width: 1, dash: 'dot' }, hoverinfo: 'skip' });
    return data;
  }, [calc, ctx, pulse, signal.fs, impedance, prf, C]);

  if (!ctx || !calc) {
    return (
      <div className="max-w-xl text-[12.5px] text-ink-2">
        <p className="mb-2">Power and energy need a physical amplitude. The waveform is currently in normalized units.</p>
        <div className="flex gap-2">
          <SmallButton onClick={() => lab.update('signal.amplitudeUnit', 'V')}>Use volts across a load</SmallButton>
          <SmallButton onClick={() => lab.update('signal.amplitudeUnit', 'V/m')}>Use field strength in free space</SmallButton>
        </div>
      </div>
    );
  }

  const field = ctx.quantity === 'field';
  const q = (v: number, u: string) => formatEngineering(v, u);
  const P = (v: number) => q(v, ctx.powerUnit);
  const E = (v: number) => q(v, ctx.energyUnit);
  const widthText = (r: { valid: boolean; width: number; error?: string }) => (r.valid ? formatEngineering(r.width, 's') : '—');

  return (
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      <Card title={field ? 'Power density & fluence (one pulse)' : 'Power & energy (one pulse)'}>
        <table className="w-full">
          <tbody>
            <Row k={field ? 'Peak field E' : 'Peak voltage'} v={q(calc.single.peak, ctx.amplitudeUnit)} />
            <Row k={field ? 'Peak power density S = E²/η₀' : `Peak power V²/R (R = ${formatNumber(ctx.impedance, 4)} Ω)`} v={P(calc.single.peakPower)} />
            <Row k={field ? 'Fluence ∫S dt' : 'Energy ∫V²/R dt'} v={E(calc.single.energy)} />
            <Row k="Equivalent width E / P_peak" v={formatEngineering(calc.single.equivalentWidth, 's')} />
            <Row k={`Net area ∫x dt`} v={q(calc.single.netArea, field ? 'V·s/m' : 'V·s')} />
            {calc.whole ? <Row k={`Whole record (${signal.pulseCount} pulses)`} v={E(calc.whole.energy)} /> : null}
          </tbody>
        </table>
        {Math.abs(calc.single.netArea) < 1e-4 * calc.single.peak * calc.single.equivalentWidth ? <p className="mt-2 text-muted">Net area ≈ 0: the pulse has no DC content (bipolar pulse).</p> : null}
        {!field ? (
          <div className="mt-2">
            <NumberField label="Load resistance R" path="analysis.load.resistanceOhm" min={1} max={1000} step={1} suffix="Ω" />
          </div>
        ) : (
          <Warn>Plane wave in free space: S = E²/η₀ with η₀ = 376.73 Ω. This is power density, not the total power of any antenna, and it is not valid in the near field.</Warn>
        )}
      </Card>

      <Card title="Repetition (PRF)">
        <table className="w-full">
          <tbody>
            <Row k="PRF (Pulse train → PRF)" v={formatEngineering(prf, 'Hz')} />
            <Row k="Period" v={formatEngineering(calc.rep.period, 's')} />
            <Row k="Average power" v={P(calc.rep.averagePower)} />
            <Row k="Peak / average" v={formatNumber(calc.rep.peakToAverage, 4)} />
            <Row k="Peak power (incl. overlap)" v={P(calc.rep.peakPower)} />
          </tbody>
        </table>
        {!s.repetition.enabled ? <p className="mt-2 text-muted">The train is off; this is the average if the single pulse were repeated at the PRF above.</p> : null}
        {calc.rep.overlap ? <Warn>Pulses overlap at this PRF (support {formatEngineering(calc.span, 's')} &gt; period). Amplitudes add before squaring, so P_avg ≠ E·PRF. Copies are assumed identical and in phase.</Warn> : <p className="mt-2 text-muted">No overlap: P_avg = E · PRF.</p>}
        {prfPlot ? (
          <Plot
            data={prfPlot}
            layout={baseLayout(C, { margin: { l: 58, r: 10, t: 6, b: 36 }, xaxis: axis(C, 'PRF (Hz)', { type: 'log' }), yaxis: axis(C, `power (${ctx.powerUnit})`, { type: 'log' }), legend: { orientation: 'h', y: -0.4, x: 0, font: { size: 10, color: C.ink2 } } })}
            height={220}
            ariaLabel="Average power versus pulse repetition frequency"
            filename="average-power-vs-prf"
          />
        ) : null}
      </Card>

      <Card title="Pulse width — by definition" className="lg:col-span-2 2xl:col-span-1">
        <p className="mb-2 text-muted">The same pulse has different “widths”. Always state the definition{bandpass ? ' (RF pulse: measured on the Hilbert envelope)' : ''}.</p>
        <table className="w-full">
          <tbody>
            {calc.widths.map((w) => (
              <Row key={w.id} k={w.label} v={widthText(w.res)} sub={w.res.valid && w.opts.basis !== 'energy' ? `${formatNumber(100 * w.res.energyFraction, 3)} % E` : ''} />
            ))}
          </tbody>
        </table>
        <div className="mt-3 border-t border-line pt-2">
          <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">Custom</p>
          <Segmented size="xs" ariaLabel="Width basis" value={custom.basis} options={[{ value: 'amplitude', label: 'amplitude' }, { value: 'power', label: 'power' }, { value: 'energy', label: 'energy' }]} onChange={(basis) => setCustom({ ...custom, basis })} />
          <div className="grid grid-cols-2 gap-x-3">
            <NumberField label="Start level" value={custom.startPct} onChange={(startPct) => setCustom({ ...custom, startPct })} min={0} max={100} step={1} suffix="%" slider={false} />
            <NumberField label="End level" value={custom.endPct} onChange={(endPct) => setCustom({ ...custom, endPct })} min={0} max={100} step={1} suffix="%" slider={false} />
          </div>
          {custom.basis !== 'energy' ? (
            <Segmented size="xs" ariaLabel="Crossing selection" value={custom.scope} options={[{ value: 'central', label: 'main lobe' }, { value: 'outer', label: 'outermost' }]} onChange={(scope) => setCustom({ ...custom, scope })} />
          ) : null}
          <p className="tabular mt-2 font-mono text-[13px] text-ink">{calc.customRes.valid ? `${formatEngineering(calc.customRes.width, 's')}  (${formatNumber(100 * calc.customRes.energyFraction, 3)} % of E)` : <span className="text-muted">{calc.customRes.error}</span>}</p>
        </div>
      </Card>
    </div>
  );
}
```
> `Segmented` props (`size`, `ariaLabel`, `value`, `options`, `onChange`) are copied from its use in `ControlPanel.tsx:72-81`; if `size="xs"` is only valid there, the type-checker will say so — drop the prop.

- [ ] **Step 2: Typecheck + lint** — `npm run typecheck && npm run lint`. Expected clean.

- [ ] **Step 3: Visual check** (dev server):
  1. `preview_start` with `{name: "dev"}`.
  2. Open the app, set Amplitude unit = V (Advanced mode) → open **Power & energy**.
  3. Set envelope Gaussian, no carrier, amplitude 10 V, FWHM 1.1774 ns, PRF 100 kHz.
  4. Expect: peak power **2.000 W**, energy **1.772 nJ**, average power **177 µW**, equivalent width **886 ps**, FWHM(amplitude) **1.177 ns**, FWHM(power) **832.6 ps**.
  5. Toggle light/dark with the header toggle: chart colors, borders and text must follow; no hard-coded colors.
  6. Switch unit to V/m: card titles change to power density/fluence, load field disappears.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): Power & energy tab with PRF average-power chart and pulse-width definitions"
```

---

## Task 6: `lib/dsp/instrument.ts` and `lib/dsp/budget.ts` (TDD)

**Files:**
- Create: `lib/dsp/instrument.ts`, `lib/dsp/budget.ts`
- Test: `tests/instrument.test.ts`, `tests/budget.test.ts`

- [ ] **Step 1: Write the failing tests** — `tests/instrument.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { activeRange, gaussianAverage, interpolateCubic, lowpassFirstOrder, simulateInstrument, type InstrumentSettings } from '@/lib/dsp/instrument';

// Numerical Recipes erfc (|rel err| < 1.2e-7) — oracle only.
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** Closed form (E4): unit-peak Gaussian exp(−t²/2σ²) through a single pole. */
function gaussThroughRc(t: number, sigma: number, tau: number): number {
  return ((sigma * Math.sqrt(2 * Math.PI)) / (2 * tau)) * Math.exp((sigma * sigma) / (2 * tau * tau) - t / tau) * erfc((sigma / tau - t / sigma) / Math.SQRT2);
}

const sigma = 0.5e-9;
const bw = 0.3e9;
const tau = 1 / (2 * Math.PI * bw);

function gaussianRecord(fs: number, n: number, center: number) {
  return Float64Array.from({ length: n }, (_, i) => Math.exp(-0.5 * ((i / fs - center) / sigma) ** 2));
}

describe('lowpassFirstOrder (E3/E4)', () => {
  it('is exact for a ramp: y = t − τ(1 − e^{−t/τ}) at any dt/τ', () => {
    const dt = 3 * tau; // deliberately coarse
    const x = Float64Array.from({ length: 12 }, (_, i) => i * dt);
    const y = lowpassFirstOrder(x, dt, tau);
    // y[0] = x[0] = 0 (record starts at rest) → exact solution from rest
    for (let i = 0; i < x.length; i++) {
      const t = i * dt;
      expect(y[i]).toBeCloseTo(t - tau * (1 - Math.exp(-t / tau)), 12 - 3);
    }
  });
  it('Gaussian through RC matches the erfc closed form (max err < 5e-6)', () => {
    const fs = 470e9; // dt ≈ 2.13 ps
    const n = 4096;
    const c = 3e-9;
    const y = lowpassFirstOrder(gaussianRecord(fs, n, c), 1 / fs, tau);
    let worst = 0;
    for (let i = 0; i < n; i += 7) worst = Math.max(worst, Math.abs(y[i] - gaussThroughRc(i / fs - c, sigma, tau)));
    expect(worst).toBeLessThan(5e-6);
  });
  it('10–90 % step rise time is ln9·τ = 0.3497/BW', () => {
    const fs = 100e9;
    const n = 4000;
    const x = Float64Array.from({ length: n }, (_, i) => (i >= 10 ? 1 : 0));
    const y = lowpassFirstOrder(x, 1 / fs, tau);
    const cross = (lvl: number) => {
      for (let i = 1; i < n; i++) if (y[i - 1] < lvl && y[i] >= lvl) return (i - 1 + (lvl - y[i - 1]) / (y[i] - y[i - 1])) / fs;
      return NaN;
    };
    expect((cross(0.9) - cross(0.1)) * bw).toBeCloseTo(Math.log(9) / (2 * Math.PI), 2);
  });
});

describe('gaussianAverage (E5)', () => {
  it('a Gaussian averaged with σ_j has peak σ/√(σ²+σ_j²)', () => {
    const fs = 100e9;
    const n = 4096;
    const sj = 0.25e-9;
    const y = gaussianAverage(gaussianRecord(fs, n, 20e-9), 1 / fs, sj);
    const peak = Math.max(...y);
    expect(peak).toBeCloseTo(sigma / Math.hypot(sigma, sj), 4); // 0.894427
  });
  it('σ_j = 0 returns a copy', () => {
    const x = Float64Array.from([1, 2, 3]);
    const y = gaussianAverage(x, 1, 0);
    expect(Array.from(y)).toEqual([1, 2, 3]);
    expect(y).not.toBe(x);
  });
  it('preserves area (DC gain 1)', () => {
    const fs = 100e9;
    const x = gaussianRecord(fs, 4096, 20e-9);
    const sum = (a: ArrayLike<number>) => Array.from(a).reduce((p, v) => p + v, 0);
    expect(sum(gaussianAverage(x, 1 / fs, 0.4e-9)) / sum(x)).toBeCloseTo(1, 9);
  });
});

describe('interpolateCubic', () => {
  it('reproduces a sampled sine to < 1e-3 at 32× oversampling', () => {
    const y = Float64Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * i) / 32));
    let worst = 0;
    for (let pos = 4; pos < 250; pos += 0.37) worst = Math.max(worst, Math.abs(interpolateCubic(y, pos) - Math.sin((2 * Math.PI * pos) / 32)));
    expect(worst).toBeLessThan(1e-3);
  });
  it('clamps outside the record', () => {
    const y = Float64Array.from([5, 6, 7]);
    expect(interpolateCubic(y, -3)).toBe(5);
    expect(interpolateCubic(y, 9)).toBe(7);
  });
});

describe('activeRange', () => {
  it('finds the first and last significant samples', () => {
    const x = new Float64Array(100);
    x[30] = 1;
    x[60] = -0.5;
    expect(activeRange(x, 1e-3)).toEqual([30, 60]);
  });
});

describe('simulateInstrument', () => {
  const fs = 100e9;
  const n = 4096;
  const x = gaussianRecord(fs, n, 20e-9);
  const base: InstrumentSettings = { bandwidthHz: 50e9, sampleRateHz: 100e9, samplePhasePct: 0, triggerJitterRmsSec: 0, clipEnabled: false, clipRatio: 1.2 };

  it('a wide instrument leaves the pulse essentially unchanged', () => {
    const r = simulateInstrument(x, fs, base);
    expect(Math.abs(r.metrics.peakErrorDisplayedPct)).toBeLessThan(1);
    expect(r.metrics.fwhmDisplayed / r.metrics.fwhmTrue).toBeCloseTo(1, 1);
  });

  it('300 MHz bandwidth: displayed peak equals the closed form maximum and is far below the true peak', () => {
    const r = simulateInstrument(x, fs, { ...base, bandwidthHz: bw });
    let ref = 0;
    for (let i = 0; i < n; i++) ref = Math.max(ref, gaussThroughRc(i / fs - 20e-9, sigma, tau));
    expect(r.metrics.peakDisplayed / ref).toBeCloseTo(1, 3);
    expect(r.metrics.peakErrorDisplayedPct).toBeLessThan(-30);
    expect(r.metrics.fwhmDisplayed).toBeGreaterThan(1.5 * r.metrics.fwhmTrue);
  });

  it('trigger jitter widens and lowers the displayed pulse', () => {
    const a = simulateInstrument(x, fs, base);
    const b = simulateInstrument(x, fs, { ...base, triggerJitterRmsSec: 0.5e-9 });
    expect(b.metrics.peakDisplayed).toBeLessThan(a.metrics.peakDisplayed * 0.8);
    expect(b.metrics.fwhmDisplayed).toBeGreaterThan(a.metrics.fwhmDisplayed * 1.3);
  });

  it('coarse sampling can miss the peak, and sample phase changes the answer', () => {
    const slow = { ...base, sampleRateHz: 1e9 }; // 1 ns sample period vs 1.18 ns FWHM
    const onPeak = simulateInstrument(x, fs, { ...slow, samplePhasePct: 0 });
    const offPeak = simulateInstrument(x, fs, { ...slow, samplePhasePct: 50 });
    expect(onPeak.metrics.peakSampled).toBeLessThanOrEqual(onPeak.metrics.peakDisplayed + 1e-12);
    expect(Math.abs(onPeak.metrics.peakSampled - offPeak.metrics.peakSampled)).toBeGreaterThan(1e-3);
    expect(Math.min(onPeak.metrics.peakSampled, offPeak.metrics.peakSampled)).toBeLessThan(0.95 * onPeak.metrics.peakTrue);
  });

  it('ADC clip limits every sample to clipRatio × true peak', () => {
    const r = simulateInstrument(x, fs, { ...base, clipEnabled: true, clipRatio: 0.5 });
    for (const v of r.sampleV) expect(Math.abs(v)).toBeLessThanOrEqual(0.5 * r.metrics.peakTrue + 1e-12);
    expect(r.metrics.peakSampled).toBeCloseTo(0.5 * r.metrics.peakTrue, 9);
  });

  it('reports τ and the single-pole rise time', () => {
    const r = simulateInstrument(x, fs, { ...base, bandwidthHz: 1e9 });
    expect(r.tau).toBeCloseTo(1 / (2 * Math.PI * 1e9), 18);
    expect(r.riseTimeFilter * 1e9).toBeCloseTo(0.3497, 3);
  });
});
```

`tests/budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RISE_BW_PRODUCT, SINGLE_POLE_RISE_BW_PRODUCT, combineRise, extractRise, powerUncertainty, riseFromBandwidth } from '@/lib/dsp/budget';
import { lowpassFirstOrder } from '@/lib/dsp/instrument';

describe('rise-time budget (E3, E6)', () => {
  it('constants', () => {
    expect(RISE_BW_PRODUCT).toBe(0.35);
    expect(SINGLE_POLE_RISE_BW_PRODUCT).toBeCloseTo(0.34970, 4);
  });
  it('0.35/BW and quadrature sum', () => {
    expect(riseFromBandwidth(1e9)).toBeCloseTo(0.35e-9, 15);
    expect(combineRise([1e-9, riseFromBandwidth(1e9), riseFromBandwidth(2e9)])).toBeCloseTo(Math.hypot(1e-9, 0.35e-9, 0.175e-9), 18);
  });
  it('extraction by square subtraction is NaN when the instrument dominates', () => {
    expect(extractRise(1.2e-9, 0.5e-9)).toBeCloseTo(Math.sqrt(1.2e-9 ** 2 - 0.5e-9 ** 2), 18);
    expect(extractRise(0.5e-9, 0.6e-9)).toBeNaN();
  });
  it('DOCUMENTS the limit: quadrature under-estimates two identical single poles by ≈ 8 %', () => {
    const fs = 200e9;
    const tau = 1e-9;
    const n = 6000;
    const step = Float64Array.from({ length: n }, (_, i) => (i >= 5 ? 1 : 0));
    const y = lowpassFirstOrder(lowpassFirstOrder(step, 1 / fs, tau), 1 / fs, tau);
    const cross = (lvl: number) => {
      for (let i = 1; i < n; i++) if (y[i - 1] < lvl && y[i] >= lvl) return (i - 1 + (lvl - y[i - 1]) / (y[i] - y[i - 1])) / fs;
      return NaN;
    };
    const exact = cross(0.9) - cross(0.1);
    const quad = Math.SQRT2 * Math.log(9) * tau;
    expect(exact / quad).toBeGreaterThan(1.07);
    expect(exact / quad).toBeLessThan(1.09);
  });
});

describe('power uncertainty (E7)', () => {
  it('3 % voltage, 1 % load → u = 6.083 %, U(k=2) = 12.166 %', () => {
    const u = powerUncertainty(3, 1);
    expect(u.relStdPct).toBeCloseTo(6.0828, 3);
    expect(u.relExpandedPct).toBeCloseTo(12.1655, 3);
    expect(u.low).toBeCloseTo(2 * (1 - 0.121655), 4);
    expect(u.high).toBeCloseTo(2 * (1 + 0.121655), 4);
  });
  it('is dominated by the voltage term (factor 2 from squaring)', () => {
    expect(powerUncertainty(1, 0).relStdPct).toBeCloseTo(2, 12);
    expect(powerUncertainty(0, 1).relStdPct).toBeCloseTo(1, 12);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/instrument.test.ts tests/budget.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement** `lib/dsp/budget.ts`

```ts
/** Rise-time budget and first-order uncertainty propagation (React-free). */

/** Textbook rise-time × bandwidth product (a rounded value). */
export const RISE_BW_PRODUCT = 0.35;
/** Exact 10–90 % rise-time × bandwidth product of a single pole: ln9 / 2π. */
export const SINGLE_POLE_RISE_BW_PRODUCT = Math.log(9) / (2 * Math.PI);

export function riseFromBandwidth(bandwidthHz: number, product = RISE_BW_PRODUCT): number {
  return product / bandwidthHz;
}

/** √(Σ t²): exact for Gaussian responses, ≈ 8 % low for two identical single poles. */
export function combineRise(parts: number[]): number {
  return Math.sqrt(parts.reduce((s, v) => s + v * v, 0));
}

/** Removes an instrument rise time by square subtraction; NaN when the instrument dominates. */
export function extractRise(measured: number, instrument: number): number {
  const d = measured * measured - instrument * instrument;
  return d > 0 ? Math.sqrt(d) : NaN;
}

export interface PowerUncertainty {
  /** Relative standard uncertainty of P = V²/R (%). */
  relStdPct: number;
  /** Expanded uncertainty k·u (%). */
  relExpandedPct: number;
  low: number;
  high: number;
}

/**
 * u_P/P = √((2·u_V/V)² + (u_R/R)²) for small, independent relative standard
 * uncertainties (first order, no covariance). `nominal` is the power the
 * interval is drawn around.
 */
export function powerUncertainty(uVoltagePct: number, uResistancePct: number, k = 2, nominal = 2): PowerUncertainty {
  const relStdPct = Math.hypot(2 * uVoltagePct, uResistancePct);
  const relExpandedPct = k * relStdPct;
  return { relStdPct, relExpandedPct, low: nominal * (1 - relExpandedPct / 100), high: nominal * (1 + relExpandedPct / 100) };
}
```
> The test passes `nominal` implicitly as 2 (the HTML’s fixed 2 W); the UI passes the lab’s own peak power.

- [ ] **Step 4: Implement** `lib/dsp/instrument.ts`

```ts
/**
 * Measurement-instrument model (React-free). The "true" waveform is the lab's
 * own noiseless record; the instrument is
 *
 *   1. trigger-jitter averaging    x ⊛ N(0, σ_j²)   — the *expectation* of an
 *                                  infinite average, i.e. no noise is shown
 *   2. causal single-pole low-pass H(f) = 1/(1 + jf/BW),  τ = 1/(2π·BW)
 *   3. sampling at f_s,scope with a phase offset (cubic interpolation)
 *   4. optional hard ADC clip at ±clipRatio × true peak
 */
import { fftReal, ifft, nextPowerOfTwo } from './fft';
import { edgeTimes, fwhm } from './measurements';
import { hilbertEnvelope } from './spectrum';

export interface InstrumentSettings {
  bandwidthHz: number;
  sampleRateHz: number;
  samplePhasePct: number;
  triggerJitterRmsSec: number;
  clipEnabled: boolean;
  clipRatio: number;
}

/**
 * Causal single-pole low-pass, exact for piecewise-linear input:
 *   y_i = a·y_{i−1} + (1−a)·x_{i−1} + m·(Δt − τ(1−a)),   a = e^{−Δt/τ},  m = (x_i − x_{i−1})/Δt
 * The record starts at rest (y_0 = x_0).
 */
export function lowpassFirstOrder(x: ArrayLike<number>, dt: number, tau: number): Float64Array {
  const n = x.length;
  const y = new Float64Array(n);
  if (n === 0) return y;
  const a = Math.exp(-dt / tau);
  const b = dt - tau * (1 - a);
  y[0] = x[0];
  for (let i = 1; i < n; i++) y[i] = a * y[i - 1] + (1 - a) * x[i - 1] + ((x[i] - x[i - 1]) / dt) * b;
  return y;
}

/** Convolution with a unit-area Gaussian of standard deviation `sigma` (s), done in the frequency domain. */
export function gaussianAverage(x: ArrayLike<number>, dt: number, sigma: number): Float64Array {
  const n = x.length;
  if (!(sigma > 0)) return Float64Array.from(x);
  const nfft = nextPowerOfTwo(2 * n);
  const { re, im } = fftReal(x, nfft);
  const c = 2 * Math.PI * Math.PI * sigma * sigma;
  for (let k = 0; k < nfft; k++) {
    const kk = k <= nfft / 2 ? k : k - nfft;
    const f = kk / (nfft * dt);
    const g = Math.exp(-c * f * f);
    re[k] *= g;
    im[k] *= g;
  }
  return ifft(re, im).re.slice(0, n);
}

/** Catmull-Rom cubic interpolation at fractional index `pos` (clamped to the record). */
export function interpolateCubic(y: ArrayLike<number>, pos: number): number {
  const n = y.length;
  if (pos <= 0) return y[0];
  if (pos >= n - 1) return y[n - 1];
  const i = Math.floor(pos);
  const u = pos - i;
  const p0 = y[Math.max(i - 1, 0)];
  const p1 = y[i];
  const p2 = y[i + 1];
  const p3 = y[Math.min(i + 2, n - 1)];
  return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0)));
}

/** Indices of the first and last samples with |x| > rel·peak. */
export function activeRange(x: ArrayLike<number>, rel = 1e-4): [number, number] {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  const thr = rel * peak;
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) <= thr) a++;
  while (b > a && Math.abs(x[b]) <= thr) b--;
  return [a, b];
}

export interface InstrumentMetrics {
  peakTrue: number;
  peakDisplayed: number;
  peakSampled: number;
  peakErrorDisplayedPct: number;
  peakErrorSampledPct: number;
  fwhmTrue: number;
  fwhmDisplayed: number;
  fwhmSampled: number;
  riseTrue: number;
  riseDisplayed: number;
  samplesAcrossFwhm: number;
}

export interface InstrumentResult {
  /** Time constant 1/(2π·BW) (s). */
  tau: number;
  /** 10–90 % rise time of the single pole, ln9·τ (s). */
  riseTimeFilter: number;
  /** Bandwidth-limited, no jitter averaging. */
  filtered: Float64Array;
  /** Jitter-averaged then bandwidth-limited (the trace the instrument "shows"). */
  displayed: Float64Array;
  sampleT: Float64Array;
  sampleV: Float64Array;
  /** Clip level (same unit as x), Infinity when off. */
  clipLevel: number;
  metrics: InstrumentMetrics;
}

const MAX_SCOPE_SAMPLES = 262144;
const pct = (v: number, ref: number) => (ref > 0 ? (100 * (v - ref)) / ref : NaN);
const width = (c: { valid: boolean; width: number }) => (c.valid ? c.width : NaN);

export function simulateInstrument(x: Float64Array, fs: number, s: InstrumentSettings, opts: { bandpass?: boolean } = {}): InstrumentResult {
  const n = x.length;
  const dt = 1 / fs;
  const tau = 1 / (2 * Math.PI * s.bandwidthHz);
  const t = Float64Array.from({ length: n }, (_, i) => i * dt);
  const env = (a: ArrayLike<number>): Float64Array => (opts.bandpass ? hilbertEnvelope(a) : Float64Array.from(a, Math.abs));

  const filtered = lowpassFirstOrder(x, dt, tau);
  const displayed = s.triggerJitterRmsSec > 0 ? lowpassFirstOrder(gaussianAverage(x, dt, s.triggerJitterRmsSec), dt, tau) : filtered;

  let peakTrue = 0;
  let peakDisplayed = 0;
  for (let i = 0; i < n; i++) {
    peakTrue = Math.max(peakTrue, Math.abs(x[i]));
    peakDisplayed = Math.max(peakDisplayed, Math.abs(displayed[i]));
  }

  const dtS = 1 / s.sampleRateHz;
  const tEnd = (n - 1) * dt;
  const t0 = (s.samplePhasePct / 100) * dtS;
  const count = Math.max(0, Math.min(MAX_SCOPE_SAMPLES, Math.floor((tEnd - t0) / dtS) + 1));
  const clipLevel = s.clipEnabled ? s.clipRatio * peakTrue : Infinity;
  const sampleT = new Float64Array(count);
  const sampleV = new Float64Array(count);
  let peakSampled = 0;
  for (let k = 0; k < count; k++) {
    const tk = t0 + k * dtS;
    const v = Math.max(-clipLevel, Math.min(clipLevel, interpolateCubic(displayed, tk * fs)));
    sampleT[k] = tk;
    sampleV[k] = v;
    peakSampled = Math.max(peakSampled, Math.abs(v));
  }

  const eTrue = env(x);
  const eDisp = env(displayed);
  const wTrue = fwhm(t, eTrue);
  const wDisp = fwhm(t, eDisp);
  const wSamp = !opts.bandpass && count >= 3 ? fwhm(sampleT, Float64Array.from(sampleV, Math.abs)) : { valid: false, width: NaN };
  const rTrue = edgeTimes(t, eTrue);
  const rDisp = edgeTimes(t, eDisp);

  return {
    tau,
    riseTimeFilter: Math.log(9) * tau,
    filtered,
    displayed,
    sampleT,
    sampleV,
    clipLevel,
    metrics: {
      peakTrue,
      peakDisplayed,
      peakSampled,
      peakErrorDisplayedPct: pct(peakDisplayed, peakTrue),
      peakErrorSampledPct: pct(peakSampled, peakTrue),
      fwhmTrue: width(wTrue),
      fwhmDisplayed: width(wDisp),
      fwhmSampled: width(wSamp),
      riseTrue: rTrue.rise,
      riseDisplayed: rDisp.rise,
      samplesAcrossFwhm: wTrue.valid ? wTrue.width * s.sampleRateHz : NaN,
    },
  };
}
```

- [ ] **Step 5: Run** — `npx vitest run tests/instrument.test.ts tests/budget.test.ts`
Expected: PASS. Likely adjustment points (fix the *test tolerance only if the physics check below holds*):
  * `gaussThroughRc` accuracy test: expected worst error ≈ 1×10⁻⁶ (verified earlier with the same oracle); if it exceeds 5×10⁻⁶ the recurrence is wrong.
  * ramp test uses `toBeCloseTo(…, 9)` (precision arg `12-3`); exact algebra ⇒ error ≈ 1e-15·scale.
  * “coarse sampling” test: `peakSampled ≥ …` relationships depend only on the sign conventions above.

- [ ] **Step 6: Commit**

```bash
git add lib/dsp/instrument.ts lib/dsp/budget.ts tests/instrument.test.ts tests/budget.test.ts
git commit -m "feat(dsp): instrument model (bandwidth, jitter averaging, sampling, clip) and budgets (E3-E7)"
```

---

## Task 7: `InstrumentPanel` — “Instrument model” tab

**Files:**
- Modify (replace stub): `components/workspace/InstrumentPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useMemo, useState } from 'react';
import type { Data } from 'plotly.js-dist-min';
import type { SignalResult } from '@/lib/dsp/signals';
import { isTrain } from '@/lib/dsp/signals';
import { activeRange, simulateInstrument } from '@/lib/dsp/instrument';
import { combineRise, extractRise, powerUncertainty, riseFromBandwidth } from '@/lib/dsp/budget';
import { minMaxIndices, pick } from '@/lib/dsp/decimate';
import { energyStats, powerContext } from '@/lib/dsp/power';
import { amplitudeUnitLabel, formatEngineering, formatNumber } from '@/lib/units/format';
import { useLab } from '@/components/lab/context';
import { EngineeringInput, NumberField, ToggleField } from '@/components/controls/primitives';
import Plot from '@/components/plots/Plot';
import { axis, baseLayout } from '@/components/plots/theme';
import { usePalette } from '@/components/layout/ThemeProvider';
import { Card, Row, Warn } from './parts';

function Cell({ v, unit }: { v: number; unit: 's' | 'amp' }) {
  return <>{Number.isFinite(v) ? (unit === 's' ? formatEngineering(v, 's') : formatNumber(v, 4)) : '—'}</>;
}

export default function InstrumentPanel({ signal }: { signal: SignalResult }) {
  const C = usePalette();
  const { exp } = useLab();
  const s = exp.signal;
  const i = exp.analysis.instrument;
  const train = isTrain(s) && signal.pulseCount > 1;
  const src = train ? signal.singlePulse : signal.xIdeal;
  const bandpass = s.carrier.enabled || s.chirp.enabled;
  const unit = amplitudeUnitLabel(s.amplitudeUnit);

  const sim = useMemo(() => simulateInstrument(src, signal.fs, i, { bandpass }), [src, signal.fs, i, bandpass]);

  const plot = useMemo(() => {
    const [a, b] = activeRange(src, 1e-4);
    const pre = Math.round(2 * sim.tau * signal.fs);
    const post = Math.round(7 * sim.tau * signal.fs + 2 * (1 / i.sampleRateHz) * signal.fs);
    const i0 = Math.max(0, a - pre - 8);
    const i1 = Math.min(src.length - 1, b + post + 8);
    const idx = minMaxIndices(src, i0, i1, 2000);
    const tn = (arr: ArrayLike<number>) => pick(arr, idx, 1);
    const tx = Array.from(idx, (k) => (k / signal.fs) * 1e9);
    const data: Data[] = [
      { type: 'scatter', mode: 'lines', name: 'True waveform', x: tx, y: tn(src), line: { color: C.reference, width: 1.5 }, hovertemplate: 't = %{x:.4g} ns<br>%{y:.4g}<extra>true</extra>' },
    ];
    if (i.triggerJitterRmsSec > 0) data.push({ type: 'scatter', mode: 'lines', name: 'Bandwidth-limited', x: tx, y: tn(sim.filtered), line: { color: C.signal, width: 1, dash: 'dot' }, hoverinfo: 'skip' });
    data.push({ type: 'scatter', mode: 'lines', name: i.triggerJitterRmsSec > 0 ? 'Displayed (jitter-averaged)' : 'Bandwidth-limited', x: tx, y: tn(sim.displayed), line: { color: C.signal, width: 2 }, hovertemplate: 't = %{x:.4g} ns<br>%{y:.4g}<extra>displayed</extra>' });
    const lo = tx[0];
    const hi = tx[tx.length - 1];
    const sx: number[] = [];
    const sy: number[] = [];
    for (let k = 0; k < sim.sampleT.length; k++) {
      const tk = sim.sampleT[k] * 1e9;
      if (tk >= lo && tk <= hi) {
        sx.push(tk);
        sy.push(sim.sampleV[k]);
      }
    }
    data.push({ type: 'scatter', mode: 'lines+markers', name: 'Scope samples', x: sx, y: sy, line: { color: C.envelope, width: 1 }, marker: { color: C.envelope, size: 7, line: { color: C.surface, width: 1.5 } }, hovertemplate: 'sample at %{x:.4g} ns<br>%{y:.4g}<extra></extra>' });
    if (Number.isFinite(sim.clipLevel)) data.push({ type: 'scatter', mode: 'lines', name: 'ADC clip', x: [lo, hi], y: [sim.clipLevel, sim.clipLevel], line: { color: C.cursor, width: 1, dash: 'dash' }, hoverinfo: 'skip' });
    return data;
  }, [src, sim, signal.fs, i, C]);

  const m = sim.metrics;
  const warnings: string[] = [];
  if (i.bandwidthHz > i.sampleRateHz / 2) warnings.push('Bandwidth is above half the scope sample rate: the analogue chain passes content the sampler cannot represent (aliasing).');
  if (Number.isFinite(m.samplesAcrossFwhm) && m.samplesAcrossFwhm < 4) warnings.push(`Only ${formatNumber(m.samplesAcrossFwhm, 2)} samples across the true FWHM: peak and width read from samples are unreliable.`);
  if (i.triggerJitterRmsSec > 0 && Number.isFinite(m.fwhmTrue) && i.triggerJitterRmsSec > 0.3 * m.fwhmTrue) warnings.push('Trigger jitter is comparable to the pulse width: averaging without time alignment broadens and lowers the pulse.');
  if (bandpass && s.carrier.enabled && s.carrier.frequencyHz > i.bandwidthHz) warnings.push('The carrier is above the instrument bandwidth, so the RF content itself is attenuated.');
  if (signal.fs < 8 * i.bandwidthHz) warnings.push('The lab sample rate is below 8× the instrument bandwidth: the filter output is less accurate. Raise the sample rate in the Sampling section.');

  return (
    <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card title="Instrument settings">
        <EngineeringInput label="Analogue bandwidth BW" path="analysis.instrument.bandwidthHz" kind="freq" min={1e8} max={5e10} hardMin={1e6} hardMax={1e12} hint={<>Single pole: τ = {formatEngineering(sim.tau, 's')}, t<sub>r</sub> = {formatEngineering(sim.riseTimeFilter, 's')} (0.35/BW)</>} />
        <EngineeringInput label="Sample rate f_s,scope" path="analysis.instrument.sampleRateHz" kind="freq" min={1e8} max={1e11} hardMin={1e6} hardMax={1e13} hint={<>Sample period {formatEngineering(1 / i.sampleRateHz, 's')}</>} />
        <NumberField label="Sample phase" path="analysis.instrument.samplePhasePct" min={0} max={100} step={1} suffix="% of period" />
        <EngineeringInput label="Trigger jitter σ_j (RMS)" path="analysis.instrument.triggerJitterRmsSec" kind="time" min={1e-12} max={1e-9} hardMin={0} hardMax={1e-6} hint={<>Gaussian; 0 = off</>} />
        <ToggleField label="ADC clipping" path="analysis.instrument.clipEnabled" />
        <NumberField label="ADC full scale ÷ true peak" path="analysis.instrument.clipRatio" min={0.1} max={3} step={0.05} disabled={!i.clipEnabled} />
        <p className="mt-2 text-muted">Model: jitter averaging → single-pole low-pass → sampling → clip. Jitter averaging is the <em>expected</em> trace of an infinite average; noise, quantisation and a real sensor response are not modelled. Real instruments need not be single-pole.</p>
      </Card>

      <div className="min-w-0 space-y-3">
        <Card title={`True vs displayed ${train ? '(single pulse of the train)' : ''}`}>
          <Plot
            data={plot}
            layout={baseLayout(C, { margin: { l: 56, r: 10, t: 6, b: 36 }, xaxis: axis(C, 't (ns)'), yaxis: axis(C, `amplitude (${unit})`), legend: { orientation: 'h', y: -0.28, x: 0, font: { size: 10, color: C.ink2 } } })}
            height={300}
            ariaLabel="True waveform, bandwidth-limited trace and scope samples"
            filename="instrument-model"
          />
          {warnings.map((w) => (
            <Warn key={w}>{w}</Warn>
          ))}
        </Card>

        <div className="grid gap-3 xl:grid-cols-3">
          <Card title="What the instrument reports">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th className="text-left font-normal">{unit}</th>
                  <th className="text-right font-normal">True</th>
                  <th className="text-right font-normal">Displayed</th>
                  <th className="text-right font-normal">Samples</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line/60"><td className="py-1 text-ink-2">Peak</td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.peakTrue} unit="amp" /></td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.peakDisplayed} unit="amp" /></td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.peakSampled} unit="amp" /></td></tr>
                <tr className="border-b border-line/60"><td className="py-1 text-ink-2">Peak error</td><td /><td className="tabular py-1 text-right font-mono text-muted">{formatNumber(m.peakErrorDisplayedPct, 3)} %</td><td className="tabular py-1 text-right font-mono text-muted">{formatNumber(m.peakErrorSampledPct, 3)} %</td></tr>
                <tr className="border-b border-line/60"><td className="py-1 text-ink-2">FWHM</td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.fwhmTrue} unit="s" /></td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.fwhmDisplayed} unit="s" /></td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.fwhmSampled} unit="s" /></td></tr>
                <tr><td className="py-1 text-ink-2">Rise 10–90 %</td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.riseTrue} unit="s" /></td><td className="tabular py-1 text-right font-mono text-ink"><Cell v={m.riseDisplayed} unit="s" /></td><td /></tr>
              </tbody>
            </table>
          </Card>
          <RiseBudget defaultSignalRise={Number.isFinite(m.riseTrue) ? m.riseTrue : 1e-9} />
          <UncertaintyCard src={src} fs={signal.fs} />
        </div>
      </div>
    </div>
  );
}

function RiseBudget({ defaultSignalRise }: { defaultSignalRise: number }) {
  const [sig, setSig] = useState(defaultSignalRise);
  const [scope, setScope] = useState(2e9);
  const [probe, setProbe] = useState(4e9);
  const rs = riseFromBandwidth(scope);
  const rp = riseFromBandwidth(probe);
  const total = combineRise([sig, rs, rp]);
  return (
    <Card title="Rise-time budget">
      <EngineeringInput label="Signal rise time" kind="time" value={sig} onCommit={setSig} min={1e-11} max={1e-8} hardMin={1e-13} hardMax={1e-6} path="" lock={false} />
      <EngineeringInput label="Scope bandwidth" kind="freq" value={scope} onCommit={setScope} min={1e8} max={5e10} hardMin={1e6} hardMax={1e12} path="" lock={false} />
      <EngineeringInput label="Sensor / probe bandwidth" kind="freq" value={probe} onCommit={setProbe} min={1e8} max={5e10} hardMin={1e6} hardMax={1e12} path="" lock={false} />
      <table className="mt-2 w-full">
        <tbody>
          <Row k="t_r,scope = 0.35/BW" v={formatEngineering(rs, 's')} />
          <Row k="t_r,probe = 0.35/BW" v={formatEngineering(rp, 's')} />
          <Row k="Measured ≈ √(Σ t²)" v={formatEngineering(total, 's')} />
          <Row k="Broadening" v={`${formatNumber((total / sig - 1) * 100, 3)} %`} />
          <Row k="Signal recovered from measured" v={Number.isFinite(extractRise(total, combineRise([rs, rp]))) ? formatEngineering(extractRise(total, combineRise([rs, rp])), 's') : '—'} />
        </tbody>
      </table>
      <p className="mt-2 text-muted">Quadrature addition is exact for Gaussian responses; for cascaded single-pole stages it reads about 8 % low. When the instrument dominates, subtracting squares becomes very sensitive to small errors.</p>
    </Card>
  );
}

function UncertaintyCard({ src, fs }: { src: Float64Array; fs: number }) {
  const { exp } = useLab();
  const ctx = powerContext(exp.signal.amplitudeUnit, exp.analysis.load.resistanceOhm);
  const [uv, setUv] = useState(3);
  const [ur, setUr] = useState(1);
  const peakPower = ctx ? energyStats(src, fs, ctx.impedance).peakPower : NaN;
  const u = powerUncertainty(uv, ur, 2, Number.isFinite(peakPower) ? peakPower : 1);
  return (
    <Card title="Power uncertainty (first order)">
      <NumberField label="Voltage standard uncertainty" value={uv} onChange={setUv} min={0} max={20} step={0.1} suffix="%" />
      <NumberField label="Load standard uncertainty" value={ur} onChange={setUr} min={0} max={20} step={0.1} suffix="%" />
      <table className="mt-2 w-full">
        <tbody>
          <Row k="u(P)/P = √[(2u_V/V)² + (u_R/R)²]" v={`${formatNumber(u.relStdPct, 4)} %`} />
          <Row k="Expanded, k = 2" v={`${formatNumber(u.relExpandedPct, 4)} %`} />
          <Row k={Number.isFinite(peakPower) ? `Peak power interval (${ctx?.powerUnit})` : 'Interval around 1 (unitless)'} v={`${formatEngineering(u.low, ctx?.powerUnit ?? '')} … ${formatEngineering(u.high, ctx?.powerUnit ?? '')}`} />
        </tbody>
      </table>
      <p className="mt-2 text-muted">Independent, small relative errors only. Correlated errors need covariance terms, and k = 2 is not an automatic 95 % guarantee.</p>
    </Card>
  );
}
```
> `EngineeringInput` is used here with a controlled `value` + `onCommit`; per its props (`primitives.tsx:106`) `path` is still a required string, hence `path=""` with `lock={false}`; if the type-checker or lock UI complains, make `path` optional in `EngProps` (one-line change) and omit it.

- [ ] **Step 2: Typecheck/lint** — `npm run typecheck && npm run lint` → clean.

- [ ] **Step 3: Visual check**
  1. In the app load a Gaussian pulse (preset *Gaussian pulse*), set amplitude unit V.
  2. Open **Instrument model**, BW 300 MHz, f_s 40 GHz: the blue trace must be visibly lower and wider than the green “True waveform”; orange sample markers sit on the blue curve; peak error ≈ −45 % (σ = 10 ns preset! — for a 10 ns Gaussian the 300 MHz filter barely matters; use the new *Instrument* presets from Task 8 to see large effects).
  3. Add trigger jitter 250 ps on the 0.5 ns-σ pulse: peak ratio of displayed/true ≈ 0.894 when BW is large.
  4. Light/dark toggle: legend, markers, cards follow the theme.
  5. Resize to ≈ 400 px width: cards stack, no horizontal page scroll.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui): Instrument model tab with rise-time budget and power-uncertainty cards"
```

---

## Task 8: Presets (8 new) and their tests

**Files:**
- Modify: `lib/presets/presets.ts`
- Test: `tests/presets.test.ts` (add a block)

All use `MANUAL(100e9, 4096)` (41 ns record, Nyquist 50 GHz, Gaussian σ = 0.5 ns has < −100 dB beyond 1.6 GHz). FWHM for σ = 0.5 ns is `1.1774100225e-9` s. Presets are plain config objects in the existing style; `compareWith` uses the existing A/B mechanism.

- [ ] **Step 1: Write the failing test** — append to `tests/presets.test.ts`

```ts
import { energyStats, periodicStats, powerContext, ETA0 } from '@/lib/dsp/power';
import { simulateInstrument } from '@/lib/dsp/instrument';
import { generateSignal } from '@/lib/dsp/signals';

describe('power & instrument presets', () => {
  const build = (id: string) => buildPresetExperiment(PRESETS.find((p) => p.id === id)!);

  it('uwb-gaussian-50ohm reproduces 2 W / 1.77245 nJ / 177.245 µW', () => {
    const e = build('uwb-gaussian-50ohm');
    const sig = generateSignal(e.signal);
    const ctx = powerContext(e.signal.amplitudeUnit, e.analysis.load.resistanceOhm)!;
    const s = energyStats(sig.singlePulse, sig.fs, ctx.impedance);
    expect(s.peakPower).toBeCloseTo(2, 4);
    expect(s.energy / 1.77245385e-9).toBeCloseTo(1, 4);
    expect(periodicStats(sig.singlePulse, sig.fs, e.signal.repetition.prfHz, ctx.impedance).averagePower / 177.245385e-6).toBeCloseTo(1, 4);
  });

  it('field-10vm-air: S_pk = 0.26544 W/m² (E²/η₀)', () => {
    const e = build('field-10vm-air');
    expect(e.signal.amplitudeUnit).toBe('V/m');
    const sig = generateSignal(e.signal);
    expect(energyStats(sig.singlePulse, sig.fs, ETA0).peakPower).toBeCloseTo(0.265442, 5);
  });

  it('uwb-monocycle-power has ~zero net area while its Gaussian partner (A side) does not', () => {
    const p = PRESETS.find((q) => q.id === 'uwb-monocycle-power')!;
    const a = generateSignal(buildCompareExperiment(p)!.signal);
    const b = generateSignal(buildPresetExperiment(p).signal);
    expect(Math.abs(energyStats(b.singlePulse, b.fs, 50).netArea)).toBeLessThan(1e-3 * Math.abs(energyStats(a.singlePulse, a.fs, 50).netArea));
  });

  it('prf-overlap-power really overlaps and differs from E·PRF', () => {
    const e = build('prf-overlap-power');
    const sig = generateSignal(e.signal);
    const r = periodicStats(sig.singlePulse, sig.fs, e.signal.repetition.prfHz, 50);
    expect(r.overlap).toBe(true);
    const naive = energyStats(sig.singlePulse, sig.fs, 50).energy * e.signal.repetition.prfHz;
    expect(r.averagePower / naive).toBeGreaterThan(1.2);
  });

  it.each([
    ['scope-bandwidth-limit', (m: ReturnType<typeof simulateInstrument>['metrics']) => expect(m.peakErrorDisplayedPct).toBeLessThan(-25)],
    ['scope-trigger-jitter', (m: ReturnType<typeof simulateInstrument>['metrics']) => expect(m.peakDisplayed / m.peakTrue).toBeCloseTo(0.8944, 1)],
    ['scope-undersampling', (m: ReturnType<typeof simulateInstrument>['metrics']) => expect(m.peakSampled / m.peakTrue).toBeLessThan(0.95)],
    ['scope-adc-clipping', (m: ReturnType<typeof simulateInstrument>['metrics']) => expect(m.peakSampled / m.peakTrue).toBeCloseTo(0.7, 6)],
  ])('%s demonstrates its effect', (id, check) => {
    const e = build(id as string);
    const sig = generateSignal(e.signal);
    check(simulateInstrument(sig.xIdeal, sig.fs, e.analysis.instrument).metrics);
  });

  it('new presets open the matching tab', () => {
    for (const id of ['uwb-gaussian-50ohm', 'uwb-monocycle-power', 'field-10vm-air', 'prf-overlap-power']) expect(PRESETS.find((p) => p.id === id)!.tab).toBe('power');
    for (const id of ['scope-bandwidth-limit', 'scope-trigger-jitter', 'scope-undersampling', 'scope-adc-clipping']) expect(PRESETS.find((p) => p.id === id)!.tab).toBe('instrument');
  });
});
```
Run: `npx vitest run tests/presets.test.ts` → FAIL (presets missing).

- [ ] **Step 2: Add the presets** to `PRESETS` in `lib/presets/presets.ts` (after the existing `uwb-monocycle`; the shared base keeps them DRY):

```ts
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
const SPEC_2GHZ = { spectrum: { range: { mode: 'manual' as const, min: 0, max: 2e9 } } };
const INSTRUMENT_SIGNAL = { ...GAUSS_V, amplitude: 1 };
```

```ts
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
    name: 'Instrument bandwidth too low (300 MHz)',
    category: 'Instrument model',
    description: 'A 0.5 ns-σ pulse seen through a 300 MHz single pole: the peak drops by more than a third and the pulse looks several times wider. Sampling is not the limit here.',
    experiment: { signal: INSTRUMENT_SIGNAL, analysis: { instrument: { bandwidthHz: 0.3e9, sampleRateHz: 40e9, samplePhasePct: 25, triggerJitterRmsSec: 0, clipEnabled: false } } },
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
    experiment: { signal: INSTRUMENT_SIGNAL, analysis: { instrument: { bandwidthHz: 5e9, sampleRateHz: 1e9, samplePhasePct: 50, triggerJitterRmsSec: 0, clipEnabled: false } } },
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
```

- [ ] **Step 3: Run** — `npx vitest run tests/presets.test.ts`
Expected: PASS, including the pre-existing generic “respects Nyquist unless …” test for all 8 new presets. If `prf-overlap-power` trips the generic *truncated* warning, widen the record: `MANUAL(100e9, 8192)`.
If `ratio > 1.2` in the overlap test fails, print `r.averagePower/naive`: for 1 ns spacing and σ = 0.5 ns pulses expect ≈ 1.9 (overlap sums to a nearly flat topped train).

- [ ] **Step 4: Commit**

```bash
git add lib/presets/presets.ts tests/presets.test.ts
git commit -m "feat(presets): 4 power/energy and 4 instrument-model presets with numeric checks"
```

---

## Task 9: Education content — experiments, equations, tooltips

**Files:**
- Modify: `lib/education/experiments.ts`, `components/education/MathPanel.tsx`, `lib/education/tooltips.ts`

- [ ] **Step 1: Four guided experiments** — append to `GUIDED_EXPERIMENTS` (ids `e9`–`e12`):

```ts
  {
    id: 'e9',
    title: 'Same peak, different energy',
    preset: 'uwb-monocycle-power',
    control: 'Pulse → envelope',
    instruction: 'Compare the monocycle with the Gaussian (A side). Both have 10 V peak. Open Power & energy.',
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
    instruction: 'Sweep the bandwidth from 5 GHz down to 300 MHz and watch the displayed peak and FWHM.',
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
```

- [ ] **Step 2: Equations** — in `MathPanel.tsx`, just before the final `return`, add:

```ts
  if (s.amplitudeUnit !== 'normalized') {
    const field = s.amplitudeUnit === 'V/m';
    parts.push({ label: field ? 'Power density' : 'Instantaneous power', tex: field ? 'S(t)=\\frac{E^2(t)}{\\eta_0},\\quad \\eta_0=376.73\\,\\Omega' : 'P(t)=\\frac{v^2(t)}{R}' });
    parts.push({ label: field ? 'Fluence' : 'Pulse energy', tex: field ? 'F=\\int S(t)\\,dt\\ \\ [\\mathrm{J/m^2}]' : 'E=\\int P(t)\\,dt=\\frac{1}{R}\\int v^2(t)\\,dt' });
    parts.push({ label: 'Gaussian, peak A', tex: 'E=\\frac{A^2}{R}\\,\\sigma\\sqrt{\\pi},\\qquad \\tau_{\\mathrm{eq}}=\\frac{E}{P_{\\mathrm{pk}}}=\\sigma\\sqrt{\\pi}' });
    parts.push({ label: 'Average power (no overlap)', tex: 'P_{\\mathrm{avg}}=E\\cdot PRF' });
  }
  parts.push({ label: 'Instrument: single pole', tex: 'H(f)=\\frac{1}{1+jf/\\mathrm{BW}},\\quad \\tau=\\frac{1}{2\\pi\\,\\mathrm{BW}},\\quad t_r^{10\\text{–}90}=\\ln 9\\,\\tau\\approx\\frac{0.35}{\\mathrm{BW}}' });
  parts.push({ label: 'Instrument: jitter averaging', tex: '\\bar v(t)=v(t)\\ast\\mathcal N(0,\\sigma_j^2),\\quad \\sigma_{\\mathrm{avg}}=\\sqrt{\\sigma^2+\\sigma_j^2},\\quad \\frac{V_{\\mathrm{pk}}}{V_{\\mathrm{pk},0}}=\\frac{\\sigma}{\\sigma_{\\mathrm{avg}}}' });
```

- [ ] **Step 3: Tooltips** — read `lib/education/tooltips.ts`, add entries in the same shape: `amplitude` (update: “Peak amplitude. In V it is a voltage across the load set in Power & energy; in V/m a free-space field.”).

- [ ] **Step 4:** `npm run typecheck && npm test && npm run lint` → clean (an existing test may assert `GUIDED_EXPERIMENTS` presets exist; they do).

- [ ] **Step 5: Commit** `git add -A && git commit -m "docs(education): experiments, equations and tooltips for power and instrument model"`

---

## Task 10: Documentation and full verification

**Files:**
- Create: `docs/equation-verification.md`
- Modify: `README.md`

- [ ] **Step 1: `docs/equation-verification.md`** — copy the §2 table of this plan verbatim, adding a “Test” column: E1 → `tests/power.test.ts › energyStats — E1`; E2 → `… E2`; E3/E4 → `tests/instrument.test.ts › lowpassFirstOrder`; E5 → `gaussianAverage`; E6 → `tests/budget.test.ts › DOCUMENTS the limit`; E7 → `power uncertainty`; E8 → `tests/pulsewidth.test.ts`.

- [ ] **Step 2: README** — add under *Features*: “Power & energy in V into R or V/m in free space, average power with overlap handling”, “Pulse-width definitions”, “Instrument model: bandwidth limit, sampling phase, ADC clipping, jitter averaging”; add the equation-verification link; extend the experiment table (`BW ↓ → displayed peak ↓ and FWHM ↑`, `σ_j ↑ → peak × σ/√(σ²+σ_j²)`, `PRF ↑ → P_avg ∝ PRF until pulses overlap`). Include the caveats from §2 (E5, E6).

- [ ] **Step 3: Full verification (evidence before claims)**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Expected: all green; test count = previous + new files (`power`, `pulsewidth`, `instrument`, `budget`, `state`, extended `presets`).

- [ ] **Step 4: Browser QA** (dev server, `preview_start {name:"dev"}`), in **both themes**:
  1. Each of the 8 new presets from the preset menu: correct tab opens, numbers match their descriptions, no console errors (`read_console_messages`).
  2. URL: *Copy link* on `scope-bandwidth-limit` after changing BW → open the link in a fresh tab: instrument values restored.
  3. A/B: save a V pulse as A, change amplitude unit to V/m → A/B tab lists differences without crashing.
  4. 400 px width: both new tabs stack, nothing overflows horizontally.
  5. Keyboard: new inputs reachable by Tab; plots have `aria-label`s.
  6. Screenshots of Power & energy and Instrument tabs (light + dark) for the PR.

- [ ] **Step 5: Commit & hand off**

```bash
git add -A && git commit -m "docs: equation verification table and README for power/instrument features"
```
Then use superpowers:finishing-a-development-branch.

---

## 11. Optional follow-up (not in this plan unless you approve it)

**Ripple / ringing** from the HTML: an additive or multiplicative oscillation (1–20 cycles, 0–100 % depth, 0–90 % decay per cycle, per-cycle levels, in-pulse window −2σ…+2σ or post-pulse from +2.5σ). It is a *signal-model* change (`SignalConfig.ringing`, `synthesize()` in `lib/dsp/signals.ts`, controls section, sanitize/URL keys, 3–4 tests, 1–2 presets such as “UWB pulse with ringing”). Its spectral effect (ringing adds a spectral hump near its frequency) is a good UWB teaching point, but it is a separate, larger change — recommended as its own plan.

---

## Self-review (spec ↔ plan)

* **English only** — all new strings written in English; Hebrew file kept only as a reference under `docs/reference/` (Task 0).
* **No systems-engineering story** — nothing from sections 04–06 of the HTML is ported (stage walkthrough, 8-item spec list, glossary, source essay). Rise-budget and uncertainty cards are calculators, kept small and caveated.
* **Light/dark** — only `usePalette()` and existing Tailwind tokens; Task 5/7 visual checks run in both themes.
* **Verify equations + tests** — §2 lists 10 equations with method/result; each has a named test (E1–E8) and E9/E10 are shown to be already covered by existing code.
* **New presets** — 8 (Task 8) in two new categories, each with a numeric test.
* **Type consistency** — names used across tasks: `AmplitudeUnit`, `powerContext`, `energyStats`, `periodicStats`, `foldPeriodic`, `supportSpan`, `pulseWidth`, `simulateInstrument`, `InstrumentSettings`, `activeRange`, `lowpassFirstOrder`, `gaussianAverage`, `interpolateCubic`, `riseFromBandwidth`, `combineRise`, `extractRise`, `powerUncertainty` (returns `relStdPct`, `relExpandedPct`, `low`, `high`); `analysis.load.resistanceOhm`, `analysis.instrument.{bandwidthHz,sampleRateHz,samplePhasePct,triggerJitterRmsSec,clipEnabled,clipRatio}`; tab ids `'power'`, `'instrument'`.
* **Verify-while-implementing notes** (each is a one-line check, stated at its step): `s4` color token exists (Task 4), `Segmented size="xs"` prop (Task 5), `EngineeringInput path` optional (Task 7).
