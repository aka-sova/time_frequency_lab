/**
 * Guided tour content (data only, React-free). Each step shows a card, optionally
 * highlighting an element (`target`, a CSS selector), optionally asking the user to do
 * something (`action`) before "Next" unlocks. Text supports **bold**.
 */
import type { UiMode } from '@/types/signal';
import type { Placement } from './position';

export type TutorialTab = 'measurements' | 'power' | 'instrument' | 'compression' | 'ab' | 'sweep' | 'leakage' | 'synthesis' | 'theory' | 'experiments';

/** What the tour can observe about the app. */
export interface TutorialContext {
  mode: UiMode;
  presetId: string;
  tab: TutorialTab;
  hasA: boolean;
}

/** What the tour can do to the app ("Do it for me" and tab changes). */
export interface TutorialApi {
  setMode: (m: UiMode) => void;
  applyPreset: (id: string) => void;
  setTab: (t: TutorialTab) => void;
  saveA: () => void;
}

export interface TutorialAction {
  /** Instruction shown in the "Your turn" box. */
  prompt: string;
  /** True once the user has done it (evaluated live against the app state). */
  done: (c: TutorialContext) => boolean;
  /** Does it for the user (the "Do it for me" button). */
  perform: (a: TutorialApi) => void;
}

export interface TutorialStep {
  id: string;
  title: string;
  body: string[];
  /** CSS selector of the element to highlight; omitted = centred card. */
  target?: string;
  placement?: Placement;
  /** 'below-header' scrolls the target to the top of the page under the sticky header (used for the workspace tabs). */
  scroll?: 'center' | 'below-header';
  action?: TutorialAction;
  /** Runs each time the step becomes active (e.g. to show the tab being explained). */
  onEnter?: (a: TutorialApi) => void;
}

const SEL = {
  preset: '[aria-label="Load preset"]',
  mode: '[aria-label="Interface complexity"]',
  controls: '[aria-label="Signal configuration"]',
  time: '[data-tour="time-domain"]',
  freq: '[data-tour="frequency-domain"]',
  strip: '[aria-label="Measurement summary"]',
  tf: '[aria-label="Time–frequency analysis"]',
  workspace: '[aria-label="Analysis workspace"]',
  saveA: '[data-tour="save-a"]',
  actions: '[data-tour="header-actions"]',
};

const loadPreset = (id: string) => ({ perform: (a: TutorialApi) => a.applyPreset(id), done: (c: TutorialContext) => c.presetId === id });

