'use client';

import { Fragment, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, GraduationCap, Wand2, X } from 'lucide-react';
import { placeCard, type Rect } from '@/lib/tutorial/position';
import { TUTORIAL_STEPS, type TutorialApi, type TutorialContext } from '@/lib/tutorial/steps';

interface Props {
  open: boolean;
  onClose: () => void;
  ctx: TutorialContext;
  api: TutorialApi;
}

/** **bold** → <strong>. */
function Rich({ text }: { text: string }): ReactNode {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

interface Layout {
  rect: Rect | null;
  card: { w: number; h: number };
  vp: { w: number; h: number };
}

const SPOT_PAD = 6;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/** Mounted only while the tour is open, so every opening starts from the first step. */
export default function TutorialHost(p: Props) {
  return p.open ? <Tour {...p} /> : null;
}

function Tour({ onClose, ctx, api }: Props) {
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set());
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [layout, setLayout] = useState<Layout>(() => ({ rect: null, card: { w: 448, h: 320 }, vp: { w: window.innerWidth, h: window.innerHeight } }));
  const cardRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef(api);
  const step = TUTORIAL_STEPS[index];
  const last = index === TUTORIAL_STEPS.length - 1;
  const isDone = !step.action || completed.has(step.id) || step.action.done(ctx);

  useEffect(() => {
    apiRef.current = api;
  });

  const go = (to: number) => {
    if (to > index && step.action && isDone) setCompleted((c) => new Set(c).add(step.id));
    setDrag({ x: 0, y: 0 });
    setIndex(clamp(to, 0, TUTORIAL_STEPS.length - 1));
  };

  // Step side effects (e.g. show the tab being explained), then bring the target into view.
  useEffect(() => {
    step.onEnter?.(apiRef.current);
    const timer = window.setTimeout(() => {
      const el = step.target ? document.querySelector(step.target) : null;
      if (!el) return;
      if (step.scroll === 'below-header') {
        const header = document.querySelector('header');
        const offset = (header?.getBoundingClientRect().height ?? 0) + 8;
        window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset), behavior: 'smooth' });
      } else if (step.scroll === 'center') {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 150);
    cardRef.current?.focus({ preventScroll: true });
    return () => window.clearTimeout(timer);
  }, [step]);

  // Follow the target (it moves with scrolling, resizing, tab changes and text-size changes).
  useEffect(() => {
    let raf = 0;
    let lastKey = '';
    const tick = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      let rect: Rect | null = null;
      if (el) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) rect = { top: b.top, left: b.left, width: b.width, height: b.height };
      }
      const card = cardRef.current;
      const next: Layout = {
        rect,
        card: card ? { w: card.offsetWidth, h: card.offsetHeight } : { w: 448, h: 320 },
        vp: { w: window.innerWidth, h: window.innerHeight },
      };
      const key = [rect ? [rect.top, rect.left, rect.width, rect.height].map(Math.round).join(',') : 'none', next.card.w, next.card.h, next.vp.w, next.vp.h].join('|');
      if (key !== lastKey) {
        lastKey = key;
        setLayout(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { rect, card, vp } = layout;
  const placed = placeCard(rect, card, vp, step.placement ?? 'bottom');
  const top = clamp(placed.top + drag.y, 0, vp.h - card.h);
  const left = clamp(placed.left + drag.x, 0, vp.w - card.w);

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const start = { px: e.clientX, py: e.clientY, x: drag.x, y: drag.y };
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setDrag({ x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const progress = ((index + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <>
      {rect ? (
        // The ring is click-through, so the highlighted control stays usable; the dim comes from its huge shadow.
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-md border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-[top,left,width,height] duration-200"
          style={{ top: rect.top - SPOT_PAD, left: rect.left - SPOT_PAD, width: rect.width + 2 * SPOT_PAD, height: rect.height + 2 * SPOT_PAD }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 z-[60] bg-black/55" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-tutorial-card
        className="fixed z-[70] flex max-h-[calc(100vh-1.5rem)] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-md border border-line-strong bg-surface text-ink shadow-2xl outline-none"
        style={{ top, left }}
      >
        <div onPointerDown={onDragStart} className="flex cursor-move touch-none select-none items-start gap-2 border-b border-line bg-panel px-3 py-2" title="Drag to move this window">
          <GraduationCap size={16} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] uppercase tracking-wider text-muted">
              Tutorial · step {index + 1} of {TUTORIAL_STEPS.length}
            </p>
            <h2 id={titleId} className="text-[0.9375rem] font-semibold leading-snug">
              {step.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-sm p-1 text-muted hover:text-ink" aria-label="Close tutorial" title="Close tutorial (Esc)">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="h-0.5 bg-line" role="progressbar" aria-valuemin={1} aria-valuemax={TUTORIAL_STEPS.length} aria-valuenow={index + 1} aria-label="Tutorial progress">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>

        <div className="thin-scroll space-y-2 overflow-y-auto px-3 py-3 text-[0.8125rem] leading-relaxed text-ink-2">
          {step.body.map((para, i) => (
            <p key={i}>
              <Rich text={para} />
            </p>
          ))}

          {step.action ? (
            <div className={`rounded-sm border px-2.5 py-2 ${isDone ? 'border-accent bg-accent/10' : 'border-line-strong bg-panel'}`}>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">Your turn</p>
              <p className="mt-0.5 text-ink">
                <Rich text={step.action.prompt} />
              </p>
              <div className="mt-2 flex items-center gap-2">
                {isDone ? (
                  <span className="inline-flex items-center gap-1 text-[0.75rem] text-accent-strong">
                    <Check size={13} aria-hidden /> Done — press Next
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => step.action!.perform(apiRef.current)}
                    className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[0.75rem] text-ink-2 hover:text-ink"
                  >
                    <Wand2 size={12} aria-hidden /> Do it for me
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-panel px-3 py-2">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2.5 py-1 text-[0.8125rem] text-ink-2 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-2"
          >
            <ChevronLeft size={14} aria-hidden /> Previous
          </button>
          {last ? (
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/20 px-3 py-1 text-[0.8125rem] font-medium text-ink hover:bg-accent/30">
              Finish <Check size={14} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={!isDone}
              title={isDone ? undefined : 'Do the step above (or press “Do it for me”) to continue'}
              className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/20 px-3 py-1 text-[0.8125rem] font-medium text-ink hover:bg-accent/30 disabled:opacity-40 disabled:hover:bg-accent/20"
            >
              Next <ChevronRight size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
