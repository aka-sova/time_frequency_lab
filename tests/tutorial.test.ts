import { describe, expect, it } from 'vitest';
import { placeCard, type Rect } from '@/lib/tutorial/position';
import { TUTORIAL_STEPS, type TutorialApi, type TutorialContext } from '@/lib/tutorial/steps';
import { PRESETS } from '@/lib/presets/presets';

const vp = { w: 1200, h: 800 };
const card = { w: 400, h: 240 };
const r = (top: number, left: number, width: number, height: number): Rect => ({ top, left, width, height });
const inside = (p: { top: number; left: number }) => p.top >= 0 && p.left >= 0 && p.top + card.h <= vp.h && p.left + card.w <= vp.w;
const overlaps = (p: { top: number; left: number }, t: Rect) => p.left < t.left + t.width && p.left + card.w > t.left && p.top < t.top + t.height && p.top + card.h > t.top;

describe('placeCard', () => {
  it('centres the card when there is no target', () => {
    const p = placeCard(null, card, vp);
    expect(p.placement).toBe('center');
    expect(p.left).toBe((vp.w - card.w) / 2);
    expect(p.top).toBe((vp.h - card.h) / 2);
  });

  it('puts the card below a small target when there is room', () => {
    const t = r(60, 500, 200, 30);
    const p = placeCard(t, card, vp, 'bottom');
    expect(p.placement).toBe('bottom');
    expect(p.top).toBeGreaterThanOrEqual(t.top + t.height);
    expect(inside(p)).toBe(true);
    expect(overlaps(p, t)).toBe(false);
  });

  it('flips above when there is no room below', () => {
    const t = r(700, 500, 200, 40);
    const p = placeCard(t, card, vp, 'bottom');
    expect(p.placement).toBe('top');
    expect(p.top + card.h).toBeLessThanOrEqual(t.top);
    expect(inside(p)).toBe(true);
  });

  it('uses a side when neither above nor below fits', () => {
    const t = r(100, 100, 100, 650); // tall and thin on the left
    const p = placeCard(t, card, vp, 'bottom');
    expect(p.placement).toBe('right');
    expect(p.left).toBeGreaterThanOrEqual(t.left + t.width);
    expect(overlaps(p, t)).toBe(false);
  });

  it('keeps the card inside the viewport horizontally (clamping)', () => {
    const t = r(60, 1150, 40, 30); // at the right edge
    const p = placeCard(t, card, vp, 'bottom');
    expect(p.left + card.w).toBeLessThanOrEqual(vp.w);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });

  it('falls back to the bottom of the viewport for a target that covers everything', () => {
    const p = placeCard(r(0, 0, 1200, 800), card, vp, 'bottom');
    expect(p.placement).toBe('fallback');
    expect(inside(p)).toBe(true);
  });

  it('honours the preferred side when it fits', () => {
    const t = r(300, 400, 200, 100);
    expect(placeCard(t, card, vp, 'top').placement).toBe('top');
    expect(placeCard(t, card, vp, 'right').placement).toBe('right');
  });
});

describe('tutorial steps', () => {
  it('has a reasonable number of uniquely identified steps', () => {
    expect(TUTORIAL_STEPS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(TUTORIAL_STEPS.map((s) => s.id)).size).toBe(TUTORIAL_STEPS.length);
  });

  it('every step has a title and body text', () => {
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.trim().length, s.id).toBeGreaterThan(0);
      expect(s.body.length, s.id).toBeGreaterThan(0);
      for (const p of s.body) expect(p.trim().length, s.id).toBeGreaterThan(0);
    }
  });

  it('starts and ends without a target (centred welcome / farewell)', () => {
    expect(TUTORIAL_STEPS[0].target).toBeUndefined();
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].target).toBeUndefined();
  });

  it('every target is a non-empty CSS selector', () => {
    for (const s of TUTORIAL_STEPS) if (s.target !== undefined) expect(s.target.trim().length, s.id).toBeGreaterThan(0);
  });

  const ctx: TutorialContext = { mode: 'basic', presetId: 'default', tab: 'measurements', hasA: false };
  const calls: string[] = [];
  const api: TutorialApi = {
    setMode: (m) => calls.push(`mode:${m}`),
    applyPreset: (id) => calls.push(`preset:${id}`),
    setTab: (t) => calls.push(`tab:${t}`),
    saveA: () => calls.push('saveA'),
  };

  it('action steps are not complete in the starting state, and have a prompt and a "do it for me"', () => {
    const actionSteps = TUTORIAL_STEPS.filter((s) => s.action);
    expect(actionSteps.length).toBeGreaterThanOrEqual(5);
    for (const s of actionSteps) {
      expect(s.action!.prompt.trim().length, s.id).toBeGreaterThan(0);
      expect(s.action!.done(ctx), s.id).toBe(false);
      expect(typeof s.action!.perform, s.id).toBe('function');
    }
  });

  it('"do it for me" really satisfies each action (simulated state)', () => {
    for (const s of TUTORIAL_STEPS.filter((x) => x.action)) {
      calls.length = 0;
      s.action!.perform(api);
      expect(calls.length, s.id).toBeGreaterThan(0);
      // Apply the recorded effects to a fresh context and check the condition.
      const next: TutorialContext = { ...ctx };
      for (const c of calls) {
        const [k, v] = c.split(':');
        if (k === 'mode') next.mode = v as TutorialContext['mode'];
        if (k === 'preset') next.presetId = v;
        if (k === 'tab') next.tab = v as TutorialContext['tab'];
        if (k === 'saveA') next.hasA = true;
      }
      expect(s.action!.done(next), s.id).toBe(true);
    }
  });

  it('every preset used by the tutorial exists', () => {
    const ids = new Set(PRESETS.map((p) => p.id));
    for (const s of TUTORIAL_STEPS) {
      calls.length = 0;
      s.action?.perform(api);
      s.onEnter?.(api);
      for (const c of calls) if (c.startsWith('preset:')) expect(ids.has(c.slice(7)), `${s.id}: ${c}`).toBe(true);
    }
  });

  it('covers the main areas: mode, preset, plots, every workspace tab', () => {
    const text = TUTORIAL_STEPS.map((s) => `${s.id} ${s.title}`).join(' ').toLowerCase();
    for (const word of ['mode', 'preset', 'time', 'spectrum', 'power', 'instrument', 'experiments', 'compare', 'sweep', 'leakage', 'synthesis', 'theory']) expect(text, word).toContain(word);
  });
});
