'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Experiment, SignalType, UiMode } from '@/types/signal';
import { buildCompareExperiment, buildPresetById, buildPresetExperiment, fitFrequencyRange, fitTimeRange, applyLocks } from '@/lib/presets/apply';
import { getPreset } from '@/lib/presets/presets';
import { signalTypeTemplate } from '@/lib/presets/defaults';
import { isolate as isolateExperiment, type IsolateKey } from '@/lib/presets/isolate';
import { deepMerge, getPath, setPath } from '@/lib/state/path';
import { experimentToQuery, queryToExperiment } from '@/lib/state/url';
import { autoSampling, estimateSpectralExtent, resolveSampling } from '@/lib/dsp/sampling';
import { explainChange, type Explanation } from '@/lib/education/explanations';
import type { LabApi, SectionKey, WorkspaceTab } from './context';

interface Initial {
  exp: Experiment;
  presetId: string;
  mode: UiMode;
  compare: Experiment | null;
  tab: WorkspaceTab;
}

function initialState(): Initial {
  if (typeof window !== 'undefined') {
    try {
      const r = queryToExperiment(window.location.search);
      if (r) {
        const p = getPreset(r.presetId);
        return {
          exp: r.experiment,
          presetId: r.presetId,
          mode: r.mode ?? 'basic',
          compare: p ? buildCompareExperiment(p) : null,
          tab: p?.tab ?? 'measurements',
        };
      }
    } catch {
      /* ignore malformed URLs */
    }
  }
  return { exp: buildPresetById('default'), presetId: 'default', mode: 'basic', compare: null, tab: 'measurements' };
}

/** Paths whose change should refresh the explanation banner. */
function nyquistOk(exp: Experiment): boolean {
  const { fs } = resolveSampling(exp.signal);
  return estimateSpectralExtent(exp.signal).fMaxHz <= fs / 2;
}

