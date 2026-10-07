'use client';

import { useState } from 'react';
import { AlertTriangle, Info, Lightbulb, Wand2, X } from 'lucide-react';
import type { LabWarning } from '@/lib/dsp/warnings';
import type { Explanation } from '@/lib/education/explanations';

interface Props {
  explanation: Explanation | null;
  onDismiss: () => void;
  warnings: LabWarning[];
  onFix: (w: LabWarning) => void;
}

/** Context explanation (latest change) + non-intrusive warnings. */
export default function StatusBar({ explanation, onDismiss, warnings, onFix }: Props) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? warnings : warnings.slice(0, 2);
  return (
    <div className="border-b border-line bg-panel" aria-live="polite">
      {explanation ? (
        <div className="flex items-start gap-2 px-4 py-1.5 text-[0.78125rem]">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden />
          <p className="flex-1 text-ink-2">
            <strong className="mr-1 text-ink">{explanation.title}.</strong>
            {explanation.text}
          </p>
          {explanation.action ? (
            <button
              type="button"
              onClick={() => {
                explanation.action?.run();
                onDismiss();
              }}
              className="shrink-0 rounded-sm border border-line-strong px-1.5 py-0.5 text-[0.6875rem] text-ink-2 hover:text-ink"
            >
              {explanation.action.label}
            </button>
          ) : null}
          <button type="button" onClick={onDismiss} className="text-muted hover:text-ink" aria-label="Dismiss explanation">
            <X size={13} aria-hidden />
          </button>
        </div>
      ) : null}
      {shown.map((w) => (
        <div key={w.id} className="flex items-start gap-2 border-t border-line px-4 py-1 text-[0.75rem]">
          {w.level === 'warning' ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" aria-label="Warning" /> : <Info size={13} className="mt-0.5 shrink-0 text-muted" aria-label="Note" />}
          <p className="flex-1">
            <span className={w.level === 'warning' ? 'text-ink' : 'text-ink-2'}>{w.title}</span> <span className="text-muted">{w.detail}</span>
          </p>
          {w.fix ? (
            <button type="button" onClick={() => onFix(w)} className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-line-strong px-1.5 py-0.5 text-[0.6875rem] text-ink-2 hover:text-ink">
              <Wand2 size={11} aria-hidden /> {w.fix === 'fix-sampling' ? 'Fix sampling' : w.fix === 'enable-carrier' ? 'Turn carrier on' : 'Extend observation'}
            </button>
          ) : null}
        </div>
      ))}
      {warnings.length > 2 ? (
        <button type="button" onClick={() => setExpanded(!expanded)} className="w-full border-t border-line px-4 py-0.5 text-left text-[0.6875rem] text-muted hover:text-ink-2">
          {expanded ? 'Show fewer notes' : `+${warnings.length - 2} more note${warnings.length - 2 > 1 ? 's' : ''}`}
        </button>
      ) : null}
    </div>
  );
}
