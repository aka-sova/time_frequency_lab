'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Crosshair, RotateCcw } from 'lucide-react';
import type { UiMode } from '@/types/signal';
import { allowed, useLab, type SectionKey } from '@/components/lab/context';
import type { IsolateKey } from '@/lib/presets/isolate';
import { ISOLATE_LABELS } from '@/lib/presets/isolate';
import { getPath } from '@/lib/state/path';

interface SectionProps {
  title: string;
  level?: UiMode;
  defaultOpen?: boolean;
  resetKey?: SectionKey;
  isolateKeys?: IsolateKey[];
  enablePath?: string;
  badge?: ReactNode;
  children: ReactNode;
}

export default function Section({ title, level = 'basic', defaultOpen = true, resetKey, isolateKeys, enablePath, badge, children }: SectionProps) {
  const lab = useLab();
  const [open, setOpen] = useState(defaultOpen);
  if (!allowed(lab.mode, level)) return null;
  const enabled = enablePath ? Boolean(getPath(lab.exp, enablePath)) : true;
  const bodyId = `sec-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section className="border-b border-line">
      <div className="flex items-center gap-1 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-2 hover:text-ink"
        >
          <ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
          {title}
          {badge}
        </button>
        {enablePath ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`Enable ${title}`}
            onClick={() => lab.update(enablePath, !enabled)}
            className={`relative h-[14px] w-[24px] shrink-0 rounded-full border ${enabled ? 'border-accent bg-accent/80' : 'border-line-strong bg-surface'}`}
          >
            <span className={`absolute top-[2px] h-[8px] w-[8px] rounded-full bg-ink ${enabled ? 'left-[12px]' : 'left-[2px]'}`} />
          </button>
        ) : null}
        {resetKey ? (
          <button
            type="button"
            onClick={() => lab.resetSection(resetKey)}
            className="inline-flex h-5 w-5 items-center justify-center text-muted hover:text-ink-2"
            aria-label={`Reset ${title} to preset values`}
            title="Reset this section to the preset values"
          >
            <RotateCcw size={12} aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={bodyId} className={`px-3 pb-2 ${enabled ? '' : 'opacity-60'}`}>
          {isolateKeys && allowed(lab.mode, 'basic') ? (
            <div className="mb-1 flex flex-wrap gap-1">
              {isolateKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => lab.isolate(k)}
                  className="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-line-strong hover:text-ink-2"
                  title={`Keep the current ${ISOLATE_LABELS[k]} and reset unrelated parameters to a clean reference state`}
                >
                  <Crosshair size={11} aria-hidden /> Isolate {ISOLATE_LABELS[k]}
                </button>
              ))}
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="my-1 rounded-sm border border-line bg-surface/60 px-2 py-1.5 text-[11.5px] leading-snug text-ink-2">{children}</div>;
}