export function useLabState() {
  const [init] = useState(initialState);
  const [exp, setExp] = useState<Experiment>(init.exp);
  const [presetId, setPresetId] = useState(init.presetId);
  const [mode, setMode] = useState<UiMode>(init.mode);
  const [locks, setLocks] = useState<string[]>([]);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [undo, setUndo] = useState<{ exp: Experiment; label: string } | null>(null);
  const [compare, setCompare] = useState<Experiment | null>(init.compare);
  const [tab, setTab] = useState<WorkspaceTab>(init.tab);
  const expRef = useRef(exp);

  useEffect(() => {
    expRef.current = exp;
  }, [exp]);

  // Keep a shareable URL in the address bar (debounced, no history entries).
  useEffect(() => {
    const h = window.setTimeout(() => {
      try {
        const q = experimentToQuery(exp, presetId, mode);
        window.history.replaceState(null, '', q ? `?${q}` : window.location.pathname);
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(h);
  }, [exp, presetId, mode]);

  const commit = useCallback((next: Experiment, changed?: { path: string; prev: unknown; value: unknown }) => {
    setExp(next);
    if (changed) {
      const e = explainChange(changed.path, changed.prev, changed.value, { nyquistOk: nyquistOk(next) });
      if (e) setExplanation(e);
    }
  }, []);

  const transform = useCallback((cur: Experiment, path: string, value: unknown): Experiment => {
    // Editing sampling numbers in auto mode switches to manual, seeded with the auto values.
    if ((path === 'signal.sampling.sampleRateHz' || path === 'signal.sampling.sampleCount') && cur.signal.sampling.mode === 'auto') {
      const a = autoSampling(cur.signal);
      cur = setPath(cur, 'signal.sampling', { ...cur.signal.sampling, mode: 'manual', sampleRateHz: a.sampleRateHz, sampleCount: a.sampleCount });
    }
    if (path === 'signal.signalType') {
      const patch = signalTypeTemplate(value as SignalType, cur.signal);
      return { ...cur, signal: deepMerge(cur.signal, patch) };
    }
    if (path === 'signal.sampling.mode' && value === 'manual' && cur.signal.sampling.mode === 'auto') {
      const a = autoSampling(cur.signal);
      return setPath(cur, 'signal.sampling', { ...cur.signal.sampling, mode: 'manual', sampleRateHz: a.sampleRateHz, sampleCount: a.sampleCount });
    }
    if (path === 'analysis.cursors.enabled' && value === true && cur.analysis.cursors.t1 === cur.analysis.cursors.t2) {
      const { fs, n } = resolveSampling(cur.signal);
      const T = n / fs;
      const r = cur.analysis.time.range;
      const lo = r.mode === 'manual' ? r.min : 0;
      const hi = r.mode === 'manual' ? r.max : T;
      const f = cur.analysis.spectrum.range;
      const fl = f.mode === 'manual' ? f.min : 0;
      const fh = f.mode === 'manual' ? f.max : fs / 2;
      cur = setPath(cur, 'analysis.cursors', {
        enabled: true,
        t1: lo + 0.3 * (hi - lo),
        t2: lo + 0.7 * (hi - lo),
        f1: fl + 0.35 * (fh - fl),
        f2: fl + 0.65 * (fh - fl),
      });
      return cur;
    }
    return setPath(cur, path, value);
  }, []);

  const update = useCallback(
    (path: string, value: unknown) => {
      const cur = expRef.current;
      const prev = getPath(cur, path);
      if (Object.is(prev, value)) return;
      const next = transform(cur, path, value);
      expRef.current = next;
      commit(next, { path, prev, value });
    },
    [commit, transform],
  );

  const updateMany = useCallback(
    (entries: [string, unknown][]) => {
      let cur = expRef.current;
      const first = entries[0];
      const prev = first ? getPath(cur, first[0]) : undefined;
      for (const [p, v] of entries) cur = transform(cur, p, v);
      expRef.current = cur;
      commit(cur, first ? { path: first[0], prev, value: first[1] } : undefined);
    },
    [commit, transform],
  );

  const remember = useCallback((label: string) => setUndo({ exp: expRef.current, label }), []);

  const applyPreset = useCallback(
    (id: string) => {
      const p = getPreset(id);
      if (!p) return;
      remember(`Loaded “${p.name}”`);
      const next = buildPresetExperiment(p, expRef.current, locks);
      expRef.current = next;
      setExp(next);
      setPresetId(id);
      const cmp = buildCompareExperiment(p);
      if (cmp) setCompare(applyLocks(cmp, next, []));
      if (p.tab) setTab(p.tab);
      setExplanation({ title: p.name, text: p.description });
    },
    [locks, remember],
  );

  const fitTime = useCallback(() => {
    const next = setPath(expRef.current, 'analysis.time.range', fitTimeRange(expRef.current));
    expRef.current = next;
    setExp(next);
  }, []);

  const fitFrequency = useCallback(() => {
    const next = setPath(expRef.current, 'analysis.spectrum.range', fitFrequencyRange(expRef.current));
    expRef.current = next;
    setExp(next);
  }, []);

  const isolate = useCallback(
    (key: IsolateKey) => {
      remember('Isolated effect');
      let next = applyLocks(isolateExperiment(key, expRef.current), expRef.current, locks);
      next = setPath(next, 'analysis.time.range', fitTimeRange(next));
      next = setPath(next, 'analysis.spectrum.range', fitFrequencyRange(next));
      expRef.current = next;
      setExp(next);
      setExplanation({
        title: 'Effect isolated',
        text: 'Unrelated parameters were reset to a clean reference state (single coherent pulse, no jitter/chirp/noise, adequate sampling). Change only this parameter to see its causal effect.',
      });
    },
    [locks, remember],
  );

  const resetSection = useCallback(
    (key: SectionKey) => {
      const base = buildPresetById(presetId);
      const cur = expRef.current;
      let next: Experiment;
      if (key === 'general') {
        next = { ...cur, signal: { ...cur.signal, signalType: base.signal.signalType, amplitude: base.signal.amplitude, amplitudeUnit: base.signal.amplitudeUnit } };
      } else if (key === 'am') {
        next = { ...cur, signal: { ...cur.signal, am: base.signal.am, noise: base.signal.noise } };
      } else {
        next = setPath(cur, `signal.${key}`, getPath(base, `signal.${key}`));
      }
      remember(`Reset ${key}`);
      expRef.current = next;
      setExp(next);
    },
    [presetId, remember],
  );

  const resetExperiment = useCallback(() => {
    remember('Reset experiment');
    const next = buildPresetById('default');
    expRef.current = next;
    setExp(next);
    setPresetId('default');
    setCompare(null);
  }, [remember]);

  const resetToPreset = useCallback(() => {
    remember('Reset to preset');
    const next = buildPresetById(presetId);
    expRef.current = next;
    setExp(next);
  }, [presetId, remember]);

  const doUndo = useCallback(() => {
    if (!undo) return;
    expRef.current = undo.exp;
    setExp(undo.exp);
    setUndo(null);
  }, [undo]);

  const loadExperiment = useCallback(
    (e: Experiment) => {
      remember('Imported configuration');
      expRef.current = e;
      setExp(e);
    },
    [remember],
  );

  const isLocked = useCallback((path: string) => locks.includes(path.replace(/^signal\./, '')), [locks]);
  const toggleLock = useCallback((path: string) => {
    const p = path.replace(/^signal\./, '');
    setLocks((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));
  }, []);

  const api: LabApi = useMemo(
    () => ({ exp, mode, presetId, update, updateMany, isLocked, toggleLock, resetSection, isolate, fitTime, fitFrequency, applyPreset, setTab }),
    [exp, mode, presetId, update, updateMany, isLocked, toggleLock, resetSection, isolate, fitTime, fitFrequency, applyPreset],
  );

  return {
    api,
    exp,
    mode,
    setMode,
    presetId,
    locks,
    explanation,
    setExplanation,
    undo,
    doUndo,
    compare,
    setCompare,
    tab,
    setTab,
    resetExperiment,
    resetToPreset,
    loadExperiment,
  };
}
