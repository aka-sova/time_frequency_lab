'use client';

import type { SignalConfig } from '@/types/signal';
import { useLab } from '@/components/lab/context';
import { resolveSampling } from '@/lib/dsp/sampling';
import { carrierModel } from '@/lib/dsp/signals';
import { formatEngineering } from '@/lib/units/format';
import Tex from './Tex';

const ENVELOPE_TEX: Record<SignalConfig['pulse']['envelope'], { a: string; A: string }> = {
  rect: { a: 'a(t)=\\mathrm{rect}(t/\\tau)', A: 'A(f)=\\tau\\,\\mathrm{sinc}(f\\tau),\\quad \\mathrm{sinc}(x)=\\tfrac{\\sin\\pi x}{\\pi x}' },
  gaussian: { a: 'a(t)=e^{-t^2/(2\\sigma^2)},\\ \\sigma=\\tfrac{\\tau}{2\\sqrt{2\\ln 2}}', A: 'A(f)=\\sigma\\sqrt{2\\pi}\\,e^{-2\\pi^2\\sigma^2 f^2}' },
  'gaussian-d1': { a: 'a(t)\\propto -\\tfrac{t}{\\sigma}e^{-t^2/(2\\sigma^2)}', A: '|A(f)|\\propto |f|\\,e^{-2\\pi^2\\sigma^2f^2}\\ \\ (\\text{no DC})' },
  'gaussian-d2': { a: 'a(t)=\\left(1-\\tfrac{t^2}{\\sigma^2}\\right)e^{-t^2/(2\\sigma^2)}', A: '|A(f)|\\propto f^2\\,e^{-2\\pi^2\\sigma^2f^2}' },
  hann: { a: 'a(t)=\\tfrac12\\left[1+\\cos\\tfrac{2\\pi t}{\\tau}\\right],\\ |t|\\le\\tfrac{\\tau}{2}', A: '\\text{main lobe } \\pm 2/\\tau,\\ \\text{sidelobes} -31\\,\\text{dB}' },
  hamming: { a: 'a(t)=0.54+0.46\\cos\\tfrac{2\\pi t}{\\tau},\\ |t|\\le\\tfrac{\\tau}{2}', A: '\\text{main lobe } \\pm 2/\\tau,\\ \\text{sidelobes} -43\\,\\text{dB}' },
  blackman: { a: 'a(t)=0.42+0.5\\cos\\tfrac{2\\pi t}{\\tau}+0.08\\cos\\tfrac{4\\pi t}{\\tau}', A: '\\text{main lobe } \\pm 3/\\tau,\\ \\text{sidelobes} -58\\,\\text{dB}' },
  tukey: { a: 'a(t)=\\text{flat top with raised-cosine tapers (fraction }\\alpha)', A: '\\alpha\\to0:\\ \\mathrm{sinc};\\ \\alpha\\to1:\\ \\text{Hann}' },
};

function Eq({ label, tex }: { label: string; tex: string }) {
  return (
    <div className="grid items-center gap-x-4 border-b border-line/60 py-1.5 sm:grid-cols-[11.25rem_minmax(0,1fr)]">
      <span className="text-[0.75rem] text-muted">{label}</span>
      <Tex display>{tex}</Tex>
    </div>
  );
}

