import type { Metadata, Viewport } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';
import { THEME_INIT_SCRIPT } from '@/components/layout/themeScript';

export const metadata: Metadata = {
  title: 'Time–Frequency Lab',
  description:
    'Interactive signal laboratory: explore how waveform structure in time determines spectral structure in frequency — pulse width, carrier, PRF, coherence, jitter, chirp, sampling, aliasing, windowing, STFT and wavelets.',
  applicationName: 'Time–Frequency Lab',
  keywords: ['Fourier transform', 'DFT', 'FFT', 'STFT', 'wavelet', 'bandwidth', 'PRF', 'aliasing', 'RF', 'DSP', 'education'],
  openGraph: {
    title: 'Time–Frequency Lab',
    description: 'Explore how waveform structure in time determines spectral structure in frequency.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
    { media: '(prefers-color-scheme: light)', color: '#f9f9f7' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set by the inline script before hydration, hence suppressHydrationWarning.
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
