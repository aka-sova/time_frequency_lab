import type { Layout, LayoutAxis } from 'plotly.js-dist-min';

/** Dark instrument palette (validated categorical steps for a dark surface). */
export const C = {
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
};

export const HEATMAP_SCALE: [number, string][] = [
  [0, '#141413'],
  [0.2, '#0d366b'],
  [0.45, '#1c5cab'],
  [0.7, '#3987e5'],
  [0.88, '#86b6ef'],
  [1, '#e9f2fd'],
];

export function axis(title: string, extra: Partial<LayoutAxis> = {}): Partial<LayoutAxis> {
  return {
    title: { text: title, font: { size: 11, color: C.ink2 }, standoff: 6 },
    gridcolor: C.grid,
    zerolinecolor: C.axis,
    linecolor: C.axis,
    tickcolor: C.axis,
    tickfont: { size: 10, color: C.muted, family: 'ui-monospace, Consolas, monospace' },
    automargin: true,
    showline: true,
    mirror: false,
    ...extra,
  };
}

export function baseLayout(extra: Partial<Layout> = {}): Partial<Layout> {
  return {
    paper_bgcolor: C.paper,
    plot_bgcolor: C.surface,
    font: { family: 'system-ui, -apple-system, Segoe UI, sans-serif', size: 11, color: C.ink2 },
    margin: { l: 56, r: 14, t: 10, b: 38 },
    showlegend: true,
    legend: {
      orientation: 'h',
      x: 0,
      y: 1.02,
      yanchor: 'bottom',
      font: { size: 10, color: C.ink2 },
      bgcolor: 'rgba(0,0,0,0)',
    },
    hoverlabel: { bgcolor: '#222220', bordercolor: C.axis, font: { color: C.ink, size: 11, family: 'ui-monospace, Consolas, monospace' } },
    hovermode: 'closest',
    modebar: { bgcolor: 'rgba(0,0,0,0)', color: C.muted, activecolor: C.ink },
    dragmode: 'zoom',
    ...extra,
  };
}
