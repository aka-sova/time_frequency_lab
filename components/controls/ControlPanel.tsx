'use client';

import { Dices, Repeat2, Wand2 } from 'lucide-react';
import type { CoherenceMode, SignalType } from '@/types/signal';
import { allowed, useLab } from '@/components/lab/context';
import Tex from '@/components/education/Tex';
import Section, { Note } from './Section';
import { EngineeringInput, Gate, NumberField, Readout, Segmented, SelectField, SmallButton, ToggleField, FieldLabel } from './primitives';
import { ENVELOPES } from '@/lib/dsp/windows';
import { SIGNAL_TYPES } from '@/lib/presets/defaults';
import { autoSampling, estimateSpectralExtent, resolveSampling } from '@/lib/dsp/sampling';
import { formatEngineering, formatNumber } from '@/lib/units/format';
import { carrierModel } from '@/lib/dsp/signals';
import { BARKER_LENGTHS, barkerPattern, CODE_FAMILIES, FRANK_ORDERS, P4_MAX, P4_MIN, snapCodeLength } from '@/lib/dsp/codes';

const SAMPLE_COUNTS = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];

function PhaseField({ label, path, tip, level = 'advanced', min = -Math.PI, max = Math.PI }: { label: string; path: string; tip: string; level?: 'basic' | 'advanced' | 'expert'; min?: number; max?: number }) {
  const lab = useLab();
  const unit = lab.exp.analysis.phaseUnit;
  const k = unit === 'deg' ? 180 / Math.PI : 1;
  const v = path.split('.').reduce<unknown>((o, key) => (o as Record<string, unknown>)[key], lab.exp) as number;
  return (
    <NumberField
      label={label}
      value={v * k}
      onChange={(x) => lab.update(path, x / k)}
      min={min * k}
      max={max * k}
      step={unit === 'deg' ? 1 : 0.01}
      tip={tip}
      level={level}
      right={
        <Segmented
          size="xs"
          ariaLabel="Phase unit"
          value={unit}
          options={[
            { value: 'deg', label: 'deg' },
            { value: 'rad', label: 'rad' },
          ]}
          onChange={(u) => lab.update('analysis.phaseUnit', u)}
        />
      }
    />
  );
}

