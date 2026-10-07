/**
 * Minimum interface mode needed to see the controls of everything a configuration
 * actually uses (React-free). Basic hides some controls; if a preset switches on an
 * effect whose controls only exist in Advanced/Expert, the user would see the result
 * (e.g. a chirp) without being able to find the parameters behind it.
 *
 * Derived automatically from the SIGNAL configuration — only effects that Basic mode
 * cannot express are listed. Choices that Basic already conveys (the pulse shape comes
 * with the signal type and is visible in the plots) and pure presentation settings
 * (zero padding, STFT sizes, scaling …) deliberately do not count, otherwise nearly every
 * preset would force the user out of Basic. A preset whose lesson depends on such a
 * setting declares it explicitly with `Preset.minMode`.
 *
 * The gating itself lives in the components (ControlPanel …); this table mirrors it and a
 * test pins the result for every preset.
 */
import type { Experiment, UiMode } from '@/types/signal';
import { DEFAULT_SIGNAL } from './defaults';

export const MODE_RANK: Record<UiMode, number> = { basic: 0, advanced: 1, expert: 2 };

export interface ModeRequirement {
  mode: Exclude<UiMode, 'basic'>;
  /** Short phrase naming what needs the mode, e.g. "the chirp parameters". */
  reason: string;
}

interface Feature extends ModeRequirement {
  active: (e: Experiment) => boolean;
}

const isTrain = (e: Experiment) => e.signal.pulse.enabled && e.signal.repetition.enabled;
const carrierOn = (e: Experiment) => e.signal.carrier.enabled || e.signal.chirp.enabled;

const FEATURES: Feature[] = [
  { mode: 'advanced', reason: 'the chirp parameters', active: (e) => e.signal.chirp.enabled },
  { mode: 'advanced', reason: 'the phase-code parameters', active: (e) => e.signal.code.enabled && e.signal.pulse.enabled },
  {
    mode: 'advanced',
    reason: 'the jitter controls',
    active: (e) => isTrain(e) && (e.signal.jitter.timingEnabled || e.signal.jitter.amplitudeEnabled || e.signal.jitter.frequencyEnabled),
  },
  {
    // Pulse-to-pulse phase only matters when there is a carrier.
    mode: 'advanced',
    reason: 'the coherence controls',
    active: (e) => isTrain(e) && carrierOn(e) && (e.signal.coherence.mode !== DEFAULT_SIGNAL.coherence.mode || e.signal.coherence.reference !== DEFAULT_SIGNAL.coherence.reference),
  },
  { mode: 'advanced', reason: 'the finite rise/fall time controls', active: (e) => e.signal.pulse.enabled && e.signal.pulse.envelope === 'rect' && e.signal.pulse.edgesEnabled },
  { mode: 'advanced', reason: 'the pulse-to-pulse amplitude pattern', active: (e) => isTrain(e) && e.signal.repetition.amplitudeVariation !== 'none' },
  { mode: 'advanced', reason: 'the ADC quantization and aliasing-demonstration options', active: (e) => e.signal.sampling.quantizationEnabled || e.signal.sampling.aliasingDemo },
  {
    mode: 'expert',
    reason: 'the edge-shape option',
    active: (e) => e.signal.pulse.enabled && e.signal.pulse.envelope === 'rect' && e.signal.pulse.edgesEnabled && e.signal.pulse.edgeShape !== DEFAULT_SIGNAL.pulse.edgeShape,
  },
  { mode: 'expert', reason: 'the pulse-position option', active: (e) => e.signal.pulse.enabled && !e.signal.pulse.autoCenter },
  { mode: 'expert', reason: 'the modulation and noise controls', active: (e) => e.signal.am.enabled || e.signal.noise.enabled },
];

/**
 * Every Advanced/Expert-only feature the configuration uses, plus any requirement the
 * preset itself declares (`extra`).
 */
export function modeRequirements(e: Experiment, extra: ModeRequirement[] = []): ModeRequirement[] {
  return [...FEATURES.filter((f) => f.active(e)).map(({ mode, reason }) => ({ mode, reason })), ...extra];
}

export function minimumMode(e: Experiment, extra: ModeRequirement[] = []): UiMode {
  return modeRequirements(e, extra).reduce<UiMode>((m, r) => (MODE_RANK[r.mode] > MODE_RANK[m] ? r.mode : m), 'basic');
}

/** "the chirp parameters and the jitter controls" — only requirements the given mode satisfies are named. */
export function describeRequirements(reqs: ModeRequirement[], upTo: UiMode): string {
  const names = reqs.filter((r) => MODE_RANK[r.mode] <= MODE_RANK[upTo]).map((r) => r.reason);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const LABEL: Record<UiMode, string> = { basic: 'Basic', advanced: 'Advanced', expert: 'Expert' };
export const modeLabel = (m: UiMode) => LABEL[m];

export interface ModeUpgrade {
  /** The mode to switch to. */
  to: UiMode;
  /** Sentence for the explanation bar, e.g. "Switched to Advanced mode: this preset uses the chirp parameters." */
  note: string;
}

/**
 * Decides whether loading `exp` while in `current` mode needs a switch. Only ever upgrades;
 * returns null when the current mode already shows everything.
 */
export function planModeUpgrade(
  exp: Experiment,
  current: UiMode,
  opts: { extra?: ModeRequirement[]; verb?: string; subject?: string } = {},
): ModeUpgrade | null {
  const { extra = [], verb = 'Switched to', subject = 'preset' } = opts;
  const reqs = modeRequirements(exp, extra);
  const to = minimumMode(exp, extra);
  if (MODE_RANK[to] <= MODE_RANK[current]) return null;
  const why = describeRequirements(
    reqs.filter((r) => MODE_RANK[r.mode] > MODE_RANK[current]),
    to,
  );
  return { to, note: `${verb} ${LABEL[to]} mode: this ${subject} uses ${why}.` };
}
