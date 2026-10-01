'use client';

import { useId, useState, type ReactNode } from 'react';
import { Info, Lock, LockOpen } from 'lucide-react';
import type { UiMode } from '@/types/signal';
import { allowed, useLab } from '@/components/lab/context';
import { getPath } from '@/lib/state/path';
import { CHIRP_RATE_UNITS, FREQ_UNITS, TIME_UNITS, chooseUnit, parseEngineering, type UnitChoice } from '@/lib/units/format';
import { TOOLTIPS } from '@/lib/education/tooltips';

export function Gate({ level = 'basic', children }: { level?: UiMode; children: ReactNode }) {
  const { mode } = useLab();
  return allowed(mode, level) ? <>{children}</> : null;
}

export function InfoTip({ tip, label }: { tip?: string; label: string }) {
  const text = tip ? (TOOLTIPS[tip] ?? tip) : undefined;
  const id = useId();
  if (!text) return null;
  return (
    <span className="group/tip inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted hover:text-ink-2 focus-visible:text-ink"
        aria-label={`About ${label}`}
        aria-describedby={id}
      >
        <Info size={12} aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 right-0 top-full z-30 mt-1 rounded border border-line-strong bg-raised px-2.5 py-2 text-[12px] leading-snug text-ink-2 opacity-0 shadow-lg transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export function LockButton({ path }: { path: string }) {
  const { isLocked, toggleLock } = useLab();
  const locked = isLocked(path);
  return (
    <button
      type="button"
      onClick={() => toggleLock(path)}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-sm ${locked ? 'text-warn' : 'text-muted/60 hover:text-ink-2'}`}
      aria-pressed={locked}
      aria-label={locked ? 'Unlock parameter (presets may change it)' : 'Lock parameter (presets, isolate and sweeps keep it)'}
      title={locked ? 'Locked: presets keep this value' : 'Lock value'}
    >
      {locked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
    </button>
  );
}

export function FieldLabel({ htmlFor, label, tip, lockPath, right }: { htmlFor?: string; label: ReactNode; tip?: string; lockPath?: string; right?: ReactNode }) {
  return (
    <div className="flex min-h-5 items-center gap-1">
      <label htmlFor={htmlFor} className="text-[12px] text-ink-2">
        {label}
      </label>
      <InfoTip tip={tip} label={typeof label === 'string' ? label : 'parameter'} />
      <span className="ml-auto flex items-center gap-1">
        {right}
        {lockPath ? <LockButton path={lockPath} /> : null}
      </span>
    </div>
  );
}

const UNIT_SETS = { time: TIME_UNITS, freq: FREQ_UNITS, chirp: CHIRP_RATE_UNITS } as const;
const BASE = { time: 's', freq: 'Hz', chirp: 'Hz/s' } as const;

function trimNumber(v: number): string {
  if (!Number.isFinite(v)) return '';
  const s = Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : String(Number(v.toPrecision(5)));
  return s;
}

interface EngProps {
  label: ReactNode;
  path: string;
  kind: keyof typeof UNIT_SETS;
  min: number;
  max: number;
  log?: boolean;
  tip?: string;
  level?: UiMode;
  disabled?: boolean;
  lock?: boolean;
  hint?: ReactNode;
  /** Absolute input limits (defaults to slider range widened ×1000). */
  hardMin?: number;
  hardMax?: number;
  /** Controlled value (SI) when it is not stored at `path`. */
  value?: number;
  onCommit?: (v: number) => void;
}

/**
 * [ slider ] [ numeric input ] [ unit ▼ ] — values in SI, entry in any unit
 * ("2.5 GHz", "10n", "1e-9"); a bare number is read in the selected unit.
 */
export function EngineeringInput({ label, path, kind, min, max, log = true, tip, level = 'basic', disabled, lock = true, hint, hardMin, hardMax, value: vProp, onCommit }: EngProps) {
  const lab = useLab();
  const id = useId();
  const value = vProp ?? (getPath(lab.exp, path) as number);
  const units = UNIT_SETS[kind];
  const [userUnit, setUserUnit] = useState<UnitChoice | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (!allowed(lab.mode, level)) return null;

  const auto = chooseUnit(Math.abs(value) || max, units);
  const unit = userUnit && Math.abs(value) / userUnit.scale < 1e5 && (value === 0 || Math.abs(value) / userUnit.scale >= 1e-3) ? userUnit : auto;
  const lo = hardMin ?? (log ? min / 1000 : min);
  const hi = hardMax ?? max * 1000;
  const useLog = log && min > 0;
  const toPos = (v: number) => {
    const c = Math.min(Math.max(v, min), max);
    return useLog ? (1000 * Math.log(c / min)) / Math.log(max / min) : (1000 * (c - min)) / (max - min);
  };
  const fromPos = (p: number) => (useLog ? min * (max / min) ** (p / 1000) : min + ((max - min) * p) / 1000);
  const set = (v: number) => {
    const c = Math.min(Math.max(v, lo), hi);
    if (onCommit) onCommit(c);
    else lab.update(path, c);
  };
  const commit = () => {
    if (draft === null) return;
    const v = parseEngineering(draft, BASE[kind], unit.scale);
    if (v === null || !Number.isFinite(v)) {
      setError(true);
      return;
    }
    setError(false);
    setDraft(null);
    set(v);
  };
  const shown = draft ?? trimNumber(value / unit.scale);

  return (
    <div className="relative py-1">
      <FieldLabel htmlFor={id} label={label} tip={tip} lockPath={lock ? path : undefined} />
      <div className="mt-0.5 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={toPos(value)}
          disabled={disabled}
          onChange={(e) => {
            const raw = fromPos(Number(e.target.value));
            set(Number(raw.toPrecision(4)));
          }}
          className="min-w-0 flex-1"
          aria-label={`${typeof label === 'string' ? label : 'value'} slider`}
          aria-valuetext={`${trimNumber(value / unit.scale)} ${unit.label}`}
        />
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={shown}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(null);
              setError(false);
            }
          }}
          aria-invalid={error}
          className={`tabular w-[74px] rounded-sm border bg-surface px-1.5 py-0.5 text-right font-mono text-[12px] text-ink disabled:opacity-50 ${error ? 'border-critical' : 'border-line-strong'}`}
        />
        <select
          value={unit.label}
          disabled={disabled}
          onChange={(e) => setUserUnit(units.find((u) => u.label === e.target.value) ?? null)}
          aria-label="Unit"
          className="w-[62px] rounded-sm border border-line-strong bg-surface px-1 py-0.5 text-[12px] text-ink-2 disabled:opacity-50"
        >
          {units.map((u) => (
            <option key={u.label} value={u.label}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="mt-0.5 text-[11px] text-critical">Not a valid value. Try e.g. “2.5 GHz”, “10 ns”, “1e-9”.</p> : null}
      {hint ? <div className="mt-0.5 text-[11px] text-muted">{hint}</div> : null}
    </div>
  );
}

interface NumProps {
  label: ReactNode;
  path?: string;
  value?: number;
  onChange?: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
  suffix?: string;
  tip?: string;
  level?: UiMode;
  disabled?: boolean;
  lock?: boolean;
  hint?: ReactNode;
  slider?: boolean;
  right?: ReactNode;
}

/** Linear [ slider ] [ numeric input ] for dimensionless or fixed-unit values. */
export function NumberField({ label, path, value: vProp, onChange, min, max, step = 0.01, integer, suffix, tip, level = 'basic', disabled, lock, hint, slider = true, right }: NumProps) {
  const lab = useLab();
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  if (!allowed(lab.mode, level)) return null;
  const value = vProp ?? (getPath(lab.exp, path!) as number);
  const set = (v: number) => {
    let c = Math.min(Math.max(v, min), max);
    if (integer) c = Math.round(c);
    if (onChange) onChange(c);
    else lab.update(path!, c);
  };
  const commit = () => {
    if (draft === null) return;
    const v = parseFloat(draft.replace(',', '.').replace('−', '-'));
    setDraft(null);
    if (Number.isFinite(v)) set(v);
  };
  return (
    <div className="relative py-1">
      <FieldLabel htmlFor={id} label={label} tip={tip} lockPath={lock && path ? path : undefined} right={right} />
      <div className="mt-0.5 flex items-center gap-2">
        {slider ? (
          <input
            type="range"
            min={min}
            max={max}
            step={integer ? 1 : step}
            value={Math.min(Math.max(value, min), max)}
            disabled={disabled}
            onChange={(e) => set(Number(e.target.value))}
            className="min-w-0 flex-1"
            aria-label={`${typeof label === 'string' ? label : 'value'} slider`}
          />
        ) : (
          <span className="flex-1" />
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft ?? (integer ? String(Math.round(value)) : String(Number(value.toPrecision(4))))}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="tabular w-[74px] rounded-sm border border-line-strong bg-surface px-1.5 py-0.5 text-right font-mono text-[12px] text-ink disabled:opacity-50"
        />
        <span className="w-[62px] text-[12px] text-muted">{suffix}</span>
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted">{hint}</div> : null}
    </div>
  );
}

export function ToggleField({ label, path, tip, level = 'basic', disabled, checked: cProp, onChange }: { label: ReactNode; path?: string; tip?: string; level?: UiMode; disabled?: boolean; checked?: boolean; onChange?: (v: boolean) => void }) {
  const lab = useLab();
  const id = useId();
  if (!allowed(lab.mode, level)) return null;
  const checked = cProp ?? Boolean(getPath(lab.exp, path!));
  return (
    <div className="relative flex items-center gap-2 py-1">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => (onChange ? onChange(!checked) : lab.update(path!, !checked))}
        className={`relative h-[16px] w-[28px] shrink-0 rounded-full border transition-colors disabled:opacity-40 ${checked ? 'border-accent bg-accent/80' : 'border-line-strong bg-surface'}`}
      >
        <span className={`absolute top-[2px] h-[10px] w-[10px] rounded-full bg-ink transition-[left] ${checked ? 'left-[14px]' : 'left-[2px]'}`} />
      </button>
      <label htmlFor={id} className="text-[12px] text-ink-2">
        {label}
      </label>
      <InfoTip tip={tip} label={typeof label === 'string' ? label : 'option'} />
    </div>
  );
}

export function SelectField<T extends string | number>({
  label,
  path,
  options,
  tip,
  level = 'basic',
  disabled,
  value: vProp,
  onChange,
  lock,
}: {
  label: ReactNode;
  path?: string;
  options: { value: T; label: string }[];
  tip?: string;
  level?: UiMode;
  disabled?: boolean;
  value?: T;
  onChange?: (v: T) => void;
  lock?: boolean;
}) {
  const lab = useLab();
  const id = useId();
  if (!allowed(lab.mode, level)) return null;
  const value = vProp ?? (getPath(lab.exp, path!) as T);
  return (
    <div className="relative py-1">
      <FieldLabel htmlFor={id} label={label} tip={tip} lockPath={lock && path ? path : undefined} />
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          const opt = options.find((o) => String(o.value) === raw);
          if (!opt) return;
          if (onChange) onChange(opt.value);
          else lab.update(path!, opt.value);
        }}
        className="mt-0.5 w-full rounded-sm border border-line-strong bg-surface px-1.5 py-1 text-[12px] text-ink disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'xs';
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-sm border border-line-strong">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`${size === 'xs' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-[12px]'} border-l border-line-strong first:border-l-0 ${
              active ? 'bg-raised text-ink' : 'bg-transparent text-muted hover:text-ink-2'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SmallButton({ children, onClick, title, ariaLabel, active, disabled }: { children: ReactNode; onClick: () => void; title?: string; ariaLabel?: string; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] disabled:opacity-40 ${
        active ? 'border-accent/70 bg-accent/15 text-ink' : 'border-line-strong text-ink-2 hover:border-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

export function Readout({ label, value, title }: { label: ReactNode; value: ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-[12px]" title={title}>
      <span className="text-muted">{label}</span>
      <span className="tabular font-mono text-ink">{value}</span>
    </div>
  );
}
