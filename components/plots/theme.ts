import type { Layout, LayoutAxis } from 'plotly.js-dist-min';

export type ThemeName = 'dark' | 'light';

/** Plot palette. Series steps are the validated categorical slots for each surface. */
export interface Palette {
  surface: string;
  paper: string;
  grid: string;
  axis: string;
  ink: string;
  ink2: string;
  muted: string;
  signal: string;
  envelope: string;
  reference: string;
  cursor: string;
  compare: string;
  extra: string;
  band: string;
  band99: string;
  selection: string;
  beyondNyquist: string;
  labelBg: string;
  hoverBg: string;
  component: string;
  heatmap: [number, string][];
}

export const PALETTES: Record<ThemeName, Palette> = {
  dark: {
    surface: '#1a1a19',
    paper: '#141413',
    grid: '#2c2c2a',
    axis: '#3d3d3a',
    ink: '#f3f2ee',
    ink2: '#c3c2b7',
    muted: '#9a9890',
    signal: '#3987e5',
    envelope: '#d95926',
    reference: '#199e70',
    cursor: '#c98500',
    compare: '#d55181',
    extra: '#9085e9',
    band: 'rgba(57,135,229,0.10)',
    band99: 'rgba(25,158,112,0.08)',
    selection: 'rgba(201,133,0,0.08)',
    beyondNyquist: 'rgba(255,255,255,0.03)',
    labelBg: 'rgba(20,20,19,0.7)',
    hoverBg: '#222220',
    component: 'rgba(154,152,144,0.45)',
    heatmap: [
      [0, '#141413'],
      [0.2, '#0d366b'],
      [0.45, '#1c5cab'],
      [0.7, '#3987e5'],
      [0.88, '#86b6ef'],
      [1, '#e9f2fd'],
    ],
  },
  light: {
    surface: '#fcfcfb',
    paper: '#f6f5f1',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#6b6964',
    signal: '#2a78d6',
    envelope: '#eb6834',
    reference: '#1baf7a',
    cursor: '#c98500',
    compare: '#e87ba4',
    extra: '#4a3aa7',
    band: 'rgba(42,120,214,0.10)',
    band99: 'rgba(27,175,122,0.09)',
    selection: 'rgba(201,133,0,0.10)',
    beyondNyquist: 'rgba(0,0,0,0.04)',
    labelBg: 'rgba(252,252,251,0.8)',
    hoverBg: '#ffffff',
    component: 'rgba(82,81,78,0.35)',
    // Sequential blue, near-surface at 0 (low magnitude recedes), dark at the peak.
    heatmap: [
      [0, '#fcfcfb'],
      [0.2, '#cde2fb'],
      [0.45, '#86b6ef'],
      [0.7, '#2a78d6'],
      [0.88, '#1c5cab'],
      [1, '#0d366b'],
    ],
  },
};

export function axis(p: Palette, title: string, extra: Partial<LayoutAxis> = {}): Partial<LayoutAxis> {
  return {
    title: { text: title, font: { size: 11, color: p.ink2 }, standoff: 6 },
    gridcolor: p.grid,
    zerolinecolor: p.axis,
    linecolor: p.axis,
    tickcolor: p.axis,
    tickfont: { size: 10, color: p.muted, family: 'ui-monospace, Consolas, monospace' },
    automargin: true,
    showline: true,
    mirror: false,
    ...extra,
  };
}

export function baseLayout(p: Palette, extra: Partial<Layout> = {}): Partial<Layout> {
  return {
    paper_bgcolor: p.paper,
    plot_bgcolor: p.surface,
    font: { family: 'system-ui, -apple-system, Segoe UI, sans-serif', size: 11, color: p.ink2 },
    margin: { l: 56, r: 14, t: 10, b: 38 },
    showlegend: true,
    legend: {
      orientation: 'h',
      x: 0,
      y: 1.02,
      yanchor: 'bottom',
      font: { size: 10, color: p.ink2 },
      bgcolor: 'rgba(0,0,0,0)',
    },
    hoverlabel: { bgcolor: p.hoverBg, bordercolor: p.axis, font: { color: p.ink, size: 11, family: 'ui-monospace, Consolas, monospace' } },
    hovermode: 'closest',
    modebar: { bgcolor: 'rgba(0,0,0,0)', color: p.muted, activecolor: p.ink },
    dragmode: 'zoom',
    ...extra,
  };
}
