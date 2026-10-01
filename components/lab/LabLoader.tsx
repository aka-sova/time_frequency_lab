'use client';

import dynamic from 'next/dynamic';

function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-bg text-ink-2">
      <p className="text-[15px] font-semibold text-ink">Time–Frequency Lab</p>
      <p className="text-[12px] text-muted">Loading signal engine…</p>
    </div>
  );
}

/** The lab runs entirely in the browser (DSP + WebGL/SVG plots), so it is not server-rendered. */
const Lab = dynamic(() => import('./Lab'), { ssr: false, loading: Loading });

export default function LabLoader() {
  return <Lab />;
}