/** Equations for the currently configured signal. */
export default function MathPanel() {
  const { exp } = useLab();
  const s = exp.signal;
  const { fs, n } = resolveSampling(s);
  const cm = carrierModel(s, n / fs);
  const train = s.pulse.enabled && s.repetition.enabled;
  const parts: { label: string; tex: string }[] = [];

  const env = s.pulse.enabled ? 'a(t)' : '';
  const carrierTex = cm.on ? (s.chirp.enabled ? '\\cos\\!\\left[2\\pi\\left(f_c t+\\tfrac{k}{2}t^2\\right)+\\phi\\right]' : '\\cos(2\\pi f_0 t+\\phi)') : '';
  const amTex = s.am.enabled ? '\\left[1+\\mu\\cos(2\\pi f_m t)\\right]' : '';
  const single = `${amTex}A\\,${env}${carrierTex}` || 'A';
  if (train) {
    parts.push({
      label: 'Signal (pulse train)',
      tex: `x(t)=${amTex}\\sum_{n=0}^{N-1}A_n\\,a(t-t_n)${cm.on ? `\\cos\\!\\left[2\\pi\\left(f_{0,n}(t-t_n)${s.chirp.enabled ? '+\\tfrac{k}{2}(t-t_n)^2' : ''}\\right)+\\phi_n\\right]` : ''}`,
    });
    parts.push({ label: 'Pulse times', tex: `t_n = nT_r${s.jitter.timingEnabled ? '+\\Delta t_n,\\ \\Delta t_n\\sim\\mathcal N(0,\\sigma_t^2)' : ''},\\qquad T_r=\\frac{1}{PRF}=${formatEngineering(1 / s.repetition.prfHz, 's').replace('µ', '\\mu ')}` });
    parts.push({ label: 'Coherent train spectrum', tex: 'X(f)=P(f)\\sum_{n}e^{-j2\\pi f nT_r}\\ \\Rightarrow\\ \\text{lines every } \\Delta f_{\\text{comb}}=PRF,\\ \\ \\Delta f_{\\text{line}}\\approx\\frac{1}{NT_r}' });
    if (s.coherence.mode !== 'coherent') parts.push({ label: 'Incoherent average', tex: '\\mathbb{E}|X(f)|^2 \\approx N\\,|P(f)|^2 \\quad(\\text{no lines; level follows the single pulse})' });
  } else {
    parts.push({ label: 'Signal', tex: `x(t)=${single}` });
  }
  if (s.pulse.enabled) {
    const e = ENVELOPE_TEX[s.pulse.envelope];
    parts.push({ label: 'Envelope', tex: e.a });
    parts.push({ label: 'Envelope spectrum', tex: e.A });
    parts.push({ label: 'Width ↔ bandwidth', tex: 'B\\propto\\frac{1}{\\tau}\\qquad\\text{(scaling: } a(t/c)\\leftrightarrow |c|\\,A(cf)\\text{)}' });
    if (s.pulse.envelope === 'rect' && s.pulse.edgesEnabled) parts.push({ label: 'Edges', tex: 'B_{\\text{edge}}\\propto\\frac{1}{t_r},\\qquad |X(f)|\\ \\text{falls faster beyond}\\ f\\sim 1/t_r' });
  }
  if (cm.on) parts.push({ label: 'Modulation property', tex: 'a(t)\\cos(2\\pi f_0t)\\ \\leftrightarrow\\ \\tfrac12\\left[A(f-f_0)+A(f+f_0)\\right]' });
  if (s.chirp.enabled) {
    parts.push({ label: 'Instantaneous frequency', tex: 'f_{\\text{inst}}(t)=\\frac{1}{2\\pi}\\frac{d\\varphi}{dt}=f_c+kt,\\qquad k=\\frac{f_2-f_1}{T}' });
    parts.push({ label: 'Chirp bandwidth', tex: 'B_{\\text{chirp}}\\approx|k|T,\\qquad TBP\\approx |k|T^2 \\gg 1' });
  }
  parts.push({ label: 'Fourier transform', tex: 'X(f)=\\int_{-\\infty}^{\\infty}x(t)\\,e^{-j2\\pi ft}\\,dt' });
  parts.push({ label: 'DFT (computed by FFT)', tex: 'X[k]=\\sum_{n=0}^{N-1}x[n]\\,e^{-j2\\pi kn/N},\\qquad X(f_k)\\approx\\Delta t\\,X[k]' });
  parts.push({ label: 'Bin spacing / Nyquist', tex: `\\Delta f=\\frac{f_s}{N}=${formatEngineering(fs / n, 'Hz').replace('µ', '\\mu ')},\\qquad f_N=\\frac{f_s}{2}=${formatEngineering(fs / 2, 'Hz').replace('µ', '\\mu ')}` });
  parts.push({ label: 'Sampling (aliasing)', tex: 'X_s(f)=f_s\\sum_{m}X(f-mf_s)\\quad\\Rightarrow\\ \\text{overlap if } f_{\\max}>f_s/2' });
  parts.push({ label: 'Uncertainty', tex: '\\sigma_t\\,\\sigma_f\\ \\ge\\ \\frac{1}{4\\pi},\\quad \\text{equality for Gaussian envelopes}' });
  if (s.amplitudeUnit !== 'normalized') {
    const field = s.amplitudeUnit === 'V/m';
    parts.push({ label: field ? 'Power density' : 'Instantaneous power', tex: field ? 'S(t)=\\frac{E^2(t)}{\\eta_0},\\quad \\eta_0=376.73\\,\\Omega' : 'P(t)=\\frac{v^2(t)}{R}' });
    parts.push({ label: field ? 'Fluence' : 'Pulse energy', tex: field ? 'F=\\int S(t)\\,dt\\ \\ [\\mathrm{J/m^2}]' : 'E=\\int P(t)\\,dt=\\frac{1}{R}\\int v^2(t)\\,dt' });
    parts.push({ label: 'Gaussian, peak A', tex: 'E=\\frac{A^2}{R}\\,\\sigma\\sqrt{\\pi},\\qquad \\tau_{\\mathrm{eq}}=\\frac{E}{P_{\\mathrm{pk}}}=\\sigma\\sqrt{\\pi}' });
    parts.push({ label: 'Average power (no overlap)', tex: 'P_{\\mathrm{avg}}=E\\cdot PRF' });
  }
  parts.push({ label: 'Instrument: single pole', tex: 'H(f)=\\frac{1}{1+jf/\\mathrm{BW}},\\quad \\tau=\\frac{1}{2\\pi\\,\\mathrm{BW}},\\quad t_r^{10\\text{–}90}=\\ln 9\\,\\tau\\approx\\frac{0.35}{\\mathrm{BW}}' });
  parts.push({ label: 'Instrument: jitter averaging', tex: '\\bar v(t)=v(t)\\ast\\mathcal N(0,\\sigma_j^2),\\quad \\sigma_{\\mathrm{avg}}=\\sqrt{\\sigma^2+\\sigma_j^2},\\quad \\frac{V_{\\mathrm{pk}}}{V_{\\mathrm{pk},0}}=\\frac{\\sigma}{\\sigma_{\\mathrm{avg}}}' });

  return (
    <div>
      <p className="mb-2 text-[0.75rem] text-ink-2">Equations for the current configuration (they update with the toggles). Convention: ordinary frequency f, X(f) = ∫x(t)e^(−j2πft)dt.</p>
      {parts.map((p) => (
        <Eq key={p.label} {...p} />
      ))}
    </div>
  );
}
