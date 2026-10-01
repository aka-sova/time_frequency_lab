'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Download, GitCompareArrows, Link2, RotateCcw, Undo2, Upload } from 'lucide-react';
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
        className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[12px] text-ink-2 hover:text-ink"
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
    <button type="button" role="menuitem" onClick={onClick} className="block w-full px-3 py-1.5 text-left text-[12px] text-ink-2 hover:bg-line hover:text-ink">
      {children}
      {hint ? <span className="block text-[11px] text-muted">{hint}</span> : null}
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
}

export default function Header(p: HeaderProps) {
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [confirm, setConfirm] = useState<'exp' | 'preset' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur">
      <div className="mr-auto min-w-0">
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">Time–Frequency Lab</h1>
        <p className="truncate text-[11.5px] text-muted">Explore how waveform structure in time determines spectral structure in frequency.</p>
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

      <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <span className="hidden md:inline">Preset</span>
        <select
          value={p.presetId}
          onChange={(e) => p.onPreset(e.target.value)}
          className="max-w-[230px] rounded-sm border border-line-strong bg-surface px-1.5 py-1 text-[12px] text-ink"
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

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={p.hasA ? p.onClearA : p.onSaveA}
          className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[12px] ${p.hasA ? 'border-s5 text-ink' : 'border-line-strong text-ink-2 hover:text-ink'}`}
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
          className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[12px] text-ink-2 hover:text-ink"
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
              <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">PNG: use the camera icon in each plot’s toolbar.</p>
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
              <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">Each control section also has its own reset (↺). Resets can be undone.</p>
            </>
          )}
        </Menu>
        {p.undoLabel ? (
          <button type="button" onClick={p.onUndo} className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[12px] text-ink-2 hover:text-ink" title={`Undo: ${p.undoLabel}`}>
            <Undo2 size={13} aria-hidden />
            <span className="hidden lg:inline">Undo</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
