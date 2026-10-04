'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Download, GitCompareArrows, GraduationCap, Link2, Minus, Moon, Plus, RotateCcw, Sun, Undo2, Upload } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useFontSize } from './FontSizeProvider';
import { FONT_SCALE_MAX, FONT_SCALE_MIN, formatScale } from '@/lib/ui/fontScale';
import type { UiMode } from '@/types/signal';
import { PRESETS, PRESET_CATEGORIES } from '@/lib/presets/presets';
import { Segmented } from '@/components/controls/primitives';

function Menu({ label, icon, children }: { label: string; icon: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[0.75rem] text-ink-2 hover:text-ink"
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-64 rounded-sm border border-line-strong bg-raised py-1 shadow-xl">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, children, hint }: { onClick: () => void; children: ReactNode; hint?: string }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="block w-full px-3 py-1.5 text-left text-[0.75rem] text-ink-2 hover:bg-line hover:text-ink">
      {children}
      {hint ? <span className="block text-[0.6875rem] text-muted">{hint}</span> : null}
    </button>
  );
}

export interface HeaderProps {
  mode: UiMode;
  setMode: (m: UiMode) => void;
  presetId: string;
  onPreset: (id: string) => void;
  hasA: boolean;
  onSaveA: () => void;
  onClearA: () => void;
  onCopyLink: () => Promise<boolean>;
  onExport: (what: 'waveform' | 'spectrum' | 'json') => void;
  onImport: (file: File) => void;
  onResetExperiment: () => void;
  onResetPreset: () => void;
  undoLabel: string | null;
  onUndo: () => void;
  onTutorial: () => void;
}