export default function ControlPanel() {
  const lab = useLab();
  const s = lab.exp.signal;
  const { fs, n } = resolveSampling(s);
  const T = n / fs;
  const carrier = carrierModel(s, T);
  const ext = estimateSpectralExtent(s);
  const isTrain = s.pulse.enabled && s.repetition.enabled;
  const tau = s.pulse.widthSec;
  const codeL = snapCodeLength(s.code.family, s.code.length);

  return (
    <div className="pb-6">
      <Section title="Signal" color="signal" resetKey="general">
        <SelectField<SignalType>
          label="Signal type"
          path="signal.signalType"
          tip="signalType"
          options={SIGNAL_TYPES.map((t) => ({ value: t.id, label: t.label }))}
        />
        <p className="pb-1 text-[0.6875rem] text-muted">{SIGNAL_TYPES.find((t) => t.id === s.signalType)?.description}</p>
        {s.amplitudeUnit === 'normalized' ? (
          <NumberField label="Amplitude A" path="signal.amplitude" min={0} max={2} step={0.01} suffix="norm." tip="amplitude" lock />
        ) : (
          <EngineeringInput
            label="Amplitude A (peak)"
            path="signal.amplitude"
            kind={s.amplitudeUnit === 'V' ? 'volt' : 'field'}
            min={1e-2}
            max={1e5}
            hardMin={0}
            hardMax={1e6}
            tip="amplitude"
            hint={s.amplitudeUnit === 'V' ? <>Across the {lab.exp.analysis.load.resistanceOhm} Ω load set in the Power &amp; energy tab</> : <>Free-space plane wave, η₀ = 376.73 Ω</>}
          />
        )}
        <Gate level="advanced">
          <div className="flex items-center justify-between py-1">
            <span className="text-[0.75rem] text-ink-2">Amplitude unit</span>
            <Segmented
              size="xs"
              ariaLabel="Amplitude unit"
              value={s.amplitudeUnit}
              options={[
                { value: 'normalized', label: 'norm.' },
                { value: 'V', label: 'V' },
                { value: 'V/m', label: 'V/m' },
              ]}
              onChange={(v) => lab.update('signal.amplitudeUnit', v)}
            />
          </div>
        </Gate>
      </Section>

      <Section title="Carrier" color="carrier" resetKey="carrier" enablePath={allowed(lab.mode, 'advanced') ? 'signal.carrier.enabled' : undefined} isolateKeys={['carrier']}>
        <EngineeringInput
          label={<>Carrier frequency f₀</>}
          path="signal.carrier.frequencyHz"
          kind="freq"
          min={1e6}
          max={20e9}
          hardMin={0}
          hardMax={1e12}
          tip="f0"
          disabled={s.chirp.enabled}
          hint={s.chirp.enabled ? <>Set by the chirp: f_c = {formatEngineering(carrier.centerHz, 'Hz', 4)}</> : <>Carrier period {formatEngineering(1 / Math.max(s.carrier.frequencyHz, 1e-30), 's')}</>}
        />
        <PhaseField label="Initial phase φ₀" path="signal.carrier.phaseRad" tip="phase" />
        {!s.carrier.enabled && !s.chirp.enabled ? <Note>Carrier off: the waveform is the baseband envelope itself.</Note> : null}
      </Section>

      <Section title="Pulse envelope" color="pulse" resetKey="pulse" enablePath={allowed(lab.mode, 'advanced') ? 'signal.pulse.enabled' : undefined} isolateKeys={['pulseWidth', 'riseTime']}>
        <SelectField label="Envelope" path="signal.pulse.envelope" tip="envelope" level="advanced" options={ENVELOPES.map((e) => ({ value: e.id, label: e.label }))} />
        <EngineeringInput label="Pulse width τ" path="signal.pulse.widthSec" kind="time" min={50e-12} max={2e-6} hardMin={1e-14} hardMax={1} tip="pulseWidth" />
        <Readout
          label={<Tex>{'B \\propto 1/\\tau'}</Tex>}
          value={`1/τ = ${formatEngineering(1 / tau, 'Hz')}`}
          title="Pulse duration sets the envelope bandwidth"
        />
        {carrier.on ? <Readout label={<Tex>{'N_{\\text{cycles}} \\approx f_0\\tau'}</Tex>} value={formatNumber(carrier.centerHz * tau, 3)} /> : null}
        {s.pulse.envelope === 'tukey' ? <NumberField label="Taper fraction α" path="signal.pulse.tukeyAlpha" min={0} max={1} step={0.01} tip="tukeyAlpha" level="advanced" /> : null}
        {s.pulse.envelope === 'rect' ? (
          <Gate level="advanced">
            <ToggleField label="Finite rise / fall time" path="signal.pulse.edgesEnabled" tip="edges" />
            {s.pulse.edgesEnabled ? (
              <>
                <EngineeringInput label="Rise time t_r (10–90 %)" path="signal.pulse.riseTimeSec" kind="time" min={10e-12} max={200e-9} hardMin={0} hardMax={1} tip="riseTime" level="advanced" />
                <EngineeringInput label="Fall time t_f (90–10 %)" path="signal.pulse.fallTimeSec" kind="time" min={10e-12} max={200e-9} hardMin={0} hardMax={1} tip="fallTime" level="advanced" />
                <SelectField
                  label="Edge shape"
                  path="signal.pulse.edgeShape"
                  tip="edgeShape"
                  level="expert"
                  options={[
                    { value: 'linear', label: 'Linear (trapezoid)' },
                    { value: 'cosine', label: 'Raised cosine (smooth)' },
                  ]}
                />
                <Readout
                  label={<Tex>{'B_{\\text{edge}} \\propto 1/t_r'}</Tex>}
                  value={`0.35/t_r = ${formatEngineering(0.35 / Math.max(Math.min(s.pulse.riseTimeSec, s.pulse.fallTimeSec), 1e-15), 'Hz')}`}
                  title="Edge speed sets how far the high-frequency tail extends — distinct from the 1/τ envelope width"
                />
                <Note>
                  Pulse duration (<Tex>{'1/\\tau'}</Tex>) and edge speed (<Tex>{'1/t_r'}</Tex>) are related but distinct bandwidth mechanisms: τ sets the main lobe, t_r sets how far the tail extends.
                </Note>
              </>
            ) : (
              <Note>Ideal edges: mathematically discontinuous, spectral tails decay only as 1/f.</Note>
            )}
          </Gate>
        ) : null}
        <Gate level="expert">
          <ToggleField label="Center pulse in observation window" path="signal.pulse.autoCenter" tip="pulseCenter" />
          {!s.pulse.autoCenter ? <EngineeringInput label="Pulse (train) center" path="signal.pulse.centerSec" kind="time" min={1e-9} max={Math.max(T, 2e-9)} log={false} hardMin={0} hardMax={100} tip="pulseCenter" /> : null}
        </Gate>
      </Section>

      <Section title="Pulse train / PRF" color="train" resetKey="repetition" enablePath="signal.repetition.enabled" isolateKeys={['prf']}>
        {!s.pulse.enabled && s.repetition.enabled ? <Note>Enable the pulse envelope to form a train.</Note> : null}
        <EngineeringInput label="PRF" path="signal.repetition.prfHz" kind="freq" min={10e3} max={500e6} hardMin={1} hardMax={1e11} tip="prf" disabled={!s.repetition.enabled} />
        <Readout label={<Tex>{'T_r = 1/PRF'}</Tex>} value={formatEngineering(1 / s.repetition.prfHz, 's')} />
        <NumberField
          label="Number of pulses N"
          path="signal.repetition.pulseCount"
          min={1}
          max={128}
          integer
          tip="pulseCount"
          lock
          disabled={!s.repetition.enabled}
          right={
            <>
              <SmallButton onClick={() => lab.update('signal.repetition.pulseCount', Math.max(1, Math.floor(s.repetition.pulseCount / 2)))} ariaLabel="Halve the number of pulses">
                ÷2
              </SmallButton>
              <SmallButton onClick={() => lab.update('signal.repetition.pulseCount', Math.min(1024, s.repetition.pulseCount * 2))} ariaLabel="Double the number of pulses">
                ×2
              </SmallButton>
            </>
          }
        />
        <Readout label={<Tex>{'T_{\\text{burst}} = N/PRF'}</Tex>} value={formatEngineering(s.repetition.pulseCount / s.repetition.prfHz, 's')} />
        <Gate level="advanced">
          <NumberField
            label="Duty cycle τ·PRF"
            value={tau * s.repetition.prfHz * 100}
            onChange={(d) => lab.update('signal.pulse.widthSec', d / 100 / s.repetition.prfHz)}
            min={0.1}
            max={100}
            step={0.1}
            suffix="%"
            tip="dutyCycle"
            disabled={!isTrain}
          />
          <SelectField
            label="Pulse-to-pulse amplitude"
            path="signal.repetition.amplitudeVariation"
            tip="ampVariation"
            options={[
              { value: 'none', label: 'Constant' },
              { value: 'ramp', label: 'Linear ramp' },
              { value: 'alternating', label: 'Alternating' },
            ]}
          />
          {s.repetition.amplitudeVariation !== 'none' ? <NumberField label="Variation depth" path="signal.repetition.amplitudeVariationDepth" min={0} max={1} step={0.01} /> : null}
        </Gate>
        <Note>
          <strong className="text-ink">Pulse width controls the broad spectral envelope; PRF controls the spacing between spectral lines</strong>{' '}
          (<Tex>{'\\Delta f_{\\text{comb}} = PRF'}</Tex>).
        </Note>
      </Section>

      <Section title="Coherence" color="coherence" level="advanced" resetKey="coherence" isolateKeys={['coherence']}>
        <FieldLabel label="Pulse-to-pulse phase" tip="coherence" />
        <div className="py-1">
          <Segmented<CoherenceMode>
            ariaLabel="Coherence mode"
            value={s.coherence.mode}
            onChange={(v) => lab.update('signal.coherence.mode', v)}
            options={[
              { value: 'coherent', label: 'Coherent', title: 'φₙ = φ₀ (deterministic)' },
              { value: 'increment', label: 'Δφ step', title: 'φₙ = φ₀ + nΔφ' },
              { value: 'partial', label: 'Phase noise', title: 'φₙ = φₙ,ideal + εₙ' },
              { value: 'incoherent', label: 'Random', title: 'φₙ ~ U(0, 2π)' },
            ]}
          />
        </div>
        <SelectField
          label="Carrier reference"
          path="signal.coherence.reference"
          tip="carrierReference"
          options={[
            { value: 'continuous', label: 'Gated CW (φₙ = φ₀ + 2πf₀tₙ)' },
            { value: 'pulse', label: 'Pulse-locked copies (φₙ = φ₀)' },
          ]}
        />
        {s.coherence.mode === 'increment' ? <PhaseField label="Phase increment Δφ" path="signal.coherence.phaseIncrementRad" tip="phaseIncrement" /> : null}
        {s.coherence.mode === 'partial' ? <PhaseField label="Phase noise σφ (RMS)" path="signal.coherence.phaseNoiseRmsRad" tip="phaseNoise" min={0} max={Math.PI} /> : null}
        <Readout
          label="Model"
          value={
            <Tex>
              {s.coherence.mode === 'coherent'
                ? '\\phi_n=\\phi_0'
                : s.coherence.mode === 'increment'
                  ? '\\phi_n=\\phi_0+n\\Delta\\phi'
                  : s.coherence.mode === 'partial'
                    ? '\\phi_n=\\phi_n^{\\text{ideal}}+\\epsilon_n,\\ \\epsilon_n\\sim\\mathcal{N}(0,\\sigma_\\phi^2)'
                    : '\\phi_n\\sim U(0,2\\pi)'}
            </Tex>
          }
        />
        <Note>
          Single-pulse bandwidth → pulse shape/duration.
          <br />
          Pulse-train spectral structure → PRF + coherence.
          <br />
          Bandwidth and coherence are distinct signal properties.
        </Note>
        {!isTrain ? <Note>Coherence applies to pulse trains — enable the train to see its effect.</Note> : null}
      </Section>

      <Section title="Jitter" color="jitter" level="advanced" resetKey="jitter" isolateKeys={['jitter']}>
        <ToggleField label="Timing jitter" path="signal.jitter.timingEnabled" tip="timingJitter" />
        {s.jitter.timingEnabled ? (
          <>
            <EngineeringInput label="Timing jitter σ_t (RMS)" path="signal.jitter.timingRmsSec" kind="time" min={0} max={5e-9} log={false} hardMin={0} hardMax={1} tip="timingJitter" />
            <SelectField
              label="Jitter type"
              path="signal.jitter.timingMode"
              tip="timingMode"
              options={[
                { value: 'random', label: 'Random (Gaussian)' },
                { value: 'periodic', label: 'Deterministic (sinusoidal)' },
              ]}
            />
            {s.jitter.timingMode === 'periodic' ? <NumberField label="Jitter period (pulses)" path="signal.jitter.timingPeriodPulses" min={2} max={64} integer tip="timingPeriod" /> : null}
            <Readout label={<Tex>{'t_n=nT_r+\\Delta t_n'}</Tex>} value={`2πf₀σ_t = ${formatNumber(2 * Math.PI * carrier.centerHz * s.jitter.timingRmsSec, 2)} rad`} />
          </>
        ) : null}
        <ToggleField label="Amplitude jitter" path="signal.jitter.amplitudeEnabled" tip="amplitudeJitter" />
        {s.jitter.amplitudeEnabled ? <NumberField label="Amplitude RMS ε" path="signal.jitter.amplitudeRms" min={0} max={0.5} step={0.005} tip="amplitudeJitter" /> : null}
        <ToggleField label="Frequency jitter" path="signal.jitter.frequencyEnabled" tip="frequencyJitter" />
        {s.jitter.frequencyEnabled ? (
          <EngineeringInput label="Frequency RMS Δf" path="signal.jitter.frequencyRmsHz" kind="freq" min={0} max={100e6} log={false} hardMin={0} hardMax={1e11} tip="frequencyJitter" />
        ) : null}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <NumberField label="Random seed" path="signal.jitter.seed" min={0} max={99999} integer slider={false} tip="seed" />
          </div>
          <div className="pb-1.5">
            <SmallButton onClick={() => lab.update('signal.jitter.seed', Math.floor(Math.random() * 99999))} ariaLabel="New random seed">
              <Dices size={12} aria-hidden /> New
            </SmallButton>
          </div>
        </div>
        {!isTrain ? <Note>Jitter acts between pulses — enable the pulse train.</Note> : null}
      </Section>

      <Section title="Chirp (LFM)" color="chirp" level="advanced" resetKey="chirp" enablePath="signal.chirp.enabled" isolateKeys={['chirp']}>
        <EngineeringInput label="Start frequency" path="signal.chirp.startFrequencyHz" kind="freq" min={1e6} max={20e9} hardMin={0} hardMax={1e12} tip="chirpStart" disabled={!s.chirp.enabled} />
        <EngineeringInput label="End frequency" path="signal.chirp.endFrequencyHz" kind="freq" min={1e6} max={20e9} hardMin={0} hardMax={1e12} tip="chirpEnd" disabled={!s.chirp.enabled} />
        <div className="py-1">
          <SmallButton
            onClick={() =>
              lab.updateMany([
                ['signal.chirp.startFrequencyHz', s.chirp.endFrequencyHz],
                ['signal.chirp.endFrequencyHz', s.chirp.startFrequencyHz],
              ])
            }
            ariaLabel="Swap up/down chirp"
          >
            <Repeat2 size={12} aria-hidden /> {s.chirp.endFrequencyHz >= s.chirp.startFrequencyHz ? 'Up-chirp → make down' : 'Down-chirp → make up'}
          </SmallButton>
        </div>
        {s.chirp.enabled ? (
          <>
            <Readout label={<Tex>{'f_{\\text{inst}}(t)=f_c+kt'}</Tex>} value={`k = ${formatEngineering(carrier.chirpRate * 1e-6, 'Hz')}/µs`} />
            <Readout
              label={<Tex>{'B_{\\text{chirp}}\\approx|k|T'}</Tex>}
              value={`${formatEngineering(Math.abs(carrier.chirpRate) * carrier.chirpDuration, 'Hz')}, TBP ≈ ${formatNumber(Math.abs(carrier.chirpRate) * carrier.chirpDuration ** 2, 3)}`}
            />
          </>
        ) : null}
      </Section>

      <Section title="Phase code" color="code" level="advanced" resetKey="code" enablePath="signal.code.enabled" isolateKeys={['code']}>
        <div className="py-1">
          <FieldLabel label="Code family" tip="codeFamily" />
          <div className="mt-0.5">
            <Segmented
              size="xs"
              ariaLabel="Code family"
              value={s.code.family}
              options={CODE_FAMILIES.map((f) => ({ value: f.id, label: f.label }))}
              onChange={(f) =>
                lab.updateMany([
                  ['signal.code.family', f],
                  ['signal.code.length', snapCodeLength(f, s.code.length)],
                ])
              }
            />
          </div>
        </div>
        {s.code.family === 'barker' ? (
          <SelectField
            label="Length L"
            path="signal.code.length"
            tip="codeLength"
            disabled={!s.code.enabled}
            options={BARKER_LENGTHS.map((l) => ({ value: l, label: `${l}   ${barkerPattern(l)}` }))}
          />
        ) : s.code.family === 'frank' ? (
          <SelectField
            label="Order M (L = M²)"
            tip="codeLength"
            disabled={!s.code.enabled}
            value={Math.round(Math.sqrt(codeL))}
            onChange={(m) => lab.update('signal.code.length', m * m)}
            options={FRANK_ORDERS.map((m) => ({ value: m, label: `M = ${m}   (L = ${m * m})` }))}
          />
        ) : (
          <NumberField label="Length L" path="signal.code.length" min={P4_MIN} max={P4_MAX} step={1} integer tip="codeLength" disabled={!s.code.enabled} />
        )}
        {s.code.enabled && s.pulse.enabled ? (
          <>
            <Readout label={<Tex>{'T_c=\\tau/L'}</Tex>} value={`${formatEngineering(tau / codeL, 's')} (L = ${codeL})`} />
            <Readout label={<Tex>{'B\\approx 1/T_c,\\ TB\\approx L'}</Tex>} value={`${formatEngineering(codeL / tau, 'Hz')}, TB ≈ ${codeL}`} />
            {s.code.family === 'barker' ? <Readout label="Expected PSLR = 1/L" value={`${formatNumber(20 * Math.log10(1 / codeL), 3)} dB`} /> : null}
            <Note>The f_inst overlay shows the carrier and chirp only; the code&rsquo;s phase steps appear in the spectrogram and in the Pulse compression tab.</Note>
          </>
        ) : null}
        {s.code.enabled && !s.pulse.enabled ? <Note>A phase code is applied across the pulse — enable the pulse envelope.</Note> : null}
      </Section>

      <Section title="Modulation & noise" color="modulation" level="expert" resetKey="am" defaultOpen={false}>
        <ToggleField label="Amplitude modulation" path="signal.am.enabled" tip="am" />
        {s.am.enabled ? (
          <>
            <NumberField label="Depth μ" path="signal.am.depth" min={0} max={1} step={0.01} tip="amDepth" />
            <EngineeringInput label="Modulating frequency f_m" path="signal.am.frequencyHz" kind="freq" min={1e3} max={2e9} tip="amFreq" />
          </>
        ) : null}
        <ToggleField label="Additive white noise" path="signal.noise.enabled" tip="noise" />
        {s.noise.enabled ? <NumberField label="Noise RMS" path="signal.noise.rms" min={0} max={1} step={0.001} tip="noiseRms" /> : null}
      </Section>

      <Section title="Sampling" color="sampling" resetKey="sampling" isolateKeys={['sampling']}>
        <Gate level="advanced">
          <div className="flex items-center justify-between py-1">
            <FieldLabel label="Mode" tip="samplingMode" />
            <Segmented
              size="xs"
              ariaLabel="Sampling mode"
              value={s.sampling.mode}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' },
              ]}
              onChange={(v) => lab.update('signal.sampling.mode', v)}
            />
          </div>
        </Gate>
        <EngineeringInput
          label="Sample rate fₛ"
          path="signal.sampling.sampleRateHz"
          value={fs}
          kind="freq"
          min={1e6}
          max={200e9}
          hardMin={1}
          hardMax={1e13}
          tip="fs"
          hint={s.sampling.mode === 'auto' ? 'Auto mode — editing switches to manual.' : undefined}
        />
        <Gate level="advanced">
          <SelectField
            label="Samples N"
            tip="sampleCount"
            value={SAMPLE_COUNTS.includes(n) ? n : -1}
            onChange={(v) => v > 0 && lab.update('signal.sampling.sampleCount', v)}
            options={[...(SAMPLE_COUNTS.includes(n) ? [] : [{ value: -1, label: `${n} (custom)` }]), ...SAMPLE_COUNTS.map((c) => ({ value: c, label: c.toLocaleString('en-US') }))]}
          />
          <EngineeringInput
            label="Observation T_obs = N/fₛ"
            path="signal.sampling.sampleCount"
            value={T}
            kind="time"
            min={1e-9}
            max={1e-3}
            hardMin={1e-12}
            hardMax={10}
            tip="observation"
            lock={false}
            onCommit={(t) => lab.update('signal.sampling.sampleCount', Math.round(t * fs))}
          />
        </Gate>
        <Readout label={<Tex>{'f_N = f_s/2'}</Tex>} value={formatEngineering(fs / 2, 'Hz', 4)} />
        <Readout label={<Tex>{'\\Delta f = f_s/N \\approx 1/T_{\\text{obs}}'}</Tex>} value={formatEngineering(fs / n, 'Hz')} title="DFT bin spacing — not the physical bandwidth" />
        <Readout label="Est. highest content" value={`${formatEngineering(ext.fMaxHz, 'Hz')}${ext.unbounded ? ' (tails unbounded)' : ''}`} />
        <Gate level="advanced">
          {s.sampling.mode === 'manual' ? (
            <div className="py-1">
              <SmallButton
                onClick={() => {
                  const a = autoSampling(s);
                  lab.updateMany([
                    ['signal.sampling.sampleRateHz', a.sampleRateHz],
                    ['signal.sampling.sampleCount', a.sampleCount],
                  ]);
                }}
                ariaLabel="Choose sample rate and length automatically"
              >
                <Wand2 size={12} aria-hidden /> Auto-fit fₛ and N
              </SmallButton>
            </div>
          ) : null}
          <ToggleField label="Aliasing demonstration (physical reference)" path="signal.sampling.aliasingDemo" tip="aliasingDemo" />
          <ToggleField label="ADC quantization" path="signal.sampling.quantizationEnabled" tip="quantization" />
          {s.sampling.quantizationEnabled ? <NumberField label="Resolution" path="signal.sampling.bits" min={1} max={16} integer suffix="bits" tip="bits" /> : null}
        </Gate>
        <Note>
          Physical waveform → physical spectrum → sampling → correct representation or aliasing. Sampling does not create bandwidth; it determines whether the existing spectrum is represented
          correctly.
        </Note>
      </Section>
    </div>
  );
}
