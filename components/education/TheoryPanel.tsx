'use client';

import { ArrowDown, Check, X as XIcon } from 'lucide-react';
import { useLab } from '@/components/lab/context';
import { estimateSpectralExtent, resolveSampling } from '@/lib/dsp/sampling';
import MathPanel from './MathPanel';
import Tex from './Tex';

const TABLE: [string, string, string][] = [
  ['Carrier f₀', 'Faster/slower oscillations', 'Moves spectrum center'],
  ['Pulse width τ', 'Changes duration', 'Changes envelope bandwidth'],
  ['Rise time', 'Changes edge sharpness', 'Changes high-frequency content'],
  ['PRF', 'Changes pulse spacing', 'Changes comb spacing'],
  ['Pulse count', 'Changes train duration', 'Changes line width'],
  ['Phase', 'Shifts waveform phase', 'Changes spectral phase'],
  ['Coherence', 'Changes pulse phase relation', 'Changes comb sharpness'],
  ['Timing jitter', 'Perturbs pulse positions', 'Smears spectral lines'],
  ['Chirp', 'Frequency changes during pulse', 'Broadens occupied spectrum'],
  ['Sampling rate', 'Changes digital representation', 'Determines Nyquist range'],
  ['Observation time', 'Changes captured duration', 'Changes DFT bin spacing'],
  ['Window', 'Changes observation weighting', 'Main-lobe/sidelobe tradeoff'],
];

const MISTAKES: [string, string][] = [
  ['Sampling creates UWB bandwidth.', 'The waveform already possesses the bandwidth. Sampling determines whether we represent it correctly.'],
  ['PRF determines pulse bandwidth.', 'Pulse shape/duration determines the envelope. PRF determines repetition-related spectral spacing.'],
  ['Broadband means incoherent.', 'Bandwidth and coherence are distinct signal properties.'],
  ['A wavelet is perfectly finite in both time and frequency.', 'Wavelets achieve useful localization in both domains while obeying the time–frequency uncertainty principle.'],
  ['Zero padding improves true frequency resolution.', 'Zero padding interpolates the DFT representation but does not add information.'],
  ['The FFT is a different transform from the Fourier transform.', 'The FFT is an efficient algorithm for computing the DFT, the discrete finite representation of the Fourier transform.'],
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-sm border border-line bg-surface">
      <h3 className="border-b border-line px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-2">{title}</h3>
      <div className="p-3 text-[0.78125rem] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

function AliasingChain() {
  const { exp } = useLab();
  const { fs } = resolveSampling(exp.signal);
  const ext = estimateSpectralExtent(exp.signal);
  const ok = ext.fMaxHz <= fs / 2;
  const steps = ['Physical waveform x(t)', 'Physical spectrum X(f) — exists before any sampling', `Sampling at fₛ (Nyquist fₛ/2)`];
  return (
    <div className="flex flex-col items-start gap-1">
      {steps.map((s) => (
        <div key={s} className="flex flex-col items-start">
          <span className="rounded-sm border border-line-strong px-2 py-1 text-ink">{s}</span>
          <ArrowDown size={14} className="ml-3 text-muted" aria-hidden />
        </div>
      ))}
      <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 ${ok ? 'border-good/60 text-ink' : 'border-warn/70 text-ink'}`}>
        {ok ? <Check size={13} className="text-good" aria-hidden /> : <XIcon size={13} className="text-warn" aria-hidden />}
        {ok ? 'Correct representation (current settings)' : 'Aliasing: content beyond fₛ/2 folds back (current settings)'}
      </span>
    </div>
  );
}

export default function TheoryPanel() {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card title="Mathematics of the current signal">
        <MathPanel />
      </Card>
      <div className="grid content-start gap-3">
        <Card title="Fourier transform, DFT and FFT">
          <p>
            The <strong className="text-ink">Fourier transform</strong> <Tex>{'X(f)=\\int x(t)e^{-j2\\pi ft}dt'}</Tex> is the mathematical transform of a continuous signal. The{' '}
            <strong className="text-ink">DFT</strong> is the discrete, finite representation obtained from N samples over T_obs. The <strong className="text-ink">FFT</strong> is an efficient algorithm (O(N log N))
            for computing the DFT — not a different physical transform. This lab estimates X(f) as <Tex>{'\\Delta t\\cdot\\mathrm{DFT}'}</Tex>.
          </p>
        </Card>
        <Card title="Why negative frequencies appear">
          <p>
            A real cosine is the sum of two counter-rotating phasors: <Tex>{'\\cos(2\\pi f_0t)=\\tfrac12\\left(e^{j2\\pi f_0t}+e^{-j2\\pi f_0t}\\right)'}</Tex>. Real signals therefore have conjugate-symmetric spectra{' '}
            <Tex>{'X(-f)=X^*(f)'}</Tex>. The two-sided view (−fₛ/2 … fₛ/2) shows both; the one-sided view (0 … fₛ/2) folds them together, doubling power-like quantities. In the uncentered DFT order, negative
            frequencies appear above fₛ/2 because the DFT is periodic in fₛ.
          </p>
        </Card>
        <Card title="Exact support vs effective bandwidth">
          <p>
            A perfectly time-limited waveform generally has <strong className="text-ink">infinite theoretical spectral support</strong> (a rect’s sinc never ends). A Gaussian has infinite support in both domains yet
            is strongly localized in both. Distinguish <em>exact mathematical support</em>, <em>effective bandwidth</em> (e.g. −3 dB, RMS), <em>occupied bandwidth</em> (90 %/99 % energy) and the{' '}
            <em>measurement threshold</em>. Use “Show theoretical tails” (−100 dB floor) to see tails that a linear plot hides.
          </p>
        </Card>
        <Card title="Sampling does not create bandwidth">
          <AliasingChain />
        </Card>
      </div>
      <Card title="Parameter → effect">
        <div className="overflow-x-auto">
          <table className="w-full text-[0.75rem]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-1 text-left font-normal">Parameter</th>
                <th className="py-1 text-left font-normal">Primary time-domain effect</th>
                <th className="py-1 text-left font-normal">Primary frequency-domain effect</th>
              </tr>
            </thead>
            <tbody>
              {TABLE.map(([p, t, f]) => (
                <tr key={p} className="border-b border-line/50">
                  <td className="py-1 pr-2 text-ink">{p}</td>
                  <td className="py-1 pr-2">{t}</td>
                  <td className="py-1">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Common conceptual mistakes">
        <ul className="space-y-2">
          {MISTAKES.map(([w, c]) => (
            <li key={w} className="grid grid-cols-[16px_1fr] gap-x-2">
              <XIcon size={14} className="mt-0.5 text-critical" aria-label="Wrong" />
              <span className="text-muted line-through decoration-muted/50">{w}</span>
              <Check size={14} className="mt-0.5 text-good" aria-label="Correct" />
              <span className="text-ink">{c}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
