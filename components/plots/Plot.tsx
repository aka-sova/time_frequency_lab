'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Config, Data, Layout, PlotlyHTMLElement } from 'plotly.js-dist-min';
import { useFontSize } from '@/components/layout/FontSizeProvider';
import { scalePlotLayout } from '@/lib/ui/fontScale';
import { resetAxesUpdate } from '@/lib/ui/plotView';

type PlotlyModule = typeof import('plotly.js-dist-min');

let loader: Promise<PlotlyModule> | null = null;
export function loadPlotly(): Promise<PlotlyModule> {
  if (!loader) {
    loader = import('plotly.js-dist-min').then((m) => ((m as unknown as { default?: PlotlyModule }).default ?? m) as PlotlyModule);
  }
  return loader;
}

export type RelayoutEvent = Record<string, unknown>;

interface PlotProps {
  data: Data[];
  layout: Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
  height: number;
  ariaLabel: string;
  filename?: string;
  onRelayout?: (e: RelayoutEvent) => void;
  onClick?: (x: number, y: number) => void;
}

const BASE_CONFIG: Partial<Config> = {
  displaylogo: false,
  responsive: false,
  scrollZoom: false,
  // Plotly's built-in double-click restores the range from the FIRST draw (stale after presets, Fit or unit
  // changes). We handle it ourselves below and return to the range the current layout asks for.
  doubleClick: false,
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines'],
};

/**
 * Thin Plotly wrapper: Plotly.react on every prop change (uirevision in the
 * layout preserves user zoom), a ResizeObserver for responsive width, and
 * stable event handlers.
 */
export default function Plot({ data, layout, config, className, height, ariaLabel, filename, onRelayout, onClick }: PlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onRelayout, onClick });
  const bound = useRef(false);
  const resetRef = useRef<Record<string, unknown>>({});
  const [failed, setFailed] = useState(false);
  const { scale } = useFontSize();
  const scaledLayout = useMemo(() => scalePlotLayout(layout, scale), [layout, scale]);
  // Snapshot of the intended axis ranges, taken while the layout is still pristine: Plotly keeps references to the
  // nested axis objects of the layout it is given and rewrites their ranges in place whenever the user zooms.
  const resetUpdate = useMemo(() => resetAxesUpdate(scaledLayout), [scaledLayout]);

  useEffect(() => {
    handlers.current = { onRelayout, onClick };
    resetRef.current = resetUpdate;
  });

  useEffect(() => {
    let alive = true;
    loadPlotly()
      .then((P) => {
        const el = ref.current;
        if (!alive || !el) return;
        const cfg: Partial<Config> = {
          ...BASE_CONFIG,
          toImageButtonOptions: { format: 'png', filename: filename ?? 'time-frequency-lab', scale: 2 },
          ...config,
        };
        return P.react(el, data, { ...scaledLayout, height, autosize: true }, cfg).then((gd: PlotlyHTMLElement) => {
          if (bound.current) return;
          bound.current = true;
          gd.on('plotly_relayout', (e) => handlers.current.onRelayout?.(e as unknown as RelayoutEvent));
          gd.on('plotly_click', (e) => {
            const pt = e.points?.[0];
            if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') handlers.current.onClick?.(pt.x, pt.y);
          });
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [data, scaledLayout, config, height, filename]);

  // A double-click on the plot area returns every axis to the range the current layout asks for. With Plotly's own
  // reset switched off it emits no double-click event, so detect the second click ourselves (click count 2; this also
  // works where a native dblclick event is not sent).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDoubleClick = (ev: MouseEvent) => {
      if (ev.detail !== 2 || !(ev.target as Element | null)?.closest?.('.draglayer')) return; // second click, on the plot area (not legend or modebar)
      loadPlotly().then((P) => {
        // relayout accepts dotted attribute names ("xaxis.range"), which the typings do not model.
        if ((el as unknown as { _fullLayout?: unknown })._fullLayout) void P.relayout(el as unknown as PlotlyHTMLElement, resetRef.current as Partial<Layout>);
      });
    };
    el.addEventListener('click', onDoubleClick);
    return () => el.removeEventListener('click', onDoubleClick);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        loadPlotly().then((P) => {
          if (el.isConnected && (el as unknown as { _fullLayout?: unknown })._fullLayout) P.Plots.resize(el);
        });
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      loadPlotly().then((P) => P.purge(el));
      bound.current = false;
    };
  }, []);

  if (failed) {
    return (
      <div className={className} style={{ height }} role="alert">
        <p className="p-4 text-muted">The plotting library could not be loaded.</p>
      </div>
    );
  }
  return <div ref={ref} className={className} style={{ height, width: '100%', minWidth: 0, overflow: 'hidden', isolation: 'isolate' }} role="img" aria-label={ariaLabel} />;
}
