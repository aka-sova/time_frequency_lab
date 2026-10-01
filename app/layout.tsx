import type { Metadata, Viewport } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

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
  themeColor: '#0d0d0d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
