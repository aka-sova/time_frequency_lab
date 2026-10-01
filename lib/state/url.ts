/**
 * Shareable URL state: ?preset=coherent-train&f0=1e9&pw=1e-8&prf=1e6 …
 * Only values that differ from the preset (or default) are written.
 */
import type { Experiment, UiMode } from '@/types/signal';
import { buildPresetById } from '@/lib/presets/apply';
import { getPreset } from '@/lib/presets/presets';
import { getPath, setPath } from './path';
import { sanitizeExperiment } from './sanitize';

type Kind = 'num' | 'bool' | 'str';

export const URL_KEYS: [string, string, Kind][] = [
  ['st', 'signal.signalType', 'str'],
  ['A', 'signal.amplitude', 'num'],
  ['au', 'signal.amplitudeUnit', 'str'],
  ['ce', 'signal.carrier.enabled', 'bool'],
  ['f0', 'signal.carrier.frequencyHz', 'num'],
  ['ph', 'signal.carrier.phaseRad', 'num'],
  ['pe', 'signal.pulse.enabled', 'bool'],
  ['env', 'signal.pulse.envelope', 'str'],
  ['pw', 'signal.pulse.widthSec', 'num'],
  ['pac', 'signal.pulse.autoCenter', 'bool'],
  ['pc', 'signal.pulse.centerSec', 'num'],
  ['ed', 'signal.pulse.edgesEnabled', 'bool'],
  ['es', 'signal.pulse.edgeShape', 'str'],
  ['tr', 'signal.pulse.riseTimeSec', 'num'],
  ['tf', 'signal.pulse.fallTimeSec', 'num'],
  ['ta', 'signal.pulse.tukeyAlpha', 'num'],
  ['re', 'signal.repetition.enabled', 'bool'],
  ['prf', 'signal.repetition.prfHz', 'num'],
  ['np', 'signal.repetition.pulseCount', 'num'],
  ['av', 'signal.repetition.amplitudeVariation', 'str'],
  ['ad', 'signal.repetition.amplitudeVariationDepth', 'num'],
  ['coh', 'signal.coherence.mode', 'str'],
  ['cref', 'signal.coherence.reference', 'str'],
  ['dphi', 'signal.coherence.phaseIncrementRad', 'num'],
  ['pn', 'signal.coherence.phaseNoiseRmsRad', 'num'],
  ['tje', 'signal.jitter.timingEnabled', 'bool'],
  ['tj', 'signal.jitter.timingRmsSec', 'num'],
  ['tjm', 'signal.jitter.timingMode', 'str'],
  ['tjp', 'signal.jitter.timingPeriodPulses', 'num'],
  ['aje', 'signal.jitter.amplitudeEnabled', 'bool'],
  ['aj', 'signal.jitter.amplitudeRms', 'num'],
  ['fje', 'signal.jitter.frequencyEnabled', 'bool'],
  ['fj', 'signal.jitter.frequencyRmsHz', 'num'],
  ['seed', 'signal.jitter.seed', 'num'],
  ['che', 'signal.chirp.enabled', 'bool'],
  ['cf1', 'signal.chirp.startFrequencyHz', 'num'],
  ['cf2', 'signal.chirp.endFrequencyHz', 'num'],
  ['ame', 'signal.am.enabled', 'bool'],
  ['amd', 'signal.am.depth', 'num'],
  ['amf', 'signal.am.frequencyHz', 'num'],
  ['ne', 'signal.noise.enabled', 'bool'],
  ['nr', 'signal.noise.rms', 'num'],
  ['sm', 'signal.sampling.mode', 'str'],
  ['fs', 'signal.sampling.sampleRateHz', 'num'],
  ['n', 'signal.sampling.sampleCount', 'num'],
  ['qe', 'signal.sampling.quantizationEnabled', 'bool'],
  ['qb', 'signal.sampling.bits', 'num'],
  ['al', 'signal.sampling.aliasingDemo', 'bool'],
  ['trm', 'analysis.time.range.mode', 'str'],
  ['tmin', 'analysis.time.range.min', 'num'],
  ['tmax', 'analysis.time.range.max', 'num'],
  ['tref', 'analysis.time.showReference', 'bool'],
  ['tsm', 'analysis.time.showSamples', 'bool'],
  ['tif', 'analysis.time.showInstFreq', 'bool'],
  ['sd', 'analysis.spectrum.display', 'str'],
  ['sc', 'analysis.spectrum.scaling', 'str'],
  ['sid', 'analysis.spectrum.sided', 'str'],
  ['win', 'analysis.spectrum.window', 'str'],
  ['zp', 'analysis.spectrum.zeroPad', 'num'],
  ['dbf', 'analysis.spectrum.dbFloor', 'num'],
  ['frm', 'analysis.spectrum.range.mode', 'str'],
  ['fmin', 'analysis.spectrum.range.min', 'num'],
  ['fmax', 'analysis.spectrum.range.max', 'num'],
  ['raw', 'analysis.spectrum.showRawBins', 'bool'],
  ['phs', 'analysis.spectrum.showPhase', 'bool'],
  ['sw', 'analysis.stft.windowLength', 'num'],
  ['so', 'analysis.stft.overlapPct', 'num'],
  ['sn', 'analysis.stft.nfft', 'num'],
  ['swin', 'analysis.stft.window', 'str'],
  ['cw', 'analysis.cwt.wavelet', 'str'],
  ['cw0', 'analysis.cwt.omega0', 'num'],
  ['cs', 'analysis.cwt.scales', 'num'],
  ['tfv', 'analysis.tfView', 'str'],
  ['tfrm', 'analysis.tfRange.mode', 'str'],
  ['tfmin', 'analysis.tfRange.min', 'num'],
  ['tfmax', 'analysis.tfRange.max', 'num'],
];

function enc(v: unknown, kind: Kind): string {
  if (kind === 'bool') return v ? '1' : '0';
  if (kind === 'num') return String(Number((v as number).toPrecision(10)));
  return String(v);
}

function dec(s: string, kind: Kind): unknown {
  if (kind === 'bool') return s === '1' || s === 'true';
  if (kind === 'num') {
    const x = Number(s);
    return Number.isFinite(x) ? x : undefined;
  }
  return s;
}

export function experimentToQuery(exp: Experiment, presetId: string, mode?: UiMode): string {
  const base = getPreset(presetId) ? buildPresetById(presetId) : buildPresetById('default');
  const q = new URLSearchParams();
  if (presetId && presetId !== 'default' && getPreset(presetId)) q.set('preset', presetId);
  for (const [key, path, kind] of URL_KEYS) {
    const v = getPath(exp, path);
    const b = getPath(base, path);
    if (v !== undefined && !Object.is(v, b)) q.set(key, enc(v, kind));
  }
  if (mode && mode !== 'basic') q.set('mode', mode);
  return q.toString();
}

export function queryToExperiment(search: string): { experiment: Experiment; presetId: string; mode?: UiMode } | null {
  const q = new URLSearchParams(search);
  if ([...q.keys()].length === 0) return null;
  const presetId = q.get('preset') && getPreset(q.get('preset')!) ? q.get('preset')! : 'default';
  let exp = buildPresetById(presetId);
  for (const [key, path, kind] of URL_KEYS) {
    const s = q.get(key);
    if (s === null) continue;
    const v = dec(s, kind);
    if (v !== undefined) exp = setPath(exp, path, v);
  }
  const m = q.get('mode');
  const mode = m === 'basic' || m === 'advanced' || m === 'expert' ? m : undefined;
  return { experiment: sanitizeExperiment(exp), presetId, mode };
}
