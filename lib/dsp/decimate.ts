/**
 * Min/max decimation for display: each output bucket keeps its minimum and
 * maximum (in original order), so peaks and envelopes survive while the
 * number of plotted points stays bounded. Only for rendering — never for
 * analysis.
 */

export function minMaxIndices(y: ArrayLike<number>, i0: number, i1: number, maxPoints: number): number[] {
  const a = Math.max(0, i0);
  const b = Math.min(y.length - 1, i1);
  const n = b - a + 1;
  if (n <= 0) return [];
  if (n <= maxPoints) {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = a + i;
    return out;
  }
  const buckets = Math.max(1, Math.floor(maxPoints / 2));
  const size = n / buckets;
  const out: number[] = [];
  for (let bkt = 0; bkt < buckets; bkt++) {
    const s = a + Math.floor(bkt * size);
    const e = Math.min(b, a + Math.floor((bkt + 1) * size) - 1);
    let mi = s;
    let ma = s;
    for (let i = s; i <= e; i++) {
      const v = y[i];
      if (!(v >= y[mi])) mi = i;
      if (!(v <= y[ma])) ma = i;
    }
    if (mi === ma) out.push(mi);
    else if (mi < ma) out.push(mi, ma);
    else out.push(ma, mi);
  }
  return out;
}

export function pick<T extends ArrayLike<number>>(src: T, idx: number[], scale = 1): number[] {
  const out = new Array<number>(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = src[idx[i]] * scale;
  return out;
}

/** Index range [i0, i1] of an ascending array covering [lo, hi] plus a margin. */
export function indexRange(x: ArrayLike<number>, lo: number, hi: number): [number, number] {
  const n = x.length;
  if (!n) return [0, -1];
  let a = 0;
  let b = n - 1;
  let l = 0;
  let r = n - 1;
  while (l < r) {
    const m = (l + r) >> 1;
    if (x[m] < lo) l = m + 1;
    else r = m;
  }
  a = Math.max(0, l - 1);
  l = 0;
  r = n - 1;
  while (l < r) {
    const m = (l + r + 1) >> 1;
    if (x[m] > hi) r = m - 1;
    else l = m;
  }
  b = Math.min(n - 1, l + 1);
  return [a, b];
}
