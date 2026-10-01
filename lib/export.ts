/** CSV / JSON export helpers (browser only). CSV columns carry explicit SI units. */
import type { Experiment } from '@/types/signal';
import type { SignalResult } from '@/lib/dsp/signals';
import type { Spectrum } from '@/lib/dsp/spectrum';
import { phaseAt } from '@/lib/dsp/spectrum';

export function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function waveformCsv(sig: SignalResult, amplitudeUnit: 'normalized' | 'V'): string {
  const u = amplitudeUnit === 'V' ? 'V' : 'normalized';
  const rows = [`t_s,x_${u},envelope_${u},instantaneous_frequency_Hz`];
  for (let i = 0; i < sig.n; i++) {
    const f = sig.instFreq[i];
    rows.push(`${sig.t[i].toExponential(9)},${sig.x[i].toExponential(9)},${sig.envelope[i].toExponential(6)},${Number.isFinite(f) ? f.toExponential(6) : ''}`);
  }
  return rows.join('\n');
}

export function spectrumCsv(s: Spectrum, tRef: number, amplitudeUnit: 'normalized' | 'V'): string {
  const unit = s.scaling === 'ft' ? (amplitudeUnit === 'V' ? 'V_per_Hz' : 'norm_s') : amplitudeUnit === 'V' ? 'V' : 'normalized';
  const rows = [`f_Hz,magnitude_${unit},magnitude_dB_re_peak,psd_two_sided_${amplitudeUnit === 'V' ? 'V2_per_Hz' : 'norm2_per_Hz'},phase_rad`];
  let peak = 0;
  for (let k = 0; k < s.nfft; k++) peak = Math.max(peak, s.power[k]);
  // Ascending frequency (fftshift order): most negative frequency first.
  const order = Array.from({ length: s.nfft }, (_, k) => k).sort((a, b) => s.freqs[a] - s.freqs[b]);
  for (const k of order) {
    const mag = Math.sqrt(s.power[k]) * s.magScale;
    const db = 10 * Math.log10(Math.max(s.power[k] / (peak || 1), 1e-30));
    rows.push(`${s.freqs[k].toExponential(9)},${mag.toExponential(9)},${db.toFixed(3)},${(s.power[k] * s.psdScale).toExponential(6)},${phaseAt(s, k, tRef).toFixed(6)}`);
  }
  return rows.join('\n');
}

export function experimentJson(exp: Experiment, presetId: string): string {
  return JSON.stringify({ app: 'time-frequency-lab', version: 1, preset: presetId, experiment: exp }, null, 2);
}
