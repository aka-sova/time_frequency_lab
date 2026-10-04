/**
 * Engineering-unit formatting and parsing. Values are stored in SI; display
 * prefixes are chosen automatically (or from a fixed unit list for inputs).
 */

import type { AmplitudeUnit } from '@/types/signal';

export type BaseUnit = 's' | 'Hz' | 'V' | 'rad' | '' | 'V/Hz' | 'Hz/s' | 'V/m' | 'W' | 'J' | 'W/m²' | 'J/m²' | 'Ω';

const PREFIXES: { p: string; e: number }[] = [
  { p: 'T', e: 12 },
  { p: 'G', e: 9 },
  { p: 'M', e: 6 },
  { p: 'k', e: 3 },
  { p: '', e: 0 },
  { p: 'm', e: -3 },
  { p: 'µ', e: -6 },
  { p: 'n', e: -9 },
  { p: 'p', e: -12 },
  { p: 'f', e: -15 },
];

export interface UnitChoice {
  label: string;
  scale: number;
}

export const TIME_UNITS: UnitChoice[] = [
  { label: 's', scale: 1 },
  { label: 'ms', scale: 1e-3 },
  { label: 'µs', scale: 1e-6 },
  { label: 'ns', scale: 1e-9 },
  { label: 'ps', scale: 1e-12 },
];

export const FREQ_UNITS: UnitChoice[] = [
  { label: 'Hz', scale: 1 },
  { label: 'kHz', scale: 1e3 },
  { label: 'MHz', scale: 1e6 },
  { label: 'GHz', scale: 1e9 },
];

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

export const CHIRP_RATE_UNITS: UnitChoice[] = [
  { label: 'Hz/s', scale: 1 },
  { label: 'MHz/µs', scale: 1e12 },
  { label: 'GHz/µs', scale: 1e15 },
];

function prefixFor(abs: number, allowed?: string[]): { p: string; e: number } {
  const list = allowed ? PREFIXES.filter((x) => allowed.includes(x.p)) : PREFIXES;
  if (!(abs > 0) || !Number.isFinite(abs)) return list.find((x) => x.e === 0) ?? list[0];
  for (const x of list) if (abs >= 10 ** x.e * (1 - 5e-10)) return x;
  return list[list.length - 1];
}

const ALLOWED: Partial<Record<BaseUnit, string[]>> = {
  s: ['', 'm', 'µ', 'n', 'p', 'f'],
  Hz: ['', 'k', 'M', 'G', 'T'],
  'Hz/s': ['', 'k', 'M', 'G', 'T'],
  W: ['', 'k', 'M', 'G', 'm', 'µ', 'n', 'p'],
  'W/m²': ['', 'k', 'M', 'G', 'm', 'µ', 'n', 'p'],
  J: ['', 'k', 'm', 'µ', 'n', 'p', 'f'],
  'J/m²': ['', 'k', 'm', 'µ', 'n', 'p', 'f'],
  'V/m': ['', 'k', 'M', 'm', 'µ'],
  Ω: ['', 'k', 'M', 'm'],
};

/** Formats with `digits` significant figures: formatEngineering(1.24e-8, 's') → "12.4 ns". */
export function formatEngineering(value: number, unit: BaseUnit | string = '', digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (value === 0) return `0${unit ? ' ' + unit : ''}`;
  const abs = Math.abs(value);
  const pf = prefixFor(abs, ALLOWED[unit as BaseUnit]);
  const scaled = value / 10 ** pf.e;
  const mag = Math.floor(Math.log10(Math.abs(scaled)));
  const decimals = Math.max(0, Math.min(6, digits - 1 - mag));
  let s = scaled.toFixed(decimals);
  if (s.startsWith('-')) s = '−' + s.slice(1);
  return `${s} ${pf.p}${unit}`.trim();
}

/** Picks a display unit (from a list) so that `maxAbs` shows as 1…999. */
export function chooseUnit(maxAbs: number, units: UnitChoice[]): UnitChoice {
  const sorted = [...units].sort((a, b) => b.scale - a.scale);
  for (const u of sorted) if (Math.abs(maxAbs) >= u.scale * (1 - 1e-9)) return u;
  return sorted[sorted.length - 1];
}

export function formatNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? '—' : v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(Math.max(digits - 1, 0)).replace('-', '−');
  const mag = Math.floor(Math.log10(a));
  const s = v.toFixed(Math.max(0, digits - 1 - mag));
  return s.startsWith('-') ? '−' + s.slice(1) : s;
}

export function formatPhase(rad: number, unit: 'deg' | 'rad', digits = 3): string {
  if (!Number.isFinite(rad)) return '—';
  return unit === 'deg' ? `${formatNumber((rad * 180) / Math.PI, digits)}°` : `${formatNumber(rad, digits)} rad`;
}

export function formatDb(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(digits);
  return `${s.startsWith('-') ? '−' + s.slice(1) : s} dB`;
}

const PREFIX_VALUES: Record<string, number> = {
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  '': 1,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
};

/**
 * Parses engineering text into SI: "2.5 GHz" → 2.5e9, "10n" → 1e-8,
 * "1e-9" → 1e-9. A bare number is interpreted in `defaultScale` (the
 * currently displayed unit). For frequencies a lowercase "m" before "hz" is
 * read as mega ("10 mhz"), since millihertz is never meaningful here.
 */
export function parseEngineering(text: string, base: BaseUnit | string, defaultScale = 1): number | null {
  const s = text.trim().replace(/,/g, '.').replace(/−/g, '-');
  if (!s) return null;
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-zA-Zµμ/°]*)$/i.exec(s);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  let suffix = m[2];
  if (!suffix) return num * defaultScale;
  const baseLower = base.toLowerCase();
  let unitPart = '';
  if (baseLower && suffix.toLowerCase().endsWith(baseLower)) {
    unitPart = suffix.slice(suffix.length - baseLower.length);
    suffix = suffix.slice(0, suffix.length - baseLower.length);
  }
  if (suffix === '') return unitPart ? num : num * defaultScale;
  let key = suffix;
  if (base === 'Hz' && key === 'm') key = 'M';
  if (!(key in PREFIX_VALUES)) {
    if (base === 'rad' && /^(deg|°)$/i.test(suffix)) return (num * Math.PI) / 180;
    return null;
  }
  return num * PREFIX_VALUES[key];
}