const tabStep = (id: TutorialTab, title: string, body: string[]): TutorialStep => ({
  id: `tab-${id}`,
  title,
  body,
  target: `#tab-${id}`,
  placement: 'bottom',
  scroll: 'below-header',
  onEnter: (a) => a.setTab(id),
});

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to the Time–Frequency Lab',
    body: [
      'This lab shows how the **shape of a waveform in time** determines its **spectrum in frequency**. Change one parameter and watch the waveform, the spectrum, the time–frequency maps and a set of measurements update together.',
      'This tour takes about 10 minutes. Use **Next** and **Previous** to move, or the **X** to leave at any time. Some steps ask you to click something; if you would rather not, press **Do it for me**.',
      'You can use the real application while the tour is open — the highlighted area is the one being explained.',
    ],
  },
  {
    id: 'layout',
    title: 'The screen at a glance',
    body: [
      '**Top bar** — presets, interface mode, and tools (compare, share, export, reset, text size, theme).',
      '**Left** — the control panel with the signal parameters, grouped in colour-coded sections.',
      '**Centre** — the time-domain plot, the frequency-domain plot and a strip of live measurements.',
      '**Below** — the time–frequency panel (STFT and wavelets) and a row of workspace tabs for deeper analysis.',
    ],
  },
  {
    id: 'preset-menu',
    title: 'Presets: ready-made experiments',
    target: SEL.preset,
    placement: 'bottom',
    body: [
      'The **Preset** menu loads a complete configuration in one click. Presets are grouped: Fundamentals, Pulse trains, UWB & bandwidth, Power & energy, Instrument model, Sampling & DFT, Time–frequency and Experiments.',
      'A preset can also open a workspace tab or load a second configuration as **A** for comparison. We will try a few shortly.',
    ],
  },
  {
    id: 'mode-select',
    title: 'Mode selection: Basic, Advanced, Expert',
    target: SEL.mode,
    placement: 'bottom',
    body: [
      '**Basic** shows only the essential controls. **Advanced** adds phase, coherence, jitter, chirp, edge shaping and FFT settings. **Expert** adds the STFT/wavelet parameters, normalisation choices and estimators.',
      'Start simple and open more controls as you need them. Your settings are kept when you change mode.',
    ],
    action: {
      prompt: 'Click **Advanced** in the mode selector.',
      done: (c) => c.mode !== 'basic',
      perform: (a) => a.setMode('advanced'),
    },
  },
  {
    id: 'mode-after',
    title: 'More controls appeared',
    target: SEL.controls,
    placement: 'right',
    scroll: 'center',
    body: [
      'In Advanced mode the left panel gained the **Coherence**, **Jitter** and **Chirp (LFM)** sections, and individual sections show more parameters (phase, rise/fall time, FFT window …).',
      '**Expert** mode additionally unlocks **Modulation & noise** and the STFT/wavelet settings. You can return to Basic at any moment from the same selector.',
    ],
  },
  {
    id: 'controls',
    title: 'The control panel',
    target: SEL.controls,
    placement: 'right',
    scroll: 'center',
    body: [
      'Each coloured section groups related parameters: **Signal**, **Carrier**, **Pulse envelope**, **Pulse train / PRF**, **Sampling** and more. Click a section title to collapse it.',
      'In a section header: the **switch** turns that effect on or off, **↺** resets the section to the preset values, and **Isolate effect** buttons reset everything unrelated so one cause connects to one effect.',
      'Every value has a slider and a typed field with a unit selector — type “2.5 GHz” or “10n”. The small **lock** next to a parameter keeps it when you load another preset. The **Signal** section also sets the amplitude unit: normalised, volts (V) or field strength (V/m).',
    ],
  },
  {
    id: 'preset-short',
    title: 'Try a preset: a very short burst',
    target: SEL.preset,
    placement: 'bottom',
    body: ['Let us load a short RF burst — a 1 GHz carrier gated on for only 5 ns, so about 5 carrier cycles.'],
    action: {
      prompt: 'Open the **Preset** menu and choose **Fundamentals → Short RF burst (5 ns)**.',
      ...loadPreset('short-rf-burst'),
    },
  },
  {
    id: 'time-plot',
    title: 'The time-domain plot',
    target: SEL.time,
    placement: 'bottom',
    scroll: 'center',
    body: [
      'This is the waveform x(t) against time. The solid line is the sampled signal; the dashed line is its **envelope** — the pulse shape that the carrier oscillation fills. Count the few cycles inside the envelope.',
      'Drag on the plot to zoom. **Fit** frames the pulse, **Full record** shows the whole observation window. Advanced mode adds overlays such as sample points, pulse markers and **Cursors** for measuring Δt.',
    ],
  },
  {
    id: 'spectrum-plot',
    title: 'The frequency-domain plot',
    target: SEL.freq,
    placement: 'bottom',
    scroll: 'center',
    body: [
      'This is the spectrum: how much energy the waveform has at each frequency. It is centred on the 1 GHz carrier, and — because the burst is only 5 ns long — it is **very wide**.',
      'The buttons choose the plotted quantity: **|X|**, **Norm**, **dB**, **|X|²** or **PSD**. The **Floor** sets how deep (in dB) you can see, and **Fit** frames the spectral envelope.',
    ],
  },
  {
    id: 'preset-long',
    title: 'Same carrier, a much longer burst',
    target: SEL.preset,
    placement: 'bottom',
    body: ['Now the opposite: the same 1 GHz carrier, but gated on for 200 ns (about 200 cycles). Watch the spectrum after you load it.'],
    action: {
      prompt: 'Choose **Fundamentals → Long RF burst (200 ns)** from the Preset menu.',
      ...loadPreset('long-rf-burst'),
    },
  },
  {
    id: 'duration-bandwidth',
    title: 'Long in time, narrow in frequency',
    target: SEL.freq,
    placement: 'bottom',
    scroll: 'center',
    body: [
      'The spectrum is now about **40 times narrower**. This is the central idea of the lab: a pulse that is short in time must be wide in frequency, and a long one is narrow — bandwidth is inversely proportional to duration (B ∝ 1/τ).',
      'It is a property of the waveform and of Fourier analysis, not an artefact of sampling.',
    ],
  },
  {
    id: 'strip',
    title: 'Live measurements',
    target: SEL.strip,
    placement: 'bottom',
    scroll: 'center',
    body: [
      'This strip lists numbers measured from the waveform and spectrum: **Pulse FWHM**, number of carrier **Cycles**, **FFT Δf** (the DFT bin spacing, not bandwidth), the **Nyquist** frequency, the **−3 dB** and **99 %** bandwidths and the time–bandwidth product. Hover a value for its definition.',
      'Just above it you will sometimes see short explanations and warnings (for example about sampling or Nyquist), often with a one-click fix.',
    ],
  },
  {
    id: 'tf-panel',
    title: 'Time–frequency analysis',
    target: SEL.tf,
    placement: 'top',
    scroll: 'center',
    body: [
      'A spectrum hides *when* each frequency occurs. This panel shows frequency against time using the **STFT** (short-time Fourier transform) or **wavelets (CWT)**, or all three views side by side in **Fourier vs STFT vs wavelet**.',
      'The window length trades time resolution against frequency resolution — try the “STFT window” preset under Time–frequency later.',
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace tabs',
    target: SEL.workspace,
    placement: 'top',
    scroll: 'center',
    body: [
      'The row of tabs at the bottom holds deeper tools: **Measurements**, **Power & energy**, **Instrument model**, **Guided experiments**, **A/B compare**, **Parameter sweep**, **Leakage & windows**, **Fourier synthesis** and **Theory & math**.',
      'Let us visit each of them.',
    ],
  },
  tabStep('measurements', 'Tab: Measurements', [
    'Detailed measurements: bandwidth under many definitions (−3, −6, −10, −40 dB, 90 % and 99 % occupied, null-to-null, RMS), duration, rise and fall, duty cycle and the time–bandwidth products — with a small chart that confirms B ∝ 1/τ for nearby pulse widths.',
  ]),
  {
    ...tabStep('power', 'Tab: Power & energy', [
      'Switch the amplitude to volts or field strength and this tab turns the waveform into **peak power, energy (or fluence), average power at a PRF, and pulse width by several definitions**.',
      'Loading the preset below gives a 10 V Gaussian into 50 Ω: peak power 2 W, energy 1.77 nJ and 177 µW average at 100 kHz.',
    ]),
    action: {
      prompt: 'Choose **Power & energy → Gaussian UWB pulse: 10 V into 50 Ω** from the Preset menu.',
      ...loadPreset('uwb-gaussian-50ohm'),
    },
  },
  {
    ...tabStep('instrument', 'Tab: Instrument model', [
      'A measurement is not the waveform itself. This tab sends the pulse through a model instrument: **trigger-jitter averaging, a bandwidth limit, sampling (rate and phase) and an ADC clip**, and compares what the instrument shows with the truth.',
      'The preset below uses a 150 MHz bandwidth: the displayed peak falls by about 42 % and the pulse looks wider, even though the sample rate is high.',
    ]),
    action: {
      prompt: 'Choose **Instrument model → Instrument bandwidth too low (150 MHz)** from the Preset menu.',
      ...loadPreset('scope-bandwidth-limit'),
    },
  },
  tabStep('experiments', 'Tab: Guided experiments', [
    'Step-by-step lessons. Each one loads a preset, tells you which control to change and what you should observe — for example shortening the pulse, raising the PRF, destroying coherence or undersampling to create aliasing.',
  ]),
  {
    id: 'tab-ab',
    title: 'Tab: A/B compare',
    target: SEL.saveA,
    placement: 'bottom',
    body: [
      '**Save as A** freezes the current configuration. Then change parameters: the plots overlay A (dotted) with the live configuration B, and the **A/B compare** tab lists the differences and the measured effect of each.',
    ],
    action: {
      prompt: 'Click **Save as A** in the top bar.',
      done: (c) => c.hasA,
      perform: (a) => a.saveA(),
    },
  },
  tabStep('sweep', 'Tab: Parameter sweep', [
    'Choose a parameter (pulse width, carrier, PRF …), a range and a measurement, and the lab computes the measurement at many values and plots it — a quick way to see scaling laws such as bandwidth versus pulse width.',
  ]),
  tabStep('leakage', 'Tab: Leakage & windows', [
    'Spectral leakage laboratory: a single tone observed for a finite record. Put it exactly **on a DFT bin** and the spectrum is a clean line; move it **between bins** and energy leaks everywhere — unless you choose a smoother analysis window, which trades some resolution for lower leakage (measured metrics are tabulated).',
  ]),
  tabStep('synthesis', 'Tab: Fourier synthesis', [
    'A periodic pulse (rectangular or Gaussian) rebuilt from its Fourier-series components. Increase the **number of frequency components** and watch the sum approach the target — narrower pulses need more. **Randomize component phases** to see that the same spectrum magnitudes no longer make a pulse.',
  ]),
  tabStep('theory', 'Tab: Theory & math', [
    'The equations behind what you see, rendered for the **current configuration** (they change with your toggles), plus a table of how each parameter affects time and frequency and a list of common conceptual mistakes.',
  ]),
  {
    id: 'header-tools',
    title: 'Tools in the top bar',
    target: SEL.actions,
    placement: 'bottom',
    body: [
      '**Save as A** — compare configurations. **Copy link** — a URL that reproduces the experiment. **Export** — waveform or spectrum CSV, configuration JSON, and import. **Reset** — back to the preset or the default; resets can be undone with **Undo**.',
      '**Text size − / +** makes everything larger or smaller (plots included), and the **theme** button switches between light and dark.',
    ],
  },
  {
    id: 'done',
    title: 'You are ready to explore',
    body: [
      'Pick any preset and change one parameter at a time; the measurement strip and the plots tell you what happened. The **Guided experiments** tab is a good next stop.',
      'To start over, use **Reset → Reset experiment**. You can reopen this tour any time with the **Tutorial** button. Press **Finish** to close it.',
    ],
  },
];