/** Text size: − / + in 10 % steps (50–300 %), click the percentage to reset. Scales UI text and plot fonts. */
function FontSizeControl() {
  const { scale, increase, decrease, reset } = useFontSize();
  const btn = 'inline-flex h-6 w-6 items-center justify-center text-ink-2 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-2';
  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label="Text size">
      <span className="hidden text-[0.75rem] text-ink-2 md:inline">Text size</span>
      <div className="inline-flex items-center overflow-hidden rounded-sm border border-line-strong">
        <button type="button" onClick={decrease} disabled={scale <= FONT_SCALE_MIN} className={btn} aria-label="Decrease text size" title="Decrease text size">
          <Minus size={13} aria-hidden />
        </button>
        <button
          type="button"
          onClick={reset}
          className="tabular min-w-[3.25rem] border-x border-line-strong px-1 text-center text-[0.75rem] text-ink-2 hover:text-ink"
          aria-label={`Text size ${formatScale(scale)}. Click to reset to 100%`}
          title="Text size (click to reset to 100%)"
        >
          {formatScale(scale)}
        </button>
        <button type="button" onClick={increase} disabled={scale >= FONT_SCALE_MAX} className={btn} aria-label="Increase text size" title="Increase text size">
          <Plus size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const toLight = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[0.75rem] text-ink-2 hover:text-ink"
      aria-label={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
      title={toLight ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {toLight ? <Sun size={13} aria-hidden /> : <Moon size={13} aria-hidden />}
      <span className="hidden xl:inline">{toLight ? 'Light' : 'Dark'}</span>
    </button>
  );
}

export default function Header(p: HeaderProps) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [confirm, setConfirm] = useState<'exp' | 'preset' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg px-4 py-2">
      <div className="mr-auto min-w-0">
        <h1 className="text-[0.9375rem] font-semibold tracking-tight text-ink">Time–Frequency Lab</h1>
        <p className="truncate text-[0.71875rem] text-muted">Explore how waveform structure in time determines spectral structure in frequency.</p>
      </div>

      <Segmented<UiMode>
        ariaLabel="Interface complexity"
        value={p.mode}
        onChange={p.setMode}
        options={[
          { value: 'basic', label: 'Basic', title: 'Essential controls only' },
          { value: 'advanced', label: 'Advanced', title: 'Phase, coherence, jitter, chirp, edges, FFT settings' },
          { value: 'expert', label: 'Expert', title: 'STFT/wavelet parameters, normalization, estimators' },
        ]}
      />

      <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-2">
        <span className="hidden md:inline">Preset</span>
        <select
          value={p.presetId}
          onChange={(e) => p.onPreset(e.target.value)}
          className="max-w-[14.375rem] rounded-sm border border-line-strong bg-surface px-1.5 py-1 text-[0.75rem] text-ink"
          aria-label="Load preset"
        >
          {PRESET_CATEGORIES.map((c) => (
            <optgroup key={c} label={c}>
              {PRESETS.filter((x) => x.category === c).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-1.5" data-tour="header-actions">
        <button
          type="button"
          onClick={p.onTutorial}
          data-tour="tutorial"
          className="inline-flex items-center gap-1 rounded-sm border border-accent px-2 py-1 text-[0.75rem] text-ink hover:bg-accent/15"
          title="Start the guided tour of the interface"
        >
          <GraduationCap size={13} aria-hidden />
          <span>Tutorial</span>
        </button>
        <button
          type="button"
          data-tour="save-a"
          onClick={p.hasA ? p.onClearA : p.onSaveA}
          className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[0.75rem] ${p.hasA ? 'border-s5 text-ink' : 'border-line-strong text-ink-2 hover:text-ink'}`}
          title={p.hasA ? 'Remove the saved A configuration' : 'Save the current configuration as A, then modify to compare (B = live)'}
        >
          <GitCompareArrows size={13} aria-hidden />
          <span className="hidden sm:inline">{p.hasA ? 'Clear A' : 'Save as A'}</span>
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await p.onCopyLink();
            setCopied(ok ? 'ok' : 'fail');
            setTimeout(() => setCopied(null), 1800);
          }}
          className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[0.75rem] text-ink-2 hover:text-ink"
          title="Copy a shareable link to this experiment"
        >
          {copied === 'ok' ? <Check size={13} aria-hidden /> : <Link2 size={13} aria-hidden />}
          <span className="hidden sm:inline">{copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy link'}</span>
        </button>
        <Menu label="Export" icon={<Download size={13} aria-hidden />}>
          {(close) => (
            <>
              <MenuItem onClick={() => (p.onExport('waveform'), close())} hint="t (s), x, envelope, f_inst (Hz)">
                Waveform CSV
              </MenuItem>
              <MenuItem onClick={() => (p.onExport('spectrum'), close())} hint="f (Hz), |X|, dB, PSD, phase (rad)">
                Spectrum CSV
              </MenuItem>
              <MenuItem onClick={() => (p.onExport('json'), close())}>Configuration JSON</MenuItem>
              <MenuItem onClick={() => (fileRef.current?.click(), close())}>
                <span className="inline-flex items-center gap-1">
                  <Upload size={12} aria-hidden /> Import configuration JSON…
                </span>
              </MenuItem>
              <p className="border-t border-line px-3 py-1.5 text-[0.6875rem] text-muted">PNG: use the camera icon in each plot’s toolbar.</p>
            </>
          )}
        </Menu>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImport(f);
            e.target.value = '';
          }}
        />
        <Menu label="Reset" icon={<RotateCcw size={13} aria-hidden />}>
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  if (confirm === 'preset') {
                    p.onResetPreset();
                    setConfirm(null);
                    close();
                  } else setConfirm('preset');
                }}
                hint={confirm === 'preset' ? 'Click again to confirm' : 'Restore the active preset'}
              >
                Reset to preset defaults
              </MenuItem>
              <MenuItem
                onClick={() => {
                  if (confirm === 'exp') {
                    p.onResetExperiment();
                    setConfirm(null);
                    close();
                  } else setConfirm('exp');
                }}
                hint={confirm === 'exp' ? 'Click again to confirm' : 'Back to the default 1 GHz burst'}
              >
                Reset experiment
              </MenuItem>
              <p className="border-t border-line px-3 py-1.5 text-[0.6875rem] text-muted">Each control section also has its own reset (↺). Resets can be undone.</p>
            </>
          )}
        </Menu>
        <FontSizeControl />
        <ThemeToggle />
        {p.undoLabel ? (
          <button type="button" onClick={p.onUndo} className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[0.75rem] text-ink-2 hover:text-ink" title={`Undo: ${p.undoLabel}`}>
            <Undo2 size={13} aria-hidden />
            <span className="hidden lg:inline">Undo</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
