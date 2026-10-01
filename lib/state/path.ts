/** Immutable get/set by dotted path, plus deep merge — used for presets, locks, URL state. */

type Obj = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Obj)[key];
  }
  return cur;
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const rec = (node: unknown, i: number): unknown => {
    const src = (node && typeof node === 'object' ? node : {}) as Obj;
    const copy: Obj = { ...src };
    copy[keys[i]] = i === keys.length - 1 ? value : rec(src[keys[i]], i + 1);
    return copy;
  };
  return rec(obj, 0) as T;
}

export function isPlainObject(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch) || !isPlainObject(base)) return (patch === undefined ? base : (patch as T));
  const out: Obj = { ...(base as Obj) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Dotted paths of all leaf values that differ between a and b. */
export function diffPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const out: string[] = [];
    for (const k of keys) out.push(...diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
    return out;
  }
  return Object.is(a, b) ? [] : [prefix];
}
